// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Shared permanent locker for approved Topaz LP tokens.
/// @dev Registered LP tokens can enter but cannot be withdrawn or approved out by anyone.
contract PermanentLpLocker {
    using SafeERC20 for IERC20;

    address public immutable admin;
    mapping(address => bool) public registeredLpToken;
    mapping(address => uint256) public lockedBalance;
    mapping(address => mapping(address => uint256)) public lockedByDepositor;

    event LpTokenRegistered(address indexed lpToken);
    event LpPermanentlyLocked(address indexed lpToken, address indexed depositor, uint256 amount, uint256 totalLocked);
    event UnregisteredTokenRecovered(address indexed token, address indexed to, uint256 amount);

    error OnlyAdmin();
    error ZeroAddress();
    error ZeroAmount();
    error AlreadyRegistered();
    error LpTokenNotRegistered();
    error RegisteredLpRecoveryBlocked();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    constructor(address admin_) {
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
    }

    function registerLpToken(address lpToken) external onlyAdmin {
        if (lpToken == address(0)) revert ZeroAddress();
        if (registeredLpToken[lpToken]) revert AlreadyRegistered();
        registeredLpToken[lpToken] = true;
        emit LpTokenRegistered(lpToken);

        uint256 currentBalance = IERC20(lpToken).balanceOf(address(this));
        if (currentBalance > 0) {
            lockedBalance[lpToken] = currentBalance;
            lockedByDepositor[lpToken][address(this)] = currentBalance;
            emit LpPermanentlyLocked(lpToken, address(this), currentBalance, currentBalance);
        }
    }

    function lock(address lpToken, uint256 amount) external {
        if (!registeredLpToken[lpToken]) revert LpTokenNotRegistered();
        if (amount == 0) revert ZeroAmount();

        lockedBalance[lpToken] += amount;
        lockedByDepositor[lpToken][msg.sender] += amount;
        IERC20(lpToken).safeTransferFrom(msg.sender, address(this), amount);

        emit LpPermanentlyLocked(lpToken, msg.sender, amount, lockedBalance[lpToken]);
    }

    function recoverUnregisteredToken(address token, address to, uint256 amount) external onlyAdmin {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (registeredLpToken[token]) revert RegisteredLpRecoveryBlocked();

        IERC20(token).safeTransfer(to, amount);
        emit UnregisteredTokenRecovered(token, to, amount);
    }
}
