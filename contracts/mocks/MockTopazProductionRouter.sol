// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockTopazFactory} from "./MockTopazFactory.sol";
import {MockTopazPool} from "./MockTopazPool.sol";

/// @dev Test double that exposes the same getter names used by the production Topaz Router.
contract MockTopazProductionRouter {
    error Expired();
    error StablePoolUnsupported();
    error InsufficientTokenAmount();
    error InsufficientNativeAmount();

    address public immutable defaultFactory;
    address public immutable weth;

    constructor(address factory_, address wrapped_) {
        defaultFactory = factory_;
        weth = wrapped_;
    }

    function addLiquidityETH(
        address token,
        bool stable,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        external
        payable
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        if (stable) revert StablePoolUnsupported();
        if (deadline != 0 && deadline < block.timestamp) revert Expired();
        if (amountTokenDesired < amountTokenMin) revert InsufficientTokenAmount();
        if (msg.value < amountETHMin) revert InsufficientNativeAmount();

        IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        amountToken = amountTokenDesired;
        amountETH = msg.value;
        liquidity = amountTokenDesired + msg.value;

        address pool = MockTopazFactory(defaultFactory).getPool(token, weth, false);
        if (pool == address(0)) pool = MockTopazFactory(defaultFactory).createPool(token, weth, false);
        MockTopazPool(pool).setReserves(uint112(amountToken), uint112(amountETH));
        MockTopazPool(pool).mint(to, liquidity);
    }
}
