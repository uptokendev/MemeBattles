// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LaunchCampaign} from "../LaunchCampaign.sol";

/// @dev Test-only helper that can call LaunchCampaign.buyExactTokensFor as the factory.
contract FactoryCaller {
    /// @dev Allow the campaign to refund excess msg.value back to this contract.
    receive() external payable {}

    function buyFor(address campaign, address recipient, uint256 amountOut, uint256 maxCost)
        external
        payable
        returns (uint256 total)
    {
        total = LaunchCampaign(payable(campaign)).buyExactTokensFor{value: msg.value}(recipient, amountOut, maxCost);
    }
}
