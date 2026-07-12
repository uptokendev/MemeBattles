// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IUsdPriceFeed {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @notice Reads a native-token/USD feed and evaluates fixed-USD graduation thresholds.
contract GraduationOracle {
    using Math for uint256;

    error PriceFeedZero();
    error MaxPriceAgeZero();
    error InvalidPrice();
    error IncompleteRound();
    error StalePrice();

    uint256 private constant WAD = 1e18;

    IUsdPriceFeed public immutable priceFeed;
    uint256 public immutable maxPriceAge;

    constructor(address priceFeed_, uint256 maxPriceAge_) {
        if (priceFeed_ == address(0)) revert PriceFeedZero();
        if (maxPriceAge_ == 0) revert MaxPriceAgeZero();

        priceFeed = IUsdPriceFeed(priceFeed_);
        maxPriceAge = maxPriceAge_;
    }

    function nativeUsdPrice() public view returns (uint256) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = priceFeed.latestRoundData();
        if (answer <= 0) revert InvalidPrice();
        if (answeredInRound < roundId) revert IncompleteRound();
        if (updatedAt == 0 || block.timestamp - updatedAt > maxPriceAge) revert StalePrice();

        uint256 unsignedAnswer = uint256(answer);
        uint8 feedDecimals = priceFeed.decimals();
        if (feedDecimals == 18) return unsignedAnswer;
        if (feedDecimals < 18) return unsignedAnswer * (10 ** (18 - feedDecimals));
        return unsignedAnswer / (10 ** (feedDecimals - 18));
    }

    function nativeTargetForUsd(uint256 usdAmount) external view returns (uint256) {
        if (usdAmount == 0) return 0;
        return Math.mulDiv(usdAmount, WAD, nativeUsdPrice(), Math.Rounding.Ceil);
    }

    function graduationReached(uint256 nativeBalance, uint256 usdThreshold) external view returns (bool) {
        if (usdThreshold == 0) return true;
        return Math.mulDiv(nativeBalance, nativeUsdPrice(), WAD) >= usdThreshold;
    }
}
