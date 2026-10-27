// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {HoldrGenesis} from "../src/HoldrGenesis.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract HoldrGenesisTest is Test {
    HoldrGenesis nft;
    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    uint256 signerKey = 0xA11CE;
    address signer;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    bytes32 constant PERMIT_TYPEHASH = keccak256("MintPermit(address to,uint256 deadline,bytes32 commitment)");

    function setUp() public {
        vm.warp(1_800_000_000);
        signer = vm.addr(signerKey);
        nft = new HoldrGenesis(owner, signer, treasury, "https://holdr.app/api/nft/");
        vm.prank(owner);
        nft.openWave(uint64(block.timestamp));
    }

    // ---------------------------------------------------------------- helpers

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("HoldrGenesis"),
                keccak256("1"),
                block.chainid,
                address(nft)
            )
        );
    }

    function _sign(uint256 key, address to, uint256 deadline, bytes32 commitment) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, to, deadline, commitment));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _seed(uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encode("server-seed", i));
    }

    function _mintAs(address who, uint256 i) internal returns (uint256 id) {
        bytes32 commitment = keccak256(abi.encodePacked(_seed(i)));
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(signerKey, who, deadline, commitment);
        vm.prank(who);
        id = nft.mint(deadline, commitment, keccak256(abi.encode("user", who)), sig);
    }

    function _mintAndReveal(address who, uint256 i) internal returns (uint256 id) {
        id = _mintAs(who, i);
        nft.reveal(id, _seed(i));
    }

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
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        nft.openWave(uint64(block.timestamp));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        nft.setSigner(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        nft.setMintPaused(true);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        nft.setBaseURI("x");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
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

    function test_mintableSupply_followsWaveStart() public {
        vm.prank(owner);
        nft.openWave(uint64(block.timestamp + 7 days));
        assertEq(nft.mintableSupply(), 1_000);
        vm.warp(block.timestamp + 7 days);
        assertEq(nft.mintableSupply(), 2_000);
    }

    function test_setRoyalty_capped() public {
        vm.startPrank(owner);
        vm.expectRevert(HoldrGenesis.RoyaltyTooHigh.selector);
        nft.setRoyalty(treasury, 251);
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

    function test_setBaseURI_changesTokenURI() public {
        uint256 id = _mintAs(alice, 1);
        vm.prank(owner);
        nft.setBaseURI("ipfs://new/");
        assertEq(nft.tokenURI(id), "ipfs://new/1");
    }

    function test_equippedCharacter_noneIsZero() public view {
        assertEq(nft.equippedCharacter(alice), 0);
    }

    function test_supportsInterface() public view {
        assertTrue(nft.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(nft.supportsInterface(0x2a55205a)); // ERC-2981
        assertTrue(nft.supportsInterface(0x01ffc9a7)); // ERC-165
    }

    // ---------------------------------------------------------------- mint

    function test_mint_happyPath() public {
        bytes32 commitment = keccak256(abi.encodePacked(_seed(1)));
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(signerKey, alice, deadline, commitment);
        vm.expectEmit(true, true, false, true);
        emit HoldrGenesis.Minted(alice, 1, commitment, bytes32("u"));
        vm.prank(alice);
        uint256 id = nft.mint(deadline, commitment, bytes32("u"), sig);

        assertEq(id, 1);
        assertEq(nft.ownerOf(1), alice);
        assertTrue(nft.hasMinted(alice));
        assertTrue(nft.commitmentUsed(commitment));
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.characterOf(1), 0);
        assertEq(nft.equippedOf(alice), 1, "first character is equipped automatically");
        assertEq(nft.pendingOf(1).commitment, commitment);
        assertEq(nft.tokenURI(1), "https://holdr.app/api/nft/1");
    }

    function test_mint_revertsSecondMintSameWallet() public {
        _mintAs(alice, 1);
        bytes32 commitment = keccak256(abi.encodePacked(_seed(2)));
        bytes memory sig = _sign(signerKey, alice, block.timestamp + 1, commitment);
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.AlreadyMinted.selector);
        nft.mint(block.timestamp + 1, commitment, 0, sig);
    }

    function test_mint_revertsWrongSigner() public {
        bytes32 commitment = keccak256(abi.encodePacked(_seed(1)));
        bytes memory sig = _sign(0xBAD, alice, block.timestamp + 1, commitment);
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(block.timestamp + 1, commitment, 0, sig);
    }

    function test_mint_revertsPermitForSomeoneElse() public {
        bytes32 commitment = keccak256(abi.encodePacked(_seed(1)));
        bytes memory sig = _sign(signerKey, alice, block.timestamp + 1, commitment);
        vm.prank(bob);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(block.timestamp + 1, commitment, 0, sig);
    }

    function test_mint_revertsTamperedDeadline() public {
        bytes32 commitment = keccak256(abi.encodePacked(_seed(1)));
        bytes memory sig = _sign(signerKey, alice, block.timestamp + 1, commitment);
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(block.timestamp + 1 days, commitment, 0, sig);
    }

    function test_mint_revertsGarbageSignature() public {
        bytes32 commitment = keccak256(abi.encodePacked(_seed(1)));
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(block.timestamp + 1, commitment, 0, hex"1234");
    }

    function test_mint_revertsExpired() public {
        bytes32 commitment = keccak256(abi.encodePacked(_seed(1)));
        uint256 deadline = block.timestamp + 1;
        bytes memory sig = _sign(signerKey, alice, deadline, commitment);
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.PermitExpired.selector);
        nft.mint(deadline, commitment, 0, sig);
    }

    function test_mint_revertsReusedCommitment() public {
        _mintAs(alice, 1);
        bytes32 commitment = keccak256(abi.encodePacked(_seed(1)));
        bytes memory sig = _sign(signerKey, bob, block.timestamp + 1, commitment);
        vm.prank(bob);
        vm.expectRevert(HoldrGenesis.CommitmentUsed.selector);
        nft.mint(block.timestamp + 1, commitment, 0, sig);
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
        bytes32 commitment = keccak256(abi.encodePacked(_seed(1)));
        bytes memory sig = _sign(signerKey, alice, block.timestamp + 1, commitment);
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.MintIsPaused.selector);
        nft.mint(block.timestamp + 1, commitment, 0, sig);
    }

    function test_mint_oldSignerRejectedAfterRotation() public {
        vm.prank(owner);
        nft.setSigner(makeAddr("newSigner"));
        bytes32 commitment = keccak256(abi.encodePacked(_seed(1)));
        bytes memory sig = _sign(signerKey, alice, block.timestamp + 1, commitment);
        vm.prank(alice);
        vm.expectRevert(HoldrGenesis.InvalidPermit.selector);
        nft.mint(block.timestamp + 1, commitment, 0, sig);
    }

    function test_mint_soldOutAtWaveCapacity_thenNextWave() public {
        for (uint256 i = 1; i <= 1_000; ++i) {
            _mintAs(address(uint160(0x10000 + i)), i);
        }
        address late = makeAddr("late");
        bytes32 commitment = keccak256(abi.encodePacked(_seed(5_000)));
        bytes memory sig = _sign(signerKey, late, block.timestamp + 1, commitment);
        vm.prank(late);
        vm.expectRevert(HoldrGenesis.SoldOut.selector);
        nft.mint(block.timestamp + 1, commitment, 0, sig);

        vm.prank(owner);
        nft.openWave(uint64(block.timestamp + 1 days));
        vm.prank(late);
        vm.expectRevert(HoldrGenesis.SoldOut.selector);
        nft.mint(block.timestamp + 1, commitment, 0, sig);

        vm.warp(block.timestamp + 1 days);
        sig = _sign(signerKey, late, block.timestamp + 1, commitment);
        vm.prank(late);
        assertEq(nft.mint(block.timestamp + 1, commitment, 0, sig), 1_001);
    }

    // ---------------------------------------------------------------- reveal

    function test_reveal_withCommittedSeed() public {
        uint256 id = _mintAs(alice, 1);
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

    function test_fallbackReveal_onlyAfterTimeout() public {
        uint256 id = _mintAs(alice, 1);
        vm.warp(block.timestamp + 1 hours - 1);
        vm.expectRevert(HoldrGenesis.RevealNotTimedOut.selector);
        nft.fallbackReveal(id);
        vm.warp(block.timestamp + 1);
        vm.prank(bob); // anyone can trigger it
        nft.fallbackReveal(id);
        assertTrue(nft.characterOf(id) != 0);
        vm.expectRevert(HoldrGenesis.NotPending.selector);
        nft.reveal(id, _seed(1));
    }

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
        bytes32 commitment = keccak256(abi.encodePacked(_seed(9_999)));
        bytes memory sig = _sign(signerKey, late, block.timestamp + 1, commitment);
        vm.prank(late);
        vm.expectRevert(HoldrGenesis.SoldOut.selector);
        nft.mint(block.timestamp + 1, commitment, 0, sig);
    }

    function test_firstWave_anonOddsNearTenPercent() public {
        uint256 anons;
        for (uint256 i = 1; i <= 600; ++i) {
            uint256 id = _mintAndReveal(address(uint160(0x30000 + i)), i);
            if (nft.characterOf(id) == 4) ++anons;
        }
        // 10% of 600 = 60; a fair draw lands well inside 30..90
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

    function test_equip_cooldownSurvivesSendingAwayEquipped() public {
        uint256 a = _mintAs(alice, 1);
        uint256 b = _mintAs(bob, 2);
        uint256 c = _mintAs(makeAddr("carol"), 3);
        vm.prank(bob);
        nft.transferFrom(bob, alice, b);
        vm.prank(makeAddr("carol"));
        nft.transferFrom(makeAddr("carol"), alice, c);

        vm.prank(alice);
        nft.equip(b); // starts cooldown
        vm.prank(alice);
        nft.transferFrom(alice, bob, b); // equipped one leaves
        assertEq(nft.equippedOf(alice), 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HoldrGenesis.EquipCooldown.selector, block.timestamp + 7 days));
        nft.equip(c);
        assertEq(a, 1);
    }

    function test_receive_autoEquipsWhenNoneEquipped() public {
        uint256 b = _mintAs(bob, 2);
        vm.prank(bob);
        nft.transferFrom(bob, alice, b);
        assertEq(nft.equippedOf(alice), b);
        assertEq(nft.equippedOf(bob), 0);
    }

    function test_selfTransfer_keepsEquipped() public {
        uint256 a = _mintAs(alice, 1);
        vm.prank(alice);
        nft.transferFrom(alice, alice, a);
        assertEq(nft.equippedOf(alice), a);
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_mint_onlyValidSignerWorks(uint256 key, address to, uint256 deadlineOffset, bytes32 commitment) public {
        key = bound(key, 1, 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140);
        vm.assume(to != address(0) && to.code.length == 0 && commitment != bytes32(0));
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
        vm.assume(serverSeed != bytes32(0));
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
