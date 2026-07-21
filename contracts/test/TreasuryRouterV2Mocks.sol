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
    uint256 public squadReceived;

    function depositAirdrop() external payable {
        airdropReceived += msg.value;
    }

    function depositSquadPool() external payable {
        squadReceived += msg.value;
    }
}

contract RevertingTreasuryReceiverMock {
    receive() external payable {
        revert("receiver reverted");
    }
}

contract TreasuryRouterTokenMock is ERC20 {
    constructor() ERC20("Treasury Router Token", "TRT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
