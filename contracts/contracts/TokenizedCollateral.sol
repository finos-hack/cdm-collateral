// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Tokenized collateral
/// @notice ERC-20 test token for a collateral asset, carrying the asset's real-world identifiers so that on-chain
/// holdings trace to the registered security (concept-asr-onchain-asset-identity). Whole units only (0 decimals) to
/// match the integer quantities the workflow uses. Dev-only: `mint` is unrestricted so the deploy script can set up
/// opening balances; this is a prototype token, not a production restricted-transfer security.
contract TokenizedCollateral is ERC20 {
    string public isin;
    string public cusip;
    string public dti; // Digital Token Identifier (ISO 24165)

    constructor(
        string memory name_,
        string memory symbol_,
        string memory isin_,
        string memory cusip_,
        string memory dti_
    ) ERC20(name_, symbol_) {
        isin = isin_;
        cusip = cusip_;
        dti = dti_;
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /// @notice Unrestricted mint for prototype balance setup.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
