// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPancakeRouter02} from "../interfaces/IPancakeRouter02.sol";

contract MockRouter is IPancakeRouter02 {
    address private immutable _factory;
    address private immutable _wrapped;

    event LiquidityAdded(
        address indexed token,
        uint256 amountToken,
        uint256 amountETH,
        address indexed to
    );

    constructor(address factory_, address wrapped_) {
        _factory = factory_;
        _wrapped = wrapped_;
    }

    function factory() external view override returns (address) {
        return _factory;
    }

    function WETH() external view override returns (address) {
        return _wrapped;
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256,
        uint256,
        address to,
        uint256
    )
        external
        payable
        override
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        amountToken = amountTokenDesired;
        amountETH = msg.value;
        liquidity = amountTokenDesired + msg.value;
        emit LiquidityAdded(token, amountToken, amountETH, to);
    }
}
