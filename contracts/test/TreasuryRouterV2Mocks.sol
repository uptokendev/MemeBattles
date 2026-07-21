// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TreasuryRouterReceiverMock {
    uint256 public received;

    receive() external payable {
        received += msg.value;
    }
}

contract CommunityRewardsVaultMock {
    uint256 public airdropReceived;
    uint