// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AcceptingReceiver {
    event Received(address indexed sender, uint256 amount);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
