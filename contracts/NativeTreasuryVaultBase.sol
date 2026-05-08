// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title NativeTreasuryVaultBase
/// @notice Simple admin-controlled native-asset custody bucket used for protocol reward routing.
abstract contract NativeTreasuryVaultBase {
    address public immutable admin;

    event Deposit(address indexed from, uint256 amount, uint256 newBalance);
    event Withdraw(address indexed to, uint256 amount, uint256 remainingBalance);

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    constructor(address _admin) {
        require(_admin != address(0), "admin=0");
        admin = _admin;
    }

    receive() external payable virtual {
        require(msg.value > 0, "amount=0");
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    function withdraw(address payable to, uint256 amount) external onlyAdmin {
        require(to != address(0), "to=0");
        require(amount <= address(this).balance, "insufficient");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit Withdraw(to, amount, address(this).balance);
    }
}
