// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {HoldrGenesis} from "../src/HoldrGenesis.sol";
import {MockArbSys} from "./mocks/MockArbSys.sol";

/// @dev Drives random sequences of mint / reveal / fallback / transfer / equip / time / new waves.
contract GenesisHandler is Test {
    HoldrGenesis public nft;
    address public owner;
    uint256 internal signerKey;

    address[] public holders; // every address that ever held a token
    mapping(address => bool) internal seen;
    uint256[] public pendingIds;
    mapping(uint256 => bytes32) public seedOf;
    uint256 public mintNonce;
    uint256[5] public revealedCount;

    bytes32 constant PERMIT_TYPEHASH = keccak256("MintPermit(address to,uint256 deadline,bytes32 commitment)");

    constructor(HoldrGenesis nft_, address owner_, uint256 signerKey_) {
        nft = nft_;
        owner = owner_;
        signerKey = signerKey_;
    }

    function holdersLength() external view returns (uint256) {
        return holders.length;
    }

    function pendingLength() external view returns (uint256) {
        return pendingIds.length;
    }

    function _track(address a) internal {
        if (!seen[a]) {
            seen[a] = true;
            holders.push(a);
        }
    }

    function _digest(address to, uint256 deadline, bytes32 commitment) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("HoldrGenesis"),
                keccak256("1"),
                block.chainid,
                address(nft)
            )
        );
        return keccak256(
            abi.encodePacked("\x19\x01", domain, keccak256(abi.encode(PERMIT_TYPEHASH, to, deadline, commitment)))
        );
    }

    function mint(bytes32 userSeed) external {
        if (nft.totalMinted() >= nft.mintableSupply()) return;
        ++mintNonce;
        address to = address(uint160(uint256(keccak256(abi.encode("minter", mintNonce)))));
        bytes32 serverSeed = keccak256(abi.encode("seed", mintNonce));
        bytes32 commitment = keccak256(abi.encodePacked(serverSeed));
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, _digest(to, deadline, commitment));
        vm.prank(to);
        uint256 id = nft.mint(deadline, commitment, userSeed, abi.encodePacked(r, s, v));
        seedOf[id] = serverSeed;
        pendingIds.push(id);
        _track(to);
    }

    function _takePending(uint256 idx) internal returns (uint256 id) {
        idx = idx % pendingIds.length;
        id = pendingIds[idx];
        pendingIds[idx] = pendingIds[pendingIds.length - 1];
        pendingIds.pop();
    }

    function reveal(uint256 idx) external {
        if (pendingIds.length == 0) return;
        uint256 id = pendingIds[idx % pendingIds.length];
        if (nft.pendingOf(id).fallbackBlock != 0) return; // server reveal is closed once a fallback is requested
        _takePending(idx);
        nft.reveal(id, seedOf[id]);
        ++revealedCount[nft.characterOf(id)];
    }

    function fallbackReveal(uint256 idx, uint256 gap) external {
        if (pendingIds.length == 0) return;
        uint256 id = _takePending(idx);
        HoldrGenesis.Pending memory p = nft.pendingOf(id);
        uint256 readyAt = uint256(p.mintTime) + nft.REVEAL_TIMEOUT();
        if (block.timestamp < readyAt) vm.warp(readyAt);
        if (p.fallbackBlock == 0 || block.number > uint256(p.fallbackBlock) + 1 + nft.FALLBACK_WINDOW()) {
            nft.requestFallback(id);
        }
        uint256 target = uint256(nft.pendingOf(id).fallbackBlock) + 1;
        if (block.number <= target) vm.roll(target + bound(gap, 1, nft.FALLBACK_WINDOW()));
        nft.fallbackReveal(id);
        ++revealedCount[nft.characterOf(id)];
    }

    /// Leaves a fallback request open so later reveals have to deal with it.
    function requestOnly(uint256 idx) external {
        if (pendingIds.length == 0) return;
        uint256 id = pendingIds[idx % pendingIds.length];
        HoldrGenesis.Pending memory p = nft.pendingOf(id);
        if (p.fallbackBlock != 0) return;
        uint256 readyAt = uint256(p.mintTime) + nft.REVEAL_TIMEOUT();
        if (block.timestamp < readyAt) vm.warp(readyAt);
        nft.requestFallback(id);
    }

    function roll(uint256 blocks) external {
        vm.roll(block.number + bound(blocks, 1, 600));
    }

    function transfer(uint256 tokenSeed, uint256 toSeed) external {
        uint256 minted = nft.totalMinted();
        if (minted == 0 || holders.length == 0) return;
        uint256 id = 1 + tokenSeed % minted;
        address from = nft.ownerOf(id);
        address to = holders[toSeed % holders.length];
        vm.prank(from);
        nft.transferFrom(from, to, id);
    }

    function equip(uint256 holderSeed, uint256 tokenSeed) external {
        if (holders.length == 0) return;
        address who = holders[holderSeed % holders.length];
        uint256 n = nft.balanceOf(who);
        if (n == 0) return;
        uint256 minted = nft.totalMinted();
        uint256 id = 1 + tokenSeed % minted;
        if (nft.ownerOf(id) != who || nft.equippedOf(who) == id) return;
        uint256 last = nft.lastEquipChange(who);
        if (last != 0 && block.timestamp < last + nft.EQUIP_COOLDOWN()) return;
        vm.prank(who);
        nft.equip(id);
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 10 days));
    }

    function openWave(uint256 delay) external {
        uint256 w = nft.wavesOpened();
        if (w == nft.WAVE_COUNT()) return;
        uint64 start = uint64(block.timestamp + bound(delay, 0, 3 days));
        if (start < nft.waveStart(w)) start = nft.waveStart(w);
        vm.prank(owner);
        nft.openWave(start);
    }
}

contract HoldrGenesisInvariantTest is Test {
    HoldrGenesis nft;
    GenesisHandler handler;
    address owner = makeAddr("owner");

    function setUp() public {
        vm.warp(1_800_000_000);
        vm.roll(1_000);
        vm.etch(address(100), address(new MockArbSys()).code);
        uint256 key = 0xA11CE;
        nft = new HoldrGenesis(owner, vm.addr(key), makeAddr("treasury"), "");
        vm.prank(owner);
        nft.openWave(uint64(block.timestamp));
        handler = new GenesisHandler(nft, owner, key);
        targetContract(address(handler));
    }

    function invariant_everyMintIsRevealedOrPending() public view {
        assertEq(nft.totalRevealed() + handler.pendingLength(), nft.totalMinted());
    }

    function invariant_deckMatchesOpenedMinusRevealed() public view {
        uint16[4] memory d = nft.deck();
        uint256 sum = uint256(d[0]) + d[1] + d[2] + d[3];
        assertEq(sum, nft.wavesOpened() * nft.WAVE_SIZE() - nft.totalRevealed());
        assertGe(sum, handler.pendingLength(), "enough cards left for every pending token");
    }

    function invariant_characterCapsHold() public view {
        uint256 w = nft.wavesOpened();
        assertLe(handler.revealedCount(1), 300 * w);
        assertLe(handler.revealedCount(2), 300 * w);
        assertLe(handler.revealedCount(3), 300 * w);
        assertLe(handler.revealedCount(4), 100 * w);
        assertEq(handler.revealedCount(0), 0, "never revealed as nothing");
    }

    function invariant_supplyWithinLimits() public view {
        assertLe(nft.totalMinted(), nft.mintableSupply());
        assertLe(nft.totalMinted(), nft.MAX_SUPPLY());
    }

    function invariant_equippedIsOwnedOrNone() public view {
        uint256 n = handler.holdersLength();
        for (uint256 i; i < n; ++i) {
            address h = handler.holders(i);
            uint256 id = nft.equippedOf(h);
            if (id != 0) assertEq(nft.ownerOf(id), h, "equipped token is owned by the holder");
            if (nft.balanceOf(h) == 0) assertEq(id, 0, "nothing equipped with an empty wallet");
            assertLe(nft.lastEquipChange(h), block.timestamp, "cooldown never starts in the future");
        }
    }

    function invariant_openRequestsHaveAValidBlock() public view {
        uint256 n = handler.pendingLength();
        for (uint256 i; i < n; ++i) {
            HoldrGenesis.Pending memory p = nft.pendingOf(handler.pendingIds(i));
            assertTrue(p.commitment != bytes32(0), "tracked pending token is still pending on-chain");
            assertLe(p.fallbackBlock, block.number);
        }
    }
}
