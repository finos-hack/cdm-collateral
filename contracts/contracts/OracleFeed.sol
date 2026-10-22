// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Oracle feed contract
/// @notice On-chain price and default feed. Only the publisher (the market data operator's key, via the oracle
/// service's gateway) may write; every service reads valuations and default status from here so that contracts and
/// off-chain valuation agree (concept-asr-onchain-asset-identity, flow-oracle-update). Prices are keyed by the token
/// contract address and scaled by 1e8.
contract OracleFeed {
    uint256 public constant PRICE_SCALE = 1e8;

    address public immutable publisher;

    mapping(address => uint256) private _price;
    mapping(address => bool) private _hasPrice;
    mapping(address => bool) private _defaulted;

    event PricePublished(address indexed token, uint256 price);
    event DefaultPublished(address indexed party, bool inDefault);

    error NotPublisher();
    error NoPrice(address token);

    constructor(address publisher_) {
        publisher = publisher_;
    }

    modifier onlyPublisher() {
        if (msg.sender != publisher) revert NotPublisher();
        _;
    }

    /// @notice Set the price of a token (scaled by PRICE_SCALE).
    function publishPrice(address token, uint256 priceScaled) external onlyPublisher {
        _price[token] = priceScaled;
        _hasPrice[token] = true;
        emit PricePublished(token, priceScaled);
    }

    /// @notice Mark a party in or out of default.
    function setDefault(address party, bool inDefault) external onlyPublisher {
        _defaulted[party] = inDefault;
        emit DefaultPublished(party, inDefault);
    }

    function price(address token) external view returns (uint256) {
        if (!_hasPrice[token]) revert NoPrice(token);
        return _price[token];
    }

    function hasPrice(address token) external view returns (bool) {
        return _hasPrice[token];
    }

    function isDefaulted(address party) external view returns (bool) {
        return _defaulted[party];
    }
}
