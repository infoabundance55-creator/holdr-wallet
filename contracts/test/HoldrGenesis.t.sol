// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {HoldrGenesis} from "../src/HoldrGenesis.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MockArbSys} from "./mocks/MockArbSys.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @dev A wallet contract that tries to equip from inside onERC721Received.
contract EquipOnReceive is IERC721Receiver {
    HoldrGenesis public nft;
    uint256 public seenEquipped;

    constructor(HoldrGenesis nft_) {
        nft = nft_;
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        seenEquipped = nft.equippedOf(address(this));
        if (seenEquipped != tokenId) nft.equip(tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }
}

abstract contract GenesisBase is Test {
    HoldrGenesis nft;
    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    uint256 signerKey = 0xA11CE;
    address signer;

    bytes32 constant PERMIT_TYPEHASH = keccak256("MintPermit(address to,uint256 deadline,bytes32 commitment)");
    uint256 constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        vm.roll(1_000);
        vm.etch(address(100), address(new MockArbSys()).code);
        signer = vm.addr(signerKey);
        nft = new HoldrGenesis(owner, signer, treasury, "https://holdr.app/api/nft/");
        vm.prank(owner);
        nft.openWave(uint64(block.timestamp));
    }

    function _domainSeparator(uint256 chainId, address verifying) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("HoldrGenesis"),
                keccak256("1"),
                chainId,
                verifying
            )
        );
    }

    function _digest(address to, uint256 deadline, bytes32 commitment) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, to, deadline, commitment));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(block.chainid, address(nft)), structHash));
    }

    function _sign(uint256 key, address to, uint256 deadline, bytes32 commitment) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, _digest(to, deadline, commitment));
        return abi.encodePacked(r, s, v);
    }

    function _seed(uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encode("server-seed", i));
    }

    function _commit(uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_seed(i)));
    }

    function _mintAs(address who, uint256 i) internal returns (uint256 id) {
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(signerKey, who, deadline, _commit(i));
        vm.prank(who);
        id = nft.mint(deadline, _commit(i), keccak256(abi.encode("user", who)), sig);
    }

    function _mintAndReveal(address who, uint256 i) internal returns (uint256 id) {
        id = _mintAs(who, i);
        nft.reveal(id, _seed(i));
    }

    function _fallback(uint256 id) internal {
        nft.requestFallback(id);
        vm.roll(block.number + 2);
        nft.fallbackReveal(id);
    }
}

contract HoldrGenesisTest is GenesisBase {
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    // ---------------------------------------------------------------- deploy and admin

    function test_constructor_setsState() public view {
        assertEq(nft.name(), "Holdr Genesis");
        assertEq(nft.symbol(), "HOLDR");
        assertEq(nft.owner(), owner);
        assertEq(nft.signer(), signer);
        (address receiver, uint256 amount) = nft.royaltyInfo(1, 10_000);
        assertEq(receiver, treasury);
        assertEq(amount, 250);
        assertEq(nft.wavesOpened(), 1);
        assertEq(nft.mintableSupply(), 1_000);
        uint16[4] memory d = nft.deck();
        assertEq(uint256(d[0]) + d[1] + d[2] + d[3], 1_000);
        assertEq(d[3], 100);
    }

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(HoldrGenesis.ZeroAddress.selector);
        new HoldrGenesis(owner, address(0), treasury, "");
        vm.expectRevert(HoldrGenesis.ZeroAddress.selector);
        new HoldrGenesis(owner, signer, address(0), "");
    }

    function test_onlyOwner_adminFunctions() public {
        bytes memory err = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice);
        vm.startPrank(alice);
        vm.expectRevert(err);
        nft.openWave(uint64(block.timestamp));
        vm.expectRevert(err);
        nft.rescheduleWave(uint64(block.timestamp));
        vm.expectRevert(err);
        nft.setSigner(alice);
        vm.expectRevert(err);
        nft.setMintPaused(true);
        vm.expectRevert(err);
        nft.setBaseURI("x");
        vm.expectRevert(err);
        nft.setRoyalty(alice, 100);
        vm.stopPrank();
    }

    function test_renounceOwnership_disabled() public {
        vm.prank(owner);
        vm.expectRevert(HoldrGenesis.RenounceDisabled.selector);
        nft.renounceOwnership();
        assertEq(nft.owner(), owner);
    }

    function test_ownershipTransfer_isTwoStep() public {
        vm.prank(owner);
        nft.transferOwnership(alice);
        assertEq(nft.owner(), owner);
        vm.prank(alice);
        nft.acceptOwnership();
        assertEq(nft.owner(), alice);
    }

    function test_openWave_orderAndLimit() public {
        vm.startPrank(owner);
        vm.expectRevert(HoldrGenesis.WaveStartTooEarly.selector);
        nft.openWave(uint64(block.timestamp - 1));
        for (uint256 i = 2; i <= 5; ++i) {
            nft.openWave(uint64(block.timestamp + i * 1 days));
        }
        vm.expectRevert(HoldrGenesis.AllWavesOpened.selector);
        nft.openWave(uint64(block.timestamp + 10 days));
        vm.stopPrank();
        uint16[4] memory d = nft.deck();
        assertEq(d[0], 1_500);
        assertEq(d[1], 1_500);
        assertEq(d[2], 1_500);
        assertEq(d[3], 500);
    }

    function test_openWave_rejectsStartBeyondAYear() public {
        vm.prank(owner);
        vm.expectRevert(HoldrGenesis.WaveStartTooLate.selector);
        nft.openWave(uint64(block.timestamp * 1000)); // a millisecond timestamp by mistake
    }

    function test_rescheduleWave_onlyBeforeItStarts() public {
        vm.startPrank(owner);
        vm.expectRevert(HoldrGenesis.NoWaveToReschedule.selector);
        nft.rescheduleWave(uint64(block.timestamp + 1 days)); // wave 1 already started

        nft.openWave(uint64(block.timestamp + 30 days));
        nft.rescheduleWave(uint64(block.timestamp + 2 days));
        assertEq(nft.waveStart(2), block.timestamp + 2 days);
        vm.expectRevert(HoldrGenesis.WaveStartTooEarly.selector);
        nft.rescheduleWave(uint64(block.timestamp - 1));

        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(HoldrGenesis.NoWaveToReschedule.selector);
        nft.rescheduleWave(uint64(block.timestamp + 1 days));
        vm.stopPrank();
        assertEq(nft.mintableSupply(), 2_000);
    }

    function test_rescheduleWave_noneOpened() public {
        HoldrGenesis fresh = new HoldrGenesis(owner, signer, treasury, "");
        vm.prank(owner);
        vm.expectRevert(HoldrGenesis.NoWaveToReschedule.selector);
        fresh.rescheduleWave(uint64(block.timestamp));
    }

    function test_mintableSupply_followsWaveStart() public {
        vm.prank(owner);
        nft.openWave(uint64(block.timestamp + 7 days));
        assertEq(nft.mintableSupply(), 1_000);
        vm.warp(block.timestamp + 7 days);
        assertEq(nft.mintableSupply(), 2_000);
    }

    function test_setRoyalty_cappedAndLogged() public {
        vm.startPrank(owner);
        vm.expectRevert(HoldrGenesis.RoyaltyTooHigh.selector);
        nft.setRoyalty(treasury, 251);
        vm.expectEmit(true, false, false, true);
        emit HoldrGenesis.RoyaltyUpdated(alice, 100);
        nft.setRoyalty(alice, 100);
        vm.stopPrank();
        (address receiver, uint256 amount) = nft.royaltyInfo(1, 10_000);
        assertEq(receiver, alice);
        assertEq(amount, 100);
    }

    function test_setSigner_rejectsZero_andUpdates() public {
        vm.startPrank(owner);
        vm.expectRevert(HoldrGenesis.ZeroAddress.selector);
        nft.setSigner(address(0));
        nft.setSigner(alice);
        vm.stopPrank();
        assertEq(nft.signer(), alice);
    }

    function test_setBaseURI_changesTokenURI_andSignalsRefresh() public {
        uint256 id = _mintAs(alice, 1);
        vm.expectEmit(false, false, false, true);
        emit HoldrGenesis.BaseURIUpdated("ipfs://new/");
        vm.expectEmit(false, false, false, true);
        emit IERC4906Events.BatchMetadataUpdate(1, 1);
        vm.prank(owner);
        nft.setBaseURI("ipfs://new/");
        assertEq(nft.tokenURI(id), "ipfs://new/1");
    }

    function test_setBaseURI_beforeAnyMint() public {
        vm.prank(owner);
        nft.setBaseURI("ipfs://x/");
    }

    function test_supportsInterface() public view {
        assertTrue(nft.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(nft.supportsInterface(0x2a55205a)); // ERC-2981
        assertTrue(nft.supportsInterface(0x01ffc9a7)); // ERC-165
        assertTrue(nft.supportsInterface(0x49064906)); // ERC-4906
        assertFalse(nft.supportsInterface(0xdeadbeef));
    }

    function test_equippedCharacter_noneIsZero() public view {
        assertEq(nft.equippedCharacter(alice), 0);
    }

    // ---------------------------------------------------------------- mint

    function test_mint_happyPath() public {
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(signerKey, alice, deadline, _commit(1));
        vm.expectEmit(true, true, false, true);
        emit HoldrGenesis.Equipped(alice, 1, false);
        vm.expectEmit(true, true, false, true);
        emit HoldrGenesis.Minted(alice, 1, _commit(1), bytes32("u"));
        vm.prank(alice);
        uint256 id = nft.mint(deadline, _commit(1), bytes32("u"), sig);

        assertEq(id, 1);
        assertEq(nft.ownerOf(1), alice);
        assertTrue(nft.hasMinted(alice));
        assertTrue(nft.commitmentUsed(_commit(1)));
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.characterOf(1), 0);
        assertEq(nft.equippedOf(alice), 1, "first character is equipped automatically");
        assertEq(nft.lastEquipChange(alice), 0, "auto-equip does not start a cooldown");
        assertEq(nft.pendingOf(1).commitment, _commit(1));
        assertEq(nft.tokenURI(1), "https://holdr.app/api/nft/1");
    }

    function test_mint_revertsSecondMintSameWallet() public {
        _mintAs(alice, 1);
        bytes memory sig = _sign(signerKey, alice, block.timestamp + 1, _commit(2));
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.AlreadyMinted.selector);
        nft.mint(block.timestamp + 1, _commit(2), 0, sig);
    }

    function test_mint_revertsWrongSigner() public {
        bytes memory sig = _sign(0xBAD, alice, block.timestamp + 1, _commit(1));
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(block.timestamp + 1, _commit(1), 0, sig);
    }

    function test_mint_revertsPermitForSomeoneElse() public {
        bytes memory sig = _sign(signerKey, alice, block.timestamp + 1, _commit(1));
        vm.prank(bob);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(block.timestamp + 1, _commit(1), 0, sig);
    }

    function test_mint_revertsTamperedDeadline() public {
        bytes memory sig = _sign(signerKey, alice, block.timestamp + 1, _commit(1));
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(block.timestamp + 1 days, _commit(1), 0, sig);
    }

    function test_mint_revertsGarbageSignature() public {
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(block.timestamp + 1, _commit(1), 0, hex"1234");
    }

    function test_mint_rejectsPermitFromAnotherChain() public {
        uint256 deadline = block.timestamp + 1;
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, alice, deadline, _commit(1)));
        bytes32 otherChain = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(1, address(nft)), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, otherChain);
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(deadline, _commit(1), 0, abi.encodePacked(r, s, v));
    }

    function test_mint_rejectsPermitForAnotherContract() public {
        uint256 deadline = block.timestamp + 1;
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, alice, deadline, _commit(1)));
        bytes32 other =
            keccak256(abi.encodePacked("\x19\x01", _domainSeparator(block.chainid, address(0xBEEF)), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, other);
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(deadline, _commit(1), 0, abi.encodePacked(r, s, v));
    }

    function test_mint_rejectsHighSAndCompactSignatures() public {
        uint256 deadline = block.timestamp + 1;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, _digest(alice, deadline, _commit(1)));
        bytes32 highS = bytes32(SECP256K1_N - uint256(s));
        uint8 flipped = v == 27 ? 28 : 27;
        vm.startPrank(alice);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(deadline, _commit(1), 0, abi.encodePacked(r, highS, flipped));
        bytes32 vs = bytes32(uint256(s) | (uint256(v - 27) << 255));
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(deadline, _commit(1), 0, abi.encodePacked(r, vs)); // 64-byte form is not accepted
        nft.mint(deadline, _commit(1), 0, abi.encodePacked(r, s, v)); // the normal one works
        vm.stopPrank();
    }

    function test_mint_revertsExpired() public {
        uint256 deadline = block.timestamp + 1;
        bytes memory sig = _sign(signerKey, alice, deadline, _commit(1));
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.PermitExpired.selector);
        nft.mint(deadline, _commit(1), 0, sig);
    }

    function test_mint_revertsReusedCommitment() public {
        _mintAs(alice, 1);
        bytes memory sig = _sign(signerKey, bob, block.timestamp + 1, _commit(1));
        vm.prank(bob);
        vm.expectRevert(HoldrGenesis.CommitmentUsed.selector);
        nft.mint(block.timestamp + 1, _commit(1), 0, sig);
    }

    function test_mint_revertsZeroCommitment() public {
        bytes memory sig = _sign(signerKey, alice, block.timestamp + 1, bytes32(0));
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.ZeroCommitment.selector);
        nft.mint(block.timestamp + 1, bytes32(0), 0, sig);
    }

    function test_mint_revertsWhenPaused() public {
        vm.prank(owner);
        nft.setMintPaused(true);
        bytes memory sig = _sign(signerKey, alice, block.timestamp + 1, _commit(1));
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.MintIsPaused.selector);
        nft.mint(block.timestamp + 1, _commit(1), 0, sig);
    }

    function test_mint_oldSignerRejectedAfterRotation() public {
        vm.prank(owner);
        nft.setSigner(makeAddr("newSigner"));
        bytes memory sig = _sign(signerKey, alice, block.timestamp + 1, _commit(1));
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(block.timestamp + 1, _commit(1), 0, sig);
    }

    function test_mint_soldOutAtWaveCapacity_thenNextWave() public {
        for (uint256 i = 1; i <= 1_000; ++i) {
            _mintAs(address(uint160(0x10000 + i)), i);
        }
        address late = makeAddr("late");
        bytes memory sig = _sign(signerKey, late, block.timestamp + 1, _commit(5_000));
        vm.prank(late);
        vm.expectRevert(HoldrGenesis.SoldOut.selector);
        nft.mint(block.timestamp + 1, _commit(5_000), 0, sig);

        vm.prank(owner);
        nft.openWave(uint64(block.timestamp + 1 days));
        vm.prank(late);
        vm.expectRevert(HoldrGenesis.SoldOut.selector);
        nft.mint(block.timestamp + 1, _commit(5_000), 0, sig);

        vm.warp(block.timestamp + 1 days);
        sig = _sign(signerKey, late, block.timestamp + 1, _commit(5_000));
        vm.prank(late);
        assertEq(nft.mint(block.timestamp + 1, _commit(5_000), 0, sig), 1_001);
    }

    // ---------------------------------------------------------------- reveal

    function test_reveal_withCommittedSeed() public {
        uint256 id = _mintAs(alice, 1);
        vm.expectEmit(true, false, false, true);
        emit IERC4906Events.MetadataUpdate(id);
        nft.reveal(id, _seed(1));
        uint8 c = nft.characterOf(id);
        assertTrue(c >= 1 && c <= 4);
        assertEq(nft.totalRevealed(), 1);
        assertEq(nft.pendingOf(id).commitment, bytes32(0));
        assertEq(nft.equippedCharacter(alice), c);
    }

    function test_reveal_revertsWrongSeed() public {
        uint256 id = _mintAs(alice, 1);
        vm.expectRevert(HoldrGenesis.BadSeed.selector);
        nft.reveal(id, _seed(2));
    }

    function test_reveal_revertsTwice() public {
        uint256 id = _mintAndReveal(alice, 1);
        vm.expectRevert(HoldrGenesis.NotPending.selector);
        nft.reveal(id, _seed(1));
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(HoldrGenesis.NotPending.selector);
        nft.requestFallback(id);
        vm.expectRevert(HoldrGenesis.NotPending.selector);
        nft.fallbackReveal(id);
    }

    function test_reveal_revertsUnknownToken() public {
        vm.expectRevert(HoldrGenesis.NotPending.selector);
        nft.reveal(42, _seed(1));
    }

    function test_reveal_isDeterministic() public {
        uint256 snap = vm.snapshotState();
        uint256 id = _mintAndReveal(alice, 7);
        uint8 first = nft.characterOf(id);
        vm.revertToState(snap);
        id = _mintAndReveal(alice, 7);
        assertEq(nft.characterOf(id), first);
    }

    // ---------------------------------------------------------------- fallback reveal

    function test_fallback_needsTimeoutRequestAndNextBlock() public {
        uint256 id = _mintAs(alice, 1);
        vm.expectRevert(HoldrGenesis.FallbackNotRequested.selector);
        nft.fallbackReveal(id);

        vm.warp(block.timestamp + 1 hours - 1);
        vm.expectRevert(HoldrGenesis.RevealNotTimedOut.selector);
        nft.requestFallback(id);
        vm.warp(block.timestamp + 1);

        vm.prank(bob); // anyone can request
        vm.expectEmit(true, false, false, true);
        emit HoldrGenesis.FallbackRequested(id, block.number);
        nft.requestFallback(id);

        vm.expectRevert(HoldrGenesis.FallbackPending.selector);
        nft.requestFallback(id);
        vm.expectRevert(HoldrGenesis.FallbackTooEarly.selector);
        nft.fallbackReveal(id);
        vm.roll(block.number + 1);
        vm.expectRevert(HoldrGenesis.FallbackTooEarly.selector);
        nft.fallbackReveal(id);

        vm.roll(block.number + 1);
        vm.prank(carol); // anyone can finish
        nft.fallbackReveal(id);
        assertTrue(nft.characterOf(id) != 0);
        assertEq(nft.totalRevealed(), 1);
    }

    function test_fallback_blocksServerRevealOnceRequested() public {
        uint256 id = _mintAs(alice, 1);
        vm.warp(block.timestamp + 1 hours);
        nft.requestFallback(id);
        vm.expectRevert(HoldrGenesis.FallbackPending.selector);
        nft.reveal(id, _seed(1));
    }

    function test_fallback_expiresAndCanBeRequestedAgain() public {
        uint256 id = _mintAs(alice, 1);
        vm.warp(block.timestamp + 1 hours);
        nft.requestFallback(id);
        uint256 req = block.number;
        vm.roll(req + 1 + 256);
        vm.expectRevert(HoldrGenesis.FallbackPending.selector);
        nft.requestFallback(id);
        vm.roll(req + 1 + 257);
        vm.expectRevert(HoldrGenesis.FallbackExpired.selector);
        nft.fallbackReveal(id);
        nft.requestFallback(id);
        assertEq(nft.pendingOf(id).fallbackBlock, block.number);
        vm.roll(block.number + 2);
        nft.fallbackReveal(id);
        assertTrue(nft.characterOf(id) != 0);
    }

    /// Review finding 1: a minter must not be able to lock in a fallback result at mint time.
    function test_fallback_resultDependsOnFutureBlock() public {
        uint256 id = _mintAs(alice, 1);
        vm.warp(block.timestamp + 1 hours);
        bool sawDifferent;
        uint8 firstResult;
        for (uint256 k; k < 20; ++k) {
            uint256 snap = vm.snapshotState();
            vm.roll(block.number + k * 7);
            _fallback(id);
            uint8 c = nft.characterOf(id);
            if (k == 0) firstResult = c;
            else if (c != firstResult) sawDifferent = true;
            vm.revertToState(snap);
        }
        assertTrue(sawDifferent, "same seed gives different results depending on the request block");
    }

    // ---------------------------------------------------------------- distribution

    function test_distribution_isExactAcrossAllWaves() public {
        vm.startPrank(owner);
        for (uint256 w = 2; w <= 5; ++w) {
            nft.openWave(uint64(block.timestamp));
        }
        vm.stopPrank();
        uint256[5] memory count;
        for (uint256 i = 1; i <= 5_000; ++i) {
            uint256 id = _mintAndReveal(address(uint160(0x20000 + i)), i);
            ++count[nft.characterOf(id)];
        }
        assertEq(count[1], 1_500);
        assertEq(count[2], 1_500);
        assertEq(count[3], 1_500);
        assertEq(count[4], 500);
        uint16[4] memory d = nft.deck();
        assertEq(uint256(d[0]) + d[1] + d[2] + d[3], 0);
        assertEq(nft.totalMinted(), nft.MAX_SUPPLY());

        address late = makeAddr("late");
        bytes memory sig = _sign(signerKey, late, block.timestamp + 1, _commit(9_999));
        vm.prank(late);
        vm.expectRevert(HoldrGenesis.SoldOut.selector);
        nft.mint(block.timestamp + 1, _commit(9_999), 0, sig);
    }

    function test_distribution_exactWithManyPendingAndMixedReveals() public {
        // mint a whole wave first, then reveal in a scrambled order, some via fallback
        for (uint256 i = 1; i <= 1_000; ++i) {
            _mintAs(address(uint160(0x40000 + i)), i);
        }
        vm.warp(block.timestamp + 1 hours);
        uint256[5] memory count;
        for (uint256 k; k < 1_000; ++k) {
            uint256 id = 1 + (k * 7919) % 1_000; // 7919 is coprime with 1,000: visits every id once
            if (k % 5 == 0) _fallback(id);
            else nft.reveal(id, _seed(id));
            ++count[nft.characterOf(id)];
        }
        assertEq(count[1], 300);
        assertEq(count[2], 300);
        assertEq(count[3], 300);
        assertEq(count[4], 100);
    }

    function test_firstWave_anonOddsNearTenPercent() public {
        uint256 anons;
        for (uint256 i = 1; i <= 600; ++i) {
            uint256 id = _mintAndReveal(address(uint160(0x30000 + i)), i);
            if (nft.characterOf(id) == 4) ++anons;
        }
        // about 10% of 600 = 60; a fair draw lands well inside 30..90
        assertGt(anons, 30);
        assertLt(anons, 90);
    }

    // ---------------------------------------------------------------- equip

    function test_equip_switchAndCooldown() public {
        uint256 a = _mintAndReveal(alice, 1);
        uint256 b = _mintAndReveal(bob, 2);
        vm.prank(bob);
        nft.transferFrom(bob, alice, b);
        assertEq(nft.equippedOf(alice), a, "receiving keeps the current one");
        assertEq(nft.equippedOf(bob), 0, "sending away unequips");

        vm.expectEmit(true, true, false, true);
        emit HoldrGenesis.Unequipped(alice, a);
        vm.expectEmit(true, true, false, true);
        emit HoldrGenesis.Equipped(alice, b, true);
        vm.prank(alice);
        nft.equip(b);
        assertEq(nft.equippedOf(alice), b);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HoldrGenesis.EquipCooldown.selector, block.timestamp + 7 days));
        nft.equip(a);

        vm.warp(block.timestamp + 7 days);
        vm.prank(alice);
        nft.equip(a);
        assertEq(nft.equippedOf(alice), a);
    }

    function test_equip_revertsNotOwnerOrSame() public {
        uint256 a = _mintAs(alice, 1);
        vm.prank(bob);
        vm.expectRevert(HoldrGenesis.NotTokenOwner.selector);
        nft.equip(a);
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.AlreadyEquipped.selector);
        nft.equip(a);
    }

    function test_equip_unrevealedTokenIsAllowed() public {
        _mintAs(alice, 1);
        uint256 b = _mintAs(bob, 2);
        vm.prank(bob);
        nft.transferFrom(bob, alice, b);
        vm.prank(alice);
        nft.equip(b);
        assertEq(nft.equippedCharacter(alice), 0, "type shows once revealed");
        nft.reveal(b, _seed(2));
        assertEq(nft.equippedCharacter(alice), nft.characterOf(b));
    }

    function test_equip_cooldownSurvivesSendingAwayEquipped() public {
        _mintAs(alice, 1);
        uint256 b = _mintAs(bob, 2);
        uint256 c = _mintAs(carol, 3);
        vm.prank(bob);
        nft.transferFrom(bob, alice, b);
        vm.prank(carol);
        nft.transferFrom(carol, alice, c);

        vm.prank(alice);
        nft.equip(b); // starts the cooldown
        vm.prank(alice);
        nft.transferFrom(alice, bob, b); // the equipped one leaves
        assertEq(nft.equippedOf(alice), 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HoldrGenesis.EquipCooldown.selector, block.timestamp + 7 days));
        nft.equip(c);
    }

    /// Review finding 2: the bypass via a second wallet and a self-transfer no longer works.
    function test_equip_cooldownCannotBeBypassedWithTransfers() public {
        uint256 a = _mintAs(alice, 1);
        uint256 b = _mintAs(bob, 2);
        vm.prank(bob);
        nft.transferFrom(bob, alice, b);
        vm.prank(alice);
        nft.equip(b); // alice is now locked for 7 days

        address second = makeAddr("aliceSecondWallet");
        vm.startPrank(alice);
        nft.transferFrom(alice, second, b); // b leaves, nothing equipped
        nft.transferFrom(alice, alice, a); // self-transfer: must not equip a
        vm.stopPrank();
        assertEq(nft.equippedOf(alice), 0);

        vm.prank(second);
        nft.transferFrom(second, alice, b); // b comes back during the cooldown: not auto-equipped
        assertEq(nft.equippedOf(alice), 0);

        vm.warp(block.timestamp + 7 days);
        vm.prank(alice);
        nft.equip(a);
        assertEq(nft.equippedOf(alice), a);
    }

    function test_receive_autoEquipsWhenNoneEquipped() public {
        uint256 b = _mintAs(bob, 2);
        vm.expectEmit(true, true, false, true);
        emit HoldrGenesis.Equipped(alice, b, false);
        vm.prank(bob);
        nft.transferFrom(bob, alice, b);
        assertEq(nft.equippedOf(alice), b);
        assertEq(nft.equippedOf(bob), 0);
    }

    function test_selfTransfer_changesNothing() public {
        uint256 a = _mintAs(alice, 1);
        vm.recordLogs();
        vm.prank(alice);
        nft.transferFrom(alice, alice, a);
        assertEq(nft.equippedOf(alice), a);
        assertEq(vm.getRecordedLogs().length, 1, "only the ERC-721 Transfer event");
    }

    function test_operatorTransfer_movesEquipCorrectly() public {
        uint256 a = _mintAs(alice, 1);
        vm.prank(alice);
        nft.setApprovalForAll(carol, true);
        vm.prank(carol);
        nft.transferFrom(alice, bob, a);
        assertEq(nft.equippedOf(alice), 0);
        assertEq(nft.equippedOf(bob), a);
        assertEq(nft.equippedOf(carol), 0);
    }

    function test_safeTransferToContractThatEquipsOnReceive() public {
        uint256 a = _mintAs(alice, 1);
        uint256 b = _mintAs(bob, 2);
        uint256 c = _mintAs(carol, 3);
        EquipOnReceive wallet = new EquipOnReceive(nft);

        vm.prank(alice);
        nft.safeTransferFrom(alice, address(wallet), a);
        assertEq(wallet.seenEquipped(), a, "auto-equipped before the callback runs");

        vm.prank(bob);
        nft.safeTransferFrom(bob, address(wallet), b); // callback equips b: allowed, starts the cooldown
        assertEq(nft.equippedOf(address(wallet)), b);
        assertEq(nft.lastEquipChange(address(wallet)), block.timestamp);

        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(HoldrGenesis.EquipCooldown.selector, block.timestamp + 7 days));
        nft.safeTransferFrom(carol, address(wallet), c); // callback cannot skip the cooldown
        assertEq(nft.ownerOf(c), carol);
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_mint_onlyValidSignerWorks(uint256 key, address to, uint256 deadlineOffset, bytes32 commitment)
        public
    {
        key = bound(key, 1, SECP256K1_N - 1);
        vm.assume(to != address(0) && to.code.length == 0 && commitment != bytes32(0) && uint160(to) > 0xff);
        uint256 deadline = block.timestamp + bound(deadlineOffset, 0, 365 days);
        bytes memory sig = _sign(key, to, deadline, commitment);
        vm.prank(to);
        if (vm.addr(key) == signer) {
            nft.mint(deadline, commitment, 0, sig);
            assertEq(nft.ownerOf(1), to);
        } else {
            vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
            nft.mint(deadline, commitment, 0, sig);
        }
    }

    function testFuzz_reveal_alwaysValidCharacter(bytes32 serverSeed, bytes32 userSeed) public {
        bytes32 commitment = keccak256(abi.encodePacked(serverSeed));
        bytes memory sig = _sign(signerKey, alice, block.timestamp + 1, commitment);
        vm.prank(alice);
        uint256 id = nft.mint(block.timestamp + 1, commitment, userSeed, sig);
        nft.reveal(id, serverSeed);
        uint8 c = nft.characterOf(id);
        assertTrue(c >= 1 && c <= 4);
        uint16[4] memory d = nft.deck();
        assertEq(uint256(d[0]) + d[1] + d[2] + d[3], 999);
    }
}

/// @dev Event declarations so tests can expectEmit the ERC-4906 events.
interface IERC4906Events {
    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);
}
