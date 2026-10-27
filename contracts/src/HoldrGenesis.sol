// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @dev Arbitrum precompile, present on every Arbitrum Nitro / Orbit chain (Robinhood Chain included).
interface IArbSys {
    function arbBlockNumber() external view returns (uint256);
    function arbBlockHash(uint256 blockNumber) external view returns (bytes32);
}

/// @title Holdr Genesis characters
/// @notice 5,000 free-mint characters released in 5 waves of 1,000
///         (300 Degen Raccoon, 300 Moon Frog, 300 Laser Bull, 100 The Anon per wave).
///         Minting needs a permit signed by Holdr, so it only works inside the Holdr app.
///         The character is revealed in a second step. Holdr commits to a secret seed in the
///         permit and the minter adds their own seed, so a minter cannot pick the result.
///         Holdr's server is trusted: it knows its own seeds before the mint.
///         If Holdr does not reveal within an hour, anyone can request a fallback reveal that
///         uses the hash of a future L2 block, which nobody knows when the request is made.
/// @dev    Non-upgradeable. The owner can open waves, rotate the permit signer, pause minting
///         and set metadata/royalty (royalty capped at 2.5%). The owner cannot touch tokens,
///         change the supply, the per-wave split or anyone's equipped character.
contract HoldrGenesis is ERC721, ERC2981, EIP712, Ownable2Step, IERC4906 {
    // ------------------------------------------------------------------ constants

    uint256 public constant MAX_SUPPLY = 5_000;
    uint256 public constant WAVE_COUNT = 5;
    uint256 public constant WAVE_SIZE = 1_000;
    uint256 public constant REVEAL_TIMEOUT = 1 hours;
    uint256 public constant FALLBACK_WINDOW = 256; // L2 blocks a fallback request stays valid
    uint256 public constant EQUIP_COOLDOWN = 7 days;
    uint256 public constant MAX_WAVE_DELAY = 365 days;
    uint96 public constant MAX_ROYALTY_BPS = 250; // 2.5%

    uint8 public constant UNREVEALED = 0;
    uint8 public constant RACCOON = 1; // trading points +20%
    uint8 public constant FROG = 2; // launch points +20%
    uint8 public constant BULL = 3; // holding points +20%
    uint8 public constant ANON = 4; // all points +10%

    bytes32 public constant MINT_PERMIT_TYPEHASH =
        keccak256("MintPermit(address to,uint256 deadline,bytes32 commitment)");

    IArbSys internal constant ARBSYS = IArbSys(address(100));

    // ------------------------------------------------------------------ storage

    /// @notice Address whose signatures authorise mints (Holdr's server key).
    address public signer;
    bool public mintPaused;
    string private _baseTokenURI;

    uint256 public totalMinted;
    uint256 public totalRevealed;
    uint256 public wavesOpened;
    /// @notice Start time of each opened wave, keyed 1..5.
    mapping(uint256 wave => uint64 startTime) public waveStart;

    /// @dev Characters not yet assigned, across all opened waves: [raccoon, frog, bull, anon].
    uint16[4] private _deck;

    mapping(address account => bool) public hasMinted;
    mapping(bytes32 commitment => bool) public commitmentUsed;

    struct Pending {
        bytes32 commitment; // keccak256(serverSeed), from the permit
        bytes32 userSeed; // chosen by the minter
        uint64 mintTime;
        uint64 fallbackBlock; // L2 block of the latest fallback request (0 = none)
    }

    mapping(uint256 tokenId => Pending) private _pending;
    mapping(uint256 tokenId => uint8 character) public characterOf;

    /// @notice The character each wallet plays and earns boosts with (0 = none).
    mapping(address account => uint256 tokenId) public equippedOf;
    /// @notice Last manual equip change, for the 7-day cooldown.
    mapping(address account => uint64 time) public lastEquipChange;

    // ------------------------------------------------------------------ events

    event WaveOpened(uint256 indexed wave, uint64 startTime);
    event WaveRescheduled(uint256 indexed wave, uint64 startTime);
    event Minted(address indexed to, uint256 indexed tokenId, bytes32 commitment, bytes32 userSeed);
    event FallbackRequested(uint256 indexed tokenId, uint256 l2Block);
    event Revealed(uint256 indexed tokenId, uint8 character, bool viaFallback);
    /// @param manual true for an equip() call, false for the automatic equip on receive.
    event Equipped(address indexed account, uint256 indexed tokenId, bool manual);
    event Unequipped(address indexed account, uint256 indexed tokenId);
    event SignerUpdated(address indexed signer);
    event MintPausedSet(bool paused);
    event BaseURIUpdated(string baseURI);
    event RoyaltyUpdated(address indexed receiver, uint96 bps);

    // ------------------------------------------------------------------ errors

    error ZeroAddress();
    error AllWavesOpened();
    error WaveStartTooEarly();
    error WaveStartTooLate();
    error NoWaveToReschedule();
    error MintIsPaused();
    error PermitExpired();
    error InvalidPermit();
    error AlreadyMinted();
    error CommitmentUsed();
    error ZeroCommitment();
    error SoldOut();
    error NotPending();
    error BadSeed();
    error RevealNotTimedOut();
    error FallbackPending();
    error FallbackNotRequested();
    error FallbackTooEarly();
    error FallbackExpired();
    error NotTokenOwner();
    error AlreadyEquipped();
    error EquipCooldown(uint256 availableAt);
    error RoyaltyTooHigh();
    error RenounceDisabled();

    constructor(address initialOwner, address signer_, address royaltyReceiver, string memory baseURI_)
        ERC721("Holdr Genesis", "HOLDR")
        EIP712("HoldrGenesis", "1")
        Ownable(initialOwner)
    {
        if (signer_ == address(0) || royaltyReceiver == address(0)) revert ZeroAddress();
        signer = signer_;
        _setDefaultRoyalty(royaltyReceiver, MAX_ROYALTY_BPS);
        _baseTokenURI = baseURI_;
        emit SignerUpdated(signer_);
        emit RoyaltyUpdated(royaltyReceiver, MAX_ROYALTY_BPS);
    }

    // ------------------------------------------------------------------ owner

    /// @notice Opens the next wave of 1,000. Waves open in order, never start earlier than the
    ///         previous one and start within a year.
    function openWave(uint64 startTime) external onlyOwner {
        uint256 w = wavesOpened + 1;
        if (w > WAVE_COUNT) revert AllWavesOpened();
        _checkWaveStart(w, startTime);
        wavesOpened = w;
        waveStart[w] = startTime;
        _deck[0] += 300;
        _deck[1] += 300;
        _deck[2] += 300;
        _deck[3] += 100;
        emit WaveOpened(w, startTime);
    }

    /// @notice Moves the start of the latest wave, only while it has not started yet.
    function rescheduleWave(uint64 startTime) external onlyOwner {
        uint256 w = wavesOpened;
        if (w == 0 || waveStart[w] <= block.timestamp) revert NoWaveToReschedule();
        _checkWaveStart(w, startTime);
        waveStart[w] = startTime;
        emit WaveRescheduled(w, startTime);
    }

    function _checkWaveStart(uint256 w, uint64 startTime) private view {
        if (w > 1 && startTime < waveStart[w - 1]) revert WaveStartTooEarly();
        if (startTime > block.timestamp + MAX_WAVE_DELAY) revert WaveStartTooLate();
    }

    function setSigner(address signer_) external onlyOwner {
        if (signer_ == address(0)) revert ZeroAddress();
        signer = signer_;
        emit SignerUpdated(signer_);
    }

    /// @notice Pauses new mints only. Reveals, transfers and equips keep working.
    function setMintPaused(bool paused) external onlyOwner {
        mintPaused = paused;
        emit MintPausedSet(paused);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
        if (totalMinted > 0) emit BatchMetadataUpdate(1, totalMinted);
    }

    function setRoyalty(address receiver, uint96 bps) external onlyOwner {
        if (bps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh();
        _setDefaultRoyalty(receiver, bps);
        emit RoyaltyUpdated(receiver, bps);
    }

    /// @dev Losing the owner would freeze unopened waves forever, so renouncing is disabled.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ------------------------------------------------------------------ mint and reveal

    /// @notice Free mint, one per wallet, with a permit from Holdr.
    /// @param deadline   Permit expiry (unix seconds).
    /// @param commitment keccak256(serverSeed) chosen by Holdr and bound into the permit.
    /// @param userSeed   Any random value from the minter's app.
    /// @param signature  EIP-712 signature by `signer` over (msg.sender, deadline, commitment).
    function mint(uint256 deadline, bytes32 commitment, bytes32 userSeed, bytes calldata signature)
        external
        returns (uint256 tokenId)
    {
        if (mintPaused) revert MintIsPaused();
        if (block.timestamp > deadline) revert PermitExpired();
        if (commitment == bytes32(0)) revert ZeroCommitment();
        if (hasMinted[msg.sender]) revert AlreadyMinted();
        if (commitmentUsed[commitment]) revert CommitmentUsed();
        if (totalMinted >= mintableSupply()) revert SoldOut();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(MINT_PERMIT_TYPEHASH, msg.sender, deadline, commitment)));
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != signer) revert InvalidPermit();

        hasMinted[msg.sender] = true;
        commitmentUsed[commitment] = true;
        tokenId = ++totalMinted;
        _pending[tokenId] =
            Pending({commitment: commitment, userSeed: userSeed, mintTime: uint64(block.timestamp), fallbackBlock: 0});
        _mint(msg.sender, tokenId);
        emit Minted(msg.sender, tokenId, commitment, userSeed);
    }

    /// @notice Reveals a character with the seed Holdr committed to. Anyone may call it,
    ///         but not after a fallback has been requested for the token.
    function reveal(uint256 tokenId, bytes32 serverSeed) external {
        Pending memory p = _pending[tokenId];
        if (p.commitment == bytes32(0)) revert NotPending();
        if (p.fallbackBlock != 0) revert FallbackPending();
        if (keccak256(abi.encodePacked(serverSeed)) != p.commitment) revert BadSeed();
        _assign(tokenId, uint256(keccak256(abi.encode(serverSeed, p.userSeed, tokenId))), false);
    }

    /// @notice Step 1 of the fallback: after an hour without a reveal, anyone can fix the L2 block
    ///         whose successor's hash will decide the character. A request that was never finished
    ///         within FALLBACK_WINDOW blocks can be made again.
    function requestFallback(uint256 tokenId) external {
        Pending storage p = _pending[tokenId];
        if (p.commitment == bytes32(0)) revert NotPending();
        if (block.timestamp < uint256(p.mintTime) + REVEAL_TIMEOUT) revert RevealNotTimedOut();
        uint256 nowBlock = ARBSYS.arbBlockNumber();
        uint256 req = p.fallbackBlock;
        if (req != 0 && nowBlock <= req + 1 + FALLBACK_WINDOW) revert FallbackPending();
        p.fallbackBlock = uint64(nowBlock);
        emit FallbackRequested(tokenId, nowBlock);
    }

    /// @notice Step 2 of the fallback: anyone can finish it once the next L2 block exists,
    ///         within FALLBACK_WINDOW blocks.
    function fallbackReveal(uint256 tokenId) external {
        Pending memory p = _pending[tokenId];
        if (p.commitment == bytes32(0)) revert NotPending();
        if (p.fallbackBlock == 0) revert FallbackNotRequested();
        uint256 target = uint256(p.fallbackBlock) + 1;
        uint256 nowBlock = ARBSYS.arbBlockNumber();
        if (nowBlock <= target) revert FallbackTooEarly();
        if (nowBlock > target + FALLBACK_WINDOW) revert FallbackExpired();
        bytes32 entropy = ARBSYS.arbBlockHash(target);
        _assign(tokenId, uint256(keccak256(abi.encode(p.commitment, p.userSeed, tokenId, entropy))), true);
    }

    /// @dev Draws from the remaining deck in proportion to what is left (an urn draw), so the
    ///      final split is exactly 1,500 / 1,500 / 1,500 / 500.
    function _assign(uint256 tokenId, uint256 rand, bool viaFallback) private {
        delete _pending[tokenId];
        // total >= 1: it equals 1,000 x waves opened - revealed, and this token is minted but unrevealed
        uint256 total = uint256(_deck[0]) + _deck[1] + _deck[2] + _deck[3];
        uint256 x = rand % total;
        uint8 c = RACCOON;
        while (x >= _deck[c - 1]) {
            x -= _deck[c - 1];
            ++c;
        }
        unchecked {
            --_deck[c - 1];
        }
        characterOf[tokenId] = c;
        ++totalRevealed;
        emit Revealed(tokenId, c, viaFallback);
        emit MetadataUpdate(tokenId);
    }

    // ------------------------------------------------------------------ equip

    /// @notice Choose which owned character to play with. Changing it has a 7-day cooldown.
    function equip(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        uint256 current = equippedOf[msg.sender];
        if (current == tokenId) revert AlreadyEquipped();
        uint256 availableAt = _cooldownEnd(msg.sender);
        if (block.timestamp < availableAt) revert EquipCooldown(availableAt);

        equippedOf[msg.sender] = tokenId;
        lastEquipChange[msg.sender] = uint64(block.timestamp);
        if (current != 0) emit Unequipped(msg.sender, current);
        emit Equipped(msg.sender, tokenId, true);
    }

    function _cooldownEnd(address account) private view returns (uint256) {
        uint256 last = lastEquipChange[account];
        return last == 0 ? 0 : last + EQUIP_COOLDOWN;
    }

    /// @dev Sending away the equipped character unequips it. Receiving one while nothing is
    ///      equipped equips it automatically, unless a manual change is still cooling down.
    ///      A transfer to oneself changes nothing.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from == to) return from;
        if (from != address(0) && equippedOf[from] == tokenId) {
            delete equippedOf[from];
            emit Unequipped(from, tokenId);
        }
        if (to != address(0) && equippedOf[to] == 0 && block.timestamp >= _cooldownEnd(to)) {
            equippedOf[to] = tokenId;
            emit Equipped(to, tokenId, false);
        }
    }

    // ------------------------------------------------------------------ views

    /// @notice How many can be minted so far: 1,000 per wave whose start time has passed.
    function mintableSupply() public view returns (uint256 n) {
        uint256 opened = wavesOpened;
        for (uint256 w = 1; w <= opened; ++w) {
            if (waveStart[w] <= block.timestamp) n += WAVE_SIZE;
        }
    }

    /// @notice Unassigned characters left: [raccoon, frog, bull, anon].
    function deck() external view returns (uint16[4] memory) {
        return _deck;
    }

    function pendingOf(uint256 tokenId) external view returns (Pending memory) {
        return _pending[tokenId];
    }

    /// @notice The equipped character type of a wallet (0 = none or not revealed yet).
    function equippedCharacter(address account) external view returns (uint8) {
        uint256 id = equippedOf[account];
        return id == 0 ? UNREVEALED : characterOf[id];
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981, IERC165) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }
}
