// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {HoldrLaunchHook} from "./HoldrLaunchHook.sol";
import {HoldrToken} from "./HoldrToken.sol";
import {CurvePool} from "./CurvePool.sol";
import {IHoldrMigrator} from "./interfaces/ILaunchpad.sol";

interface ILaunchpadFactoryView {
    function poolOf(address token) external view returns (address);
    function treasury() external view returns (address);
}

/// @title HoldrLiquidityLocker
/// @notice Migrator and locker in one. At graduation it creates the official Uniswap v4 pool
///         (token / USDG, 1% fee, Holdr hook), adds the curve's 200M tokens and USDG as full-range
///         liquidity and keeps that position forever: there is no function that removes liquidity.
///         Anyone can call collectFees to pull the pool fees; they are split between the token's
///         creator and the platform with the same share as on the curve (70 / 30).
/// @dev The position is owned by this contract directly in the PoolManager (no position NFT), so
///      nothing can be transferred or withdrawn.
contract HoldrLiquidityLocker is IHoldrMigrator, IUnlockCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    uint24 public constant POOL_FEE = 10_000; // 1%
    int24 public constant TICK_SPACING = 200;
    uint256 private constant BPS = 10_000;
    uint256 private constant Q96 = 1 << 96;
    uint8 private constant ACTION_ADD = 1;
    uint8 private constant ACTION_COLLECT = 2;

    IPoolManager public immutable poolManager;
    address public immutable usdg;
    HoldrLaunchHook public immutable hook;
    address public immutable deployer;
    address public factory;

    struct Position {
        PoolKey key;
        address curvePool;
        uint128 liquidity;
    }

    mapping(address token => Position) internal _positions;
    /// @notice Fees waiting to be claimed: account => currency => amount.
    mapping(address account => mapping(address currency => uint256)) public owed;
    /// @notice Platform fees waiting to go to the treasury: currency => amount.
    mapping(address currency => uint256) public protocolOwed;

    event FactorySet(address indexed factory);
    event Migrated(
        address indexed token,
        PoolId indexed poolId,
        uint128 liquidity,
        uint160 sqrtPriceX96,
        uint256 usdgUsed,
        uint256 tokensUsed
    );
    event FeesCollected(address indexed token, address indexed creator, uint256 tokenFees, uint256 usdgFees);
    event Claimed(address indexed account, address indexed currency, address indexed to, uint256 amount);
    event ProtocolFeesWithdrawn(address indexed currency, address indexed treasury, uint256 amount);

    error OnlyDeployer();
    error FactoryAlreadySet();
    error ZeroAddress();
    error NotCurvePool();
    error AlreadyMigrated();
    error NotMigrated();
    error NotPoolManager();
    error NothingToClaim();

    /// @param hookSalt CREATE2 salt that gives the hook an address with only the
    ///                 BEFORE_INITIALIZE flag set (found off-chain, see script/HookMiner.sol).
    constructor(IPoolManager poolManager_, address usdg_, bytes32 hookSalt) {
        if (address(poolManager_) == address(0) || usdg_ == address(0)) revert ZeroAddress();
        poolManager = poolManager_;
        usdg = usdg_;
        deployer = msg.sender;
        hook = new HoldrLaunchHook{salt: hookSalt}(poolManager_);
    }

    /// @notice Links the launchpad factory, once. The factory is deployed after this contract
    ///         because it needs this contract's address in its rules.
    function setFactory(address factory_) external {
        if (msg.sender != deployer) revert OnlyDeployer();
        if (factory != address(0)) revert FactoryAlreadySet();
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
        emit FactorySet(factory_);
    }

    // ---------------------------------------------------------------- migration

    /// @inheritdoc IHoldrMigrator
    /// @dev Only the token's own curve pool can call this, in its graduation. The tokens and USDG
    ///      have already been transferred here. Leftover rounding dust: tokens are burned, USDG goes
    ///      to the platform.
    function migrate(address token, uint256 usdgAmount, uint256 tokenAmount) external nonReentrant {
        address f = factory;
        if (f == address(0) || msg.sender != ILaunchpadFactoryView(f).poolOf(token)) revert NotCurvePool();
        Position storage pos = _positions[token];
        if (pos.liquidity != 0) revert AlreadyMigrated();

        PoolKey memory key = poolKeyFor(token);
        bool tokenIs0 = Currency.unwrap(key.currency0) == token;
        (uint160 sqrtPriceX96, uint128 liquidity) = _priceAndLiquidity(tokenIs0, usdgAmount, tokenAmount);
        pos.key = key;
        pos.curvePool = msg.sender;
        pos.liquidity = liquidity;

        poolManager.initialize(key, sqrtPriceX96);
        BalanceDelta delta = abi.decode(poolManager.unlock(abi.encode(ACTION_ADD, token)), (BalanceDelta));
        uint256 used0 = uint256(uint128(-delta.amount0()));
        uint256 used1 = uint256(uint128(-delta.amount1()));
        (uint256 usedTokens, uint256 usedUsdg) = tokenIs0 ? (used0, used1) : (used1, used0);

        if (tokenAmount > usedTokens) HoldrToken(token).burn(tokenAmount - usedTokens);
        if (usdgAmount > usedUsdg) protocolOwed[usdg] += usdgAmount - usedUsdg;
        emit Migrated(token, key.toId(), liquidity, sqrtPriceX96, usedUsdg, usedTokens);
    }

    /// @dev Opening price usdgAmount / tokenAmount and the full-range liquidity those amounts give.
    function _priceAndLiquidity(bool tokenIs0, uint256 usdgAmount, uint256 tokenAmount)
        private
        pure
        returns (uint160 sqrtPriceX96, uint128 liquidity)
    {
        (uint256 amount0, uint256 amount1) = tokenIs0 ? (tokenAmount, usdgAmount) : (usdgAmount, tokenAmount);
        // Round so the opening USDG price is never below usdgAmount / tokenAmount, which keeps it
        // at or above the last curve price: up when the price is USDG per token (token is
        // currency0), down when it is tokens per USDG.
        sqrtPriceX96 = tokenIs0
            ? SafeCast.toUint160(Math.sqrt(FullMath.mulDivRoundingUp(amount1, 1 << 192, amount0), Math.Rounding.Ceil))
            : SafeCast.toUint160(Math.sqrt(FullMath.mulDiv(amount1, 1 << 192, amount0)));
        liquidity = _liquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(TickMath.minUsableTick(TICK_SPACING)),
            TickMath.getSqrtPriceAtTick(TickMath.maxUsableTick(TICK_SPACING)),
            amount0,
            amount1
        );
    }

    // ---------------------------------------------------------------- fees

    /// @notice Pulls the pool fees earned so far and splits them. Anyone may call it.
    function collectFees(address token) external nonReentrant returns (uint256 tokenFees, uint256 usdgFees) {
        Position storage pos = _positions[token];
        if (pos.liquidity == 0) revert NotMigrated();
        (uint256 fees0, uint256 fees1) =
            abi.decode(poolManager.unlock(abi.encode(ACTION_COLLECT, token)), (uint256, uint256));
        bool tokenIs0 = Currency.unwrap(pos.key.currency0) == token;
        (tokenFees, usdgFees) = tokenIs0 ? (fees0, fees1) : (fees1, fees0);

        CurvePool curve = CurvePool(pos.curvePool);
        address creator = curve.creator();
        uint256 share = curve.creatorShareBps();
        uint256 creatorTokens = tokenFees * share / BPS;
        uint256 creatorUsdg = usdgFees * share / BPS;
        owed[creator][token] += creatorTokens;
        owed[creator][usdg] += creatorUsdg;
        protocolOwed[token] += tokenFees - creatorTokens;
        protocolOwed[usdg] += usdgFees - creatorUsdg;
        emit FeesCollected(token, creator, tokenFees, usdgFees);
    }

    /// @notice Sends the caller's collected fees in `currency` (a token or USDG) to `to`.
    function claim(address currency, address to) external nonReentrant returns (uint256 amount) {
        if (to == address(0)) revert ZeroAddress();
        amount = owed[msg.sender][currency];
        if (amount == 0) revert NothingToClaim();
        owed[msg.sender][currency] = 0;
        IERC20(currency).safeTransfer(to, amount);
        emit Claimed(msg.sender, currency, to, amount);
    }

    /// @notice Sends the platform's collected fees in `currency` to the treasury. Anyone may call it.
    function withdrawProtocolFees(address currency) external nonReentrant returns (uint256 amount) {
        amount = protocolOwed[currency];
        if (amount == 0) revert NothingToClaim();
        protocolOwed[currency] = 0;
        address treasury = ILaunchpadFactoryView(factory).treasury();
        IERC20(currency).safeTransfer(treasury, amount);
        emit ProtocolFeesWithdrawn(currency, treasury, amount);
    }

    // ---------------------------------------------------------------- Uniswap callback

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (uint8 action, address token) = abi.decode(data, (uint8, address));
        Position storage pos = _positions[token];
        PoolKey memory key = pos.key;
        IPoolManager.ModifyLiquidityParams memory params = IPoolManager.ModifyLiquidityParams({
            tickLower: TickMath.minUsableTick(TICK_SPACING),
            tickUpper: TickMath.maxUsableTick(TICK_SPACING),
            liquidityDelta: 0,
            salt: bytes32(0)
        });

        if (action == ACTION_ADD) {
            params.liquidityDelta = int256(uint256(pos.liquidity));
            (BalanceDelta delta,) = poolManager.modifyLiquidity(key, params, "");
            _pay(key.currency0, uint256(uint128(-delta.amount0())));
            _pay(key.currency1, uint256(uint128(-delta.amount1())));
            return abi.encode(delta);
        }

        // ACTION_COLLECT: a zero-liquidity update returns the fees earned since the last one
        (BalanceDelta fees,) = poolManager.modifyLiquidity(key, params, "");
        uint256 fees0 = uint256(uint128(fees.amount0()));
        uint256 fees1 = uint256(uint128(fees.amount1()));
        if (fees0 != 0) poolManager.take(key.currency0, address(this), fees0);
        if (fees1 != 0) poolManager.take(key.currency1, address(this), fees1);
        return abi.encode(fees0, fees1);
    }

    function _pay(Currency currency, uint256 amount) private {
        poolManager.sync(currency);
        IERC20(Currency.unwrap(currency)).safeTransfer(address(poolManager), amount);
        poolManager.settle();
    }

    // ---------------------------------------------------------------- views

    /// @notice The official pool key for a token (whether or not it has graduated yet).
    function poolKeyFor(address token) public view returns (PoolKey memory key) {
        (address c0, address c1) = token < usdg ? (token, usdg) : (usdg, token);
        key = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });
    }

    function positionOf(address token) external view returns (Position memory) {
        return _positions[token];
    }

    // ---------------------------------------------------------------- liquidity math

    /// @dev Same as Uniswap's LiquidityAmounts.getLiquidityForAmounts for a price inside the range.
    function _liquidityForAmounts(uint160 sqrtP, uint160 sqrtA, uint160 sqrtB, uint256 amount0, uint256 amount1)
        private
        pure
        returns (uint128)
    {
        uint256 l0 = FullMath.mulDiv(amount0, FullMath.mulDiv(sqrtP, sqrtB, Q96), sqrtB - sqrtP);
        uint256 l1 = FullMath.mulDiv(amount1, Q96, sqrtP - sqrtA);
        return SafeCast.toUint128(Math.min(l0, l1));
    }
}
