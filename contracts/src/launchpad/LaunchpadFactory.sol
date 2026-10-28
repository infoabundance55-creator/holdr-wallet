// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {HoldrToken} from "./HoldrToken.sol";
import {CurvePool} from "./CurvePool.sol";
import {LaunchParams, IHoldrMigrator} from "./interfaces/ILaunchpad.sol";

/// @title LaunchpadFactory
/// @notice Launches Holdr tokens. Each launch clones one HoldrToken and one CurvePool and copies the
///         current rules into the pool, so later rule changes never touch tokens already launched.
/// @dev The owner is a Safe multisig. Rule changes wait 48 hours. Pausing stops launches and buys,
///      never sells or fee claims. The per-buy cap can only be raised or removed. The migrator
///      (the liquidity locker) is fixed at deployment, so no rule change can send graduation
///      money anywhere else.
contract LaunchpadFactory is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant CONFIG_DELAY = 48 hours;
    uint256 public constant MAX_FEE_BPS = 500;
    uint256 public constant MAX_TOTAL_BUY_COST_BPS = 9_900; // fee + surcharge
    uint256 public constant MIN_GRAD_THRESHOLD = 1_000e6;
    uint256 public constant MAX_GRAD_THRESHOLD = 1_000_000e6;
    uint256 public constant MAX_FIRST_BUY_TOKENS = 100_000_000 ether;
    uint256 public constant MAX_LAUNCH_FEE = 0.1 ether;

    struct Config {
        LaunchParams params;
        uint256 launchFee; // in ETH
        address treasury;
    }

    IERC20 public immutable usdg;
    address public immutable tokenImplementation;
    address public immutable poolImplementation;
    /// @notice Where every token's liquidity goes at graduation. Fixed forever.
    address public immutable migrator;

    Config internal _config;
    Config internal _pendingConfig;
    uint256 public pendingConfigEta; // 0 = nothing pending

    bool public paused;
    mapping(address => bool) public isPauser;
    uint256 public maxBuyUsdg; // 0 = no cap

    mapping(address => address) public poolOf; // token => curve pool
    uint256 public tokenCount;

    event TokenCreated(
        address indexed token,
        address indexed pool,
        address indexed creator,
        string name,
        string symbol,
        string metadataURI,
        uint256 launchFee
    );
    event ConfigProposed(uint256 eta, Config config);
    event ConfigExecuted(Config config);
    event ConfigCancelled();
    event PauserSet(address indexed account, bool allowed);
    event Paused(address indexed by);
    event Unpaused();
    event MaxBuyUpdated(uint256 maxBuyUsdg);
    event LaunchFeesWithdrawn(address indexed treasury, uint256 amount);

    error ZeroAddress();
    error InvalidConfig();
    error NoPendingConfig();
    error ConfigNotReady(uint256 eta);
    error LaunchPaused();
    error WrongLaunchFee(uint256 required);
    error BadName();
    error BadSymbol();
    error UsdgNotReceived();
    error NotPauser();
    error MaxBuyCanOnlyRise();
    error NothingToWithdraw();
    error EthTransferFailed();
    error RenounceDisabled();
    error MigratorIsFixed();
    error MigratorNotLinked();

    constructor(address initialOwner, IERC20 usdg_, Config memory config_, uint256 maxBuyUsdg_) Ownable(initialOwner) {
        if (address(usdg_) == address(0) || config_.params.migrator == address(0)) revert ZeroAddress();
        _validate(config_, config_.params.migrator);
        usdg = usdg_;
        migrator = config_.params.migrator;
        tokenImplementation = address(new HoldrToken());
        poolImplementation = address(new CurvePool());
        _config = config_;
        maxBuyUsdg = maxBuyUsdg_;
        emit ConfigExecuted(config_);
        emit MaxBuyUpdated(maxBuyUsdg_);
    }

    // ---------------------------------------------------------------- launch

    /// @notice Launches a token. Send exactly `launchFee()` in ETH. For a first buy, approve this
    ///         factory for `firstBuyUsdg` USDG first.
    /// @param name_         1 to 32 bytes.
    /// @param symbol_       1 to 10 bytes.
    /// @param metadataURI_  IPFS URI with the description, logo and links.
    /// @param firstBuyUsdg  USDG for the creator's first buy (0 for none); fee included, no surcharge.
    /// @param minTokensOut  Fewest tokens to accept for the first buy.
    function createToken(
        string calldata name_,
        string calldata symbol_,
        string calldata metadataURI_,
        uint256 firstBuyUsdg,
        uint256 minTokensOut
    ) external payable nonReentrant returns (address token, address pool) {
        if (paused) revert LaunchPaused();
        // the locker is linked to this factory after deployment; never launch before that
        if (IHoldrMigrator(migrator).factory() != address(this)) revert MigratorNotLinked();
        uint256 fee = _config.launchFee;
        if (msg.value != fee) revert WrongLaunchFee(fee);
        if (bytes(name_).length == 0 || bytes(name_).length > 32) revert BadName();
        if (bytes(symbol_).length == 0 || bytes(symbol_).length > 10) revert BadSymbol();

        (token, pool) = _deploy(name_, symbol_, metadataURI_);
        emit TokenCreated(token, pool, msg.sender, name_, symbol_, metadataURI_, fee);

        if (firstBuyUsdg != 0) _firstBuy(pool, firstBuyUsdg, minTokensOut);
    }

    function _deploy(string calldata name_, string calldata symbol_, string calldata metadataURI_)
        internal
        returns (address token, address pool)
    {
        token = Clones.clone(tokenImplementation);
        pool = Clones.clone(poolImplementation);
        CurvePool(pool).initialize(token, address(usdg), msg.sender, _config.params);
        HoldrToken(token).initialize(name_, symbol_, metadataURI_, pool);
        poolOf[token] = pool;
        ++tokenCount;
    }

    function _firstBuy(address pool, uint256 usdgIn, uint256 minTokensOut) internal {
        uint256 before = usdg.balanceOf(pool);
        usdg.safeTransferFrom(msg.sender, pool, usdgIn);
        if (usdg.balanceOf(pool) - before != usdgIn) revert UsdgNotReceived();
        CurvePool(pool).firstBuy(msg.sender, usdgIn, minTokensOut);
    }

    /// @notice Sends collected launch fees (ETH) to the treasury. Anyone may call it.
    function withdrawLaunchFees() external nonReentrant {
        uint256 amount = address(this).balance;
        if (amount == 0) revert NothingToWithdraw();
        address to = _config.treasury;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
        emit LaunchFeesWithdrawn(to, amount);
    }

    // ---------------------------------------------------------------- rules, with a 48-hour delay

    /// @notice Proposes new rules for future launches, launch fee and treasury. Replaces any
    ///         pending proposal and restarts the 48-hour wait.
    function proposeConfig(Config calldata config_) external onlyOwner {
        _validate(config_, migrator);
        _pendingConfig = config_;
        pendingConfigEta = block.timestamp + CONFIG_DELAY;
        emit ConfigProposed(pendingConfigEta, config_);
    }

    function executeConfig() external onlyOwner {
        uint256 eta = pendingConfigEta;
        if (eta == 0) revert NoPendingConfig();
        if (block.timestamp < eta) revert ConfigNotReady(eta);
        _config = _pendingConfig;
        delete _pendingConfig;
        pendingConfigEta = 0;
        emit ConfigExecuted(_config);
    }

    function cancelConfig() external onlyOwner {
        if (pendingConfigEta == 0) revert NoPendingConfig();
        delete _pendingConfig;
        pendingConfigEta = 0;
        emit ConfigCancelled();
    }

    function _validate(Config memory c, address fixedMigrator) internal pure {
        LaunchParams memory p = c.params;
        if (c.treasury == address(0)) revert ZeroAddress();
        if (p.migrator != fixedMigrator) revert MigratorIsFixed();
        if (
            c.launchFee > MAX_LAUNCH_FEE || p.feeBps > MAX_FEE_BPS || p.creatorShareBps > 10_000
                || p.gradThreshold < MIN_GRAD_THRESHOLD || p.gradThreshold > MAX_GRAD_THRESHOLD
                || p.firstBuyMaxTokens > MAX_FIRST_BUY_TOKENS
        ) revert InvalidConfig();
        for (uint256 i; i < 5; ++i) {
            if (uint256(p.feeBps) + p.surchargeBps[i] > MAX_TOTAL_BUY_COST_BPS) revert InvalidConfig();
        }
    }

    // ---------------------------------------------------------------- emergency controls

    function setPauser(address account, bool allowed) external onlyOwner {
        isPauser[account] = allowed;
        emit PauserSet(account, allowed);
    }

    /// @notice Stops launches and buys at once. Sells, fee claims and graduation keep working.
    function pause() external {
        if (!isPauser[msg.sender] && msg.sender != owner()) revert NotPauser();
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }

    /// @notice Raises the per-buy cap, or removes it with 0. It can never be lowered or brought back.
    function setMaxBuyUsdg(uint256 newMax) external onlyOwner {
        uint256 current = maxBuyUsdg;
        if (current == 0 || (newMax != 0 && newMax <= current)) revert MaxBuyCanOnlyRise();
        maxBuyUsdg = newMax;
        emit MaxBuyUpdated(newMax);
    }

    /// @dev Losing the owner would freeze fee withdrawals and rule updates, so renouncing is disabled.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ---------------------------------------------------------------- views

    function config() external view returns (Config memory) {
        return _config;
    }

    function pendingConfig() external view returns (Config memory) {
        return _pendingConfig;
    }

    function launchFee() external view returns (uint256) {
        return _config.launchFee;
    }

    function treasury() external view returns (address) {
        return _config.treasury;
    }
}
