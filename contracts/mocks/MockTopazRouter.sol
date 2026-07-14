// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ITopazRouter02} from "../interfaces/ITopazRouter02.sol";
import {MockTopazFactory} from "./MockTopazFactory.sol";
import {MockTopazPool} from "./MockTopazPool.sol";

contract MockTopazRouter is ITopazRouter02 {
    address private immutable _poolFactory;
    address private immutable _wrapped;

    event LiquidityAdded(address indexed token, uint256 amountToken, uint256 amountETH, address indexed to);
    event TopazLiquidityAdded(address indexed token, bool stable, uint256 amountToken, uint256 amountETH, address indexed to);

    constructor(address poolFactory_, address wrapped_) {
        _poolFactory = poolFactory_;
        _wrapped = wrapped_;
    }

    function factory() external view returns (address) {
        return _poolFactory;
    }

    function poolFactory() external view override returns (address) {
        return _poolFactory;
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
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        (amountToken, amountETH, liquidity) = _addLiquidity(token, amountTokenDesired, to);
        emit LiquidityAdded(token, amountToken, amountETH, to);
    }

    function addLiquidityETH(
        address token,
        bool stable,
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
        require(!stable, "stable pool unsupported");
        (amountToken, amountETH, liquidity) = _addLiquidity(token, amountTokenDesired, to);
        emit LiquidityAdded(token, amountToken, amountETH, to);
        emit TopazLiquidityAdded(token, stable, amountToken, amountETH, to);
    }

    function _addLiquidity(address token, uint256 amountTokenDesired, address to)
        internal
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        amountToken = amountTokenDesired;
        amountETH = msg.value;
        liquidity = amountTokenDesired + msg.value;

        address pool = MockTopazFactory(_poolFactory).getPool(token, _wrapped, false);
        if (pool == address(0)) pool = MockTopazFactory(_poolFactory).createPool(token, _wrapped, false);
        MockTopazPool(pool).setReserves(uint112(amountTokenDesired), uint112(msg.value));
        MockTopazPool(pool).mint(to, liquidity);
    }
}
