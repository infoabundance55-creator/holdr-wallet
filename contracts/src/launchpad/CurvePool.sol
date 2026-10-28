// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {HoldrToken} from "./HoldrToken.sol";
import {LaunchParams, ILaunchpadFactory, IHoldrMigrator} from "./interfaces/ILaunchpad.sol";

/// @title CurvePool
/// @notice Bonding curve for one Holdr token, priced in USDG. Constant product with a virtual USDG
///         reserve, tuned so the last curve price equals the Uniswap opening price at graduation.
/// @dev Deployed as an EIP-1167 clone per token.
///
///      State is two numbers: realUsdg (USDG in the curve) and tokensSold. From them:
///        x = virtualUsdg + realUsdg          (curve's USDG side)
///        y = initialVirtualTokens - tokensSold (curve's token side)
///      Every trade keeps x * y from going down: the side paid out is always rounded in the pool's
///      favour, and fees and surcharges round up. Since x * y starts at virtualUsdg * initialVirtualTokens, selling back every token
///      in circulation can never take x below virtualUsdg, so realUsdg always covers all sells.
///
///      With graduation at G USDG, 800M tokens on the curve and 200M for Uniswap:
///        virtualUsdg = G / 3 (rounded down, plus 1), initialVirtualTokens = 800M * (virtualUsdg + G) / G (about 1,066.67M).
contract CurvePool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant CURVE_SUPPLY = 800_000_000 ether;
    uint256 public constant LP_SUPPLY = 200_000_000 ether;
    uint256 private constant BPS = 10_000;
    uint256 private constant SURCHARGE_SECONDS = 5;

    // ---------------------------------------------------------------- set once at launch

    address public factory;
    HoldrToken public token;
    IERC20 public usdg;
    address public migrator;
    uint64 public launchTime;
    uint16 public feeBps;
    uint16 public creatorShareBps;
    uint16[5] internal _surchargeBps;
    uint256 public gradThreshold;
    uint256 public firstBuyMaxTokens;
    uint256 public virtualUsdg;
    uint256 public initialVirtualTokens;

    // ---------------------------------------------------------------- live state

    uint256 public realUsdg;
    uint256 public tokensSold;
    bool public graduated;
    address public creator;
    address public pendingCreator;
    mapping(address => uint256) public creatorFeesOf;
    uint256 public protocolFees;

    struct BuyQuote {
        uint256 usdgUsed; // what the buyer pays (less than asked only for the graduating buy)
        uint256 fee;
        uint256 surcharge;
        uint256 toCurve; // usdgUsed - fee, includes the surcharge
        uint256 tokensOut;
    }

    // ---------------------------------------------------------------- events

    event Trade(
        address indexed trader,
        bool indexed isBuy,
        uint256 usdgAmount, // buy: paid; sell: received
        uint256 tokenAmount,
        uint256 fee,
        uint256 surcharge,
        uint256 realUsdgAfter,
        uint256 tokensSoldAfter
    );
    event Graduated(
        address indexed token, address indexed migrator, uint256 usdg, uint256 tokens, uint256 tokensBurned
    );
    event CreatorFeesClaimed(address indexed creator, address indexed to, uint256 amount);
    event ProtocolFeesWithdrawn(address indexed treasury, uint256 amount);
    event CreatorTransferStarted(address indexed current, address indexed pending);
    event CreatorTransferred(address indexed previous, address indexed current);

    // ---------------------------------------------------------------- errors

    error AlreadyInitialized();
    error OnlyFactory();
    error OnlyCreator();
    error OnlyPendingCreator();
    error ZeroAddress();
    error ZeroAmount();
    error Expired();
    error BuyPaused();
    error BuyTooLarge(uint256 max);
    error FirstBuyTooLarge();
    error SlippageExceeded();
    error IsGraduated();
    error NotEnoughSold();
    error CurveExhausted();
    error UsdgNotReceived();
    error NothingToClaim();

    constructor() {
        factory = address(1); // locks the implementation contract
    }

    /// @dev Called once by the factory right after cloning. The token's full supply is already here.
    function initialize(address token_, address usdg_, address creator_, LaunchParams calldata p) external {
        if (factory != address(0)) revert AlreadyInitialized();
        factory = msg.sender;
        token = HoldrToken(token_);
        usdg = IERC20(usdg_);
        creator = creator_;
        migrator = p.migrator;
        launchTime = uint64(block.timestamp);
        feeBps = p.feeBps;
        creatorShareBps = p.creatorShareBps;
        _surchargeBps = p.surchargeBps;
        gradThreshold = p.gradThreshold;
        firstBuyMaxTokens = p.firstBuyMaxTokens;

        // virtualUsdg is strictly above G * LP / (CURVE - LP) = G / 3 and initialVirtualTokens rounds
        // down. Together this guarantees that at graduation (a) no more than CURVE_SUPPLY is sold
        // and (b) the last curve price is not above gradThreshold / LP_SUPPLY, the Uniswap opening
        // price (the locker rounds that opening price up in USDG terms). The +1 leaves a margin
        // for initialVirtualTokens' rounding even when G is divisible by 3.
        uint256 v = p.gradThreshold * LP_SUPPLY / (CURVE_SUPPLY - LP_SUPPLY) + 1;
        virtualUsdg = v;
        initialVirtualTokens = CURVE_SUPPLY * (v + p.gradThreshold) / p.gradThreshold;
    }

    // ---------------------------------------------------------------- trading

    /// @notice Buys tokens with USDG. If this buy reaches the graduation threshold, only the
    ///         USDG needed is taken and the token graduates in the same transaction.
    /// @param usdgIn       Most USDG to spend, fee included.
    /// @param minTokensOut Fewest tokens to accept.
    /// @param deadline     Latest block timestamp.
    function buy(uint256 usdgIn, uint256 minTokensOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert Expired();
        if (ILaunchpadFactory(factory).paused()) revert BuyPaused();
        BuyQuote memory q = _quoteBuy(usdgIn, true);
        _checkBuy(q, minTokensOut);

        uint256 before = usdg.balanceOf(address(this));
        usdg.safeTransferFrom(msg.sender, address(this), q.usdgUsed);
        if (usdg.balanceOf(address(this)) - before != q.usdgUsed) revert UsdgNotReceived();

        _applyBuy(msg.sender, q);
        return q.tokensOut;
    }

    /// @notice The creator's optional buy inside the launch transaction: no surcharge, capped at
    ///         firstBuyMaxTokens. The factory has already moved the USDG here.
    function firstBuy(address buyer, uint256 usdgIn, uint256 minTokensOut) external nonReentrant returns (uint256) {
        if (msg.sender != factory) revert OnlyFactory();
        BuyQuote memory q = _quoteBuy(usdgIn, false);
        if (q.tokensOut > firstBuyMaxTokens) revert FirstBuyTooLarge();
        _checkBuy(q, minTokensOut);
        _applyBuy(buyer, q);
        return q.tokensOut;
    }

    /// @notice Sells tokens for USDG. Never paused. No approval needed: the token lets its curve pull.
    /// @param tokensIn    Tokens to sell.
    /// @param minUsdgOut  Least USDG to receive, after the fee.
    /// @param deadline    Latest block timestamp.
    function sell(uint256 tokensIn, uint256 minUsdgOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 usdgOut)
    {
        if (block.timestamp > deadline) revert Expired();
        uint256 gross;
        uint256 fee;
        (usdgOut, fee, gross) = _quoteSell(tokensIn);
        if (usdgOut == 0 || usdgOut < minUsdgOut) revert SlippageExceeded();

        realUsdg -= gross;
        tokensSold -= tokensIn;
        _accrueFee(fee);

        IERC20(address(token)).safeTransferFrom(msg.sender, address(this), tokensIn);
        usdg.safeTransfer(msg.sender, usdgOut);
        emit Trade(msg.sender, false, usdgOut, tokensIn, fee, 0, realUsdg, tokensSold);
    }

    // ---------------------------------------------------------------- fees and creator

    /// @notice Sends the caller's accrued creator fees to `to`.
    function claimCreatorFees(address to) external nonReentrant returns (uint256 amount) {
        if (to == address(0)) revert ZeroAddress();
        amount = creatorFeesOf[msg.sender];
        if (amount == 0) revert NothingToClaim();
        creatorFeesOf[msg.sender] = 0;
        usdg.safeTransfer(to, amount);
        emit CreatorFeesClaimed(msg.sender, to, amount);
    }

    /// @notice Sends the platform's accrued fees to the treasury. Anyone may call it.
    function withdrawProtocolFees() external nonReentrant returns (uint256 amount) {
        amount = protocolFees;
        if (amount == 0) revert NothingToClaim();
        protocolFees = 0;
        address treasury = ILaunchpadFactory(factory).treasury();
        usdg.safeTransfer(treasury, amount);
        emit ProtocolFeesWithdrawn(treasury, amount);
    }

    /// @notice Step 1 of handing the creator role to another wallet. Address zero cancels.
    function proposeCreator(address newCreator) external {
        if (msg.sender != creator) revert OnlyCreator();
        pendingCreator = newCreator;
        emit CreatorTransferStarted(msg.sender, newCreator);
    }

    /// @notice Step 2: the new wallet accepts. Fees earned so far stay claimable by the old one:
    ///         after graduation, the Uniswap fees not yet collected are collected first.
    function acceptCreator() external nonReentrant {
        if (msg.sender != pendingCreator) revert OnlyPendingCreator();
        if (graduated) IHoldrMigrator(migrator).collectFees(address(token));
        address previous = creator;
        creator = msg.sender;
        pendingCreator = address(0);
        emit CreatorTransferred(previous, msg.sender);
    }

    // ---------------------------------------------------------------- views

    /// @notice What a buy of `usdgIn` would get right now (surcharge included).
    function quoteBuy(uint256 usdgIn) external view returns (BuyQuote memory) {
        return _quoteBuy(usdgIn, true);
    }

    /// @notice What selling `tokensIn` would return right now, after the fee.
    function quoteSell(uint256 tokensIn) external view returns (uint256 usdgOut, uint256 fee) {
        (usdgOut, fee,) = _quoteSell(tokensIn);
    }

    /// @notice Current curve reserves: x is USDG (6 decimals), y is tokens (18 decimals).
    ///         Spot price in USDG per token = x / y, adjusted for decimals.
    function reserves() external view returns (uint256 x, uint256 y) {
        return (virtualUsdg + realUsdg, initialVirtualTokens - tokensSold);
    }

    /// @notice Anti-snipe surcharge in basis points for a buy made now.
    function currentSurchargeBps() public view returns (uint256) {
        uint256 elapsed = block.timestamp - launchTime;
        return elapsed < SURCHARGE_SECONDS ? _surchargeBps[elapsed] : 0;
    }

    function surchargeSchedule() external view returns (uint16[5] memory) {
        return _surchargeBps;
    }

    // ---------------------------------------------------------------- internals

    function _quoteBuy(uint256 usdgIn, bool withSurcharge) internal view returns (BuyQuote memory q) {
        if (graduated) revert IsGraduated();
        if (usdgIn == 0) revert ZeroAmount();
        q.usdgUsed = usdgIn;
        q.fee = Math.mulDiv(usdgIn, feeBps, BPS, Math.Rounding.Ceil);
        q.toCurve = usdgIn - q.fee;

        uint256 room = gradThreshold - realUsdg;
        if (q.toCurve >= room) {
            // graduating buy: take only what fills the curve exactly
            q.toCurve = room;
            q.usdgUsed = Math.min(usdgIn, Math.ceilDiv(room * BPS, BPS - feeBps));
            q.fee = q.usdgUsed - room;
        }
        if (withSurcharge) {
            q.surcharge = Math.min(Math.mulDiv(q.usdgUsed, currentSurchargeBps(), BPS, Math.Rounding.Ceil), q.toCurve);
        }

        uint256 x = virtualUsdg + realUsdg;
        uint256 y = initialVirtualTokens - tokensSold;
        uint256 newY = Math.ceilDiv(x * y, x + (q.toCurve - q.surcharge));
        q.tokensOut = y - newY;
        if (q.tokensOut > CURVE_SUPPLY - tokensSold) revert CurveExhausted();
    }

    function _quoteSell(uint256 tokensIn) internal view returns (uint256 usdgOut, uint256 fee, uint256 gross) {
        if (graduated) revert IsGraduated();
        if (tokensIn == 0) revert ZeroAmount();
        if (tokensIn > tokensSold) revert NotEnoughSold();
        uint256 x = virtualUsdg + realUsdg;
        uint256 y = initialVirtualTokens - tokensSold;
        uint256 newX = Math.ceilDiv(x * y, y + tokensIn);
        gross = x - newX; // <= realUsdg because x * y >= virtualUsdg * initialVirtualTokens
        fee = Math.mulDiv(gross, feeBps, BPS, Math.Rounding.Ceil);
        usdgOut = gross - fee;
    }

    function _checkBuy(BuyQuote memory q, uint256 minTokensOut) internal view {
        uint256 maxBuy = ILaunchpadFactory(factory).maxBuyUsdg();
        if (maxBuy != 0 && q.usdgUsed > maxBuy) revert BuyTooLarge(maxBuy);
        if (q.tokensOut == 0 || q.tokensOut < minTokensOut) revert SlippageExceeded();
    }

    function _applyBuy(address buyer, BuyQuote memory q) internal {
        realUsdg += q.toCurve;
        tokensSold += q.tokensOut;
        _accrueFee(q.fee);
        IERC20(address(token)).safeTransfer(buyer, q.tokensOut);
        emit Trade(buyer, true, q.usdgUsed, q.tokensOut, q.fee, q.surcharge, realUsdg, tokensSold);
        if (realUsdg == gradThreshold) _graduate();
    }

    function _accrueFee(uint256 fee) internal {
        uint256 toCreator = fee * creatorShareBps / BPS;
        creatorFeesOf[creator] += toCreator;
        protocolFees += fee - toCreator;
    }

    /// @dev Closes the curve, burns every token here except the 200M for Uniswap (unsold curve
    ///      tokens and any donations), and hands the liquidity to the migrator.
    function _graduate() internal {
        graduated = true;
        uint256 toBurn = token.balanceOf(address(this)) - LP_SUPPLY;
        if (toBurn != 0) token.burn(toBurn);
        uint256 usdgAmount = realUsdg;
        address m = migrator;
        IERC20(address(token)).safeTransfer(m, LP_SUPPLY);
        usdg.safeTransfer(m, usdgAmount);
        IHoldrMigrator(m).migrate(address(token), usdgAmount, LP_SUPPLY);
        emit Graduated(address(token), m, usdgAmount, LP_SUPPLY, toBurn);
    }
}
