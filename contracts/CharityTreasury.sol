// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Multisig-controlled treasury for monthly league cap overflow.
/// @dev Deliberately has no operator/root-poster lane. Only the multisig can move funds.
contract CharityTreasury {
    using SafeERC20 for IERC20;

    address public immutable multisig;

    event NativeReceived(address indexed from, uint256 amount);
    event NativeWithdrawn(address indexed to, uint256 amount);
    event TokenWithdrawn(address indexed token, address indexed to, uint256 amount);

    error NotMultisig();
    error ZeroAddress();
    error InsufficientBalance();
    error NativeTransferFailed();

    modifier onlyMultisig() {
        if (msg.sender != multisig) revert NotMultisig();
        _;
    }

    constructor(address multisig_) {
        if (multisig_ == address(0)) revert ZeroAddress();
        multisig = multisig_;
    }

    receive() external payable {
        emit NativeReceived(msg.sender, msg.value);
    }

    function withdrawNative(address payable to, uint256 amount) external onlyMultisig {
        if (to == address(0)) revert ZeroAddress();
        if (amount > address(this).balance) revert InsufficientBalance();

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
        emit NativeWithdrawn(to, amount);
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyMultisig {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokenWithdrawn(token, to, amount);
    }
}
