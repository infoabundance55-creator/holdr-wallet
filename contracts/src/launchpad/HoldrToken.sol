// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title HoldrToken
/// @notice A token launched on Holdr. Fixed supply of 1,000,000,000 minted once to its curve pool.
///         No owner, no further minting, no blacklist, no transfer tax.
/// @dev Deployed as an EIP-1167 clone, so name and symbol live in this contract's own storage
///      (the ERC20 constructor never runs for a clone). The curve pool may move a seller's tokens
///      into itself without a separate approval: it only ever pulls from the account that calls sell().
contract HoldrToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    string private _tokenName;
    string private _tokenSymbol;
    /// @notice Off-chain description, logo and links (IPFS URI).
    string public metadataURI;
    /// @notice The bonding-curve pool of this token.
    address public curve;

    error AlreadyInitialized();

    constructor() ERC20("", "") {
        curve = address(1); // locks the implementation contract
    }

    /// @dev Called once by the factory in the same transaction that creates the clone.
    function initialize(string calldata name_, string calldata symbol_, string calldata metadataURI_, address curve_)
        external
    {
        if (curve != address(0)) revert AlreadyInitialized();
        curve = curve_;
        _tokenName = name_;
        _tokenSymbol = symbol_;
        metadataURI = metadataURI_;
        _mint(curve_, TOTAL_SUPPLY);
    }

    function name() public view override returns (string memory) {
        return _tokenName;
    }

    function symbol() public view override returns (string memory) {
        return _tokenSymbol;
    }

    /// @notice Burns the caller's own tokens.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /// @dev The curve pool never needs an approval.
    function allowance(address owner, address spender) public view override returns (uint256) {
        if (spender == curve) return type(uint256).max;
        return super.allowance(owner, spender);
    }

    function _spendAllowance(address owner, address spender, uint256 value) internal override {
        if (spender == curve) return;
        super._spendAllowance(owner, spender, value);
    }
}
