// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPancakeRouter02} from "../interfaces/IPancakeRouter02.sol";
import {ITopazRouter02} from "../interfaces/ITopazRouter02.sol";
import {MockV2Factory} from "./MockV2Factory.sol";
import {MockV2Pair} from "./MockV2Pair.sol";

contract MockRouter is IPancakeRouter02, ITopazRouter02 {
    address private immutable _factory;
    address private immutable _wrapped;

    event LiquidityAdded(address indexed token, uint256 amountToken, uint256 amountETH, address indexed to);
    event TopazLiquidityAdded(address indexed token, bool stable, uint256 amountToken, uint256 amountETH, address indexed to);

    constructor(address factory_, address wrapped_) {
        _factory = factory_;
        _wrapped = wrapped_;
    }

    function factory() external view override returns (address) {
        return _factory;
    }

    function poolFactory() external view override returns (address) {
        return _factory;
    }

    function WETH() external view override(IPancakeRouter02, ITopazRouter02) returns (address) {
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
        override(IPancakeRouter02)
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        (amountToken, amountETH, liquidity) = _addLiquidity(token, amountTokenDesired);
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
        override(ITopazRouter02)
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        require(!stable, "stable pool unsupported");
        (amountToken, amountETH, liquidity) = _addLiquidity(token, amountTokenDesired);
        emit LiquidityAdded(token, amountToken, amountETH, to);
        emit TopazLiquidityAdded(token, stable, amountToken, amountETH, to);
    }

    function _addLiquidity(address token, uint256 amountTokenDesired)
        internal
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        amountToken = amountTokenDesired;
        amountETH = msg.value;
        liquidity = amountTokenDesired + msg.value;

        address pair = MockV2Factory(_factory).getPair(token, _wrapped);
        if (pair == address(0)) pair = MockV2Factory(_factory).createPair(token, _wrapped);
        MockV2Pair(pair).setReserves(uint112(amountTokenDesired), uint112(msg.value));
        // Non-zero to indicate "LP minted" (exact value isn't important in our tests).
        MockV2Pair(pair).setTotalSupply(1);
    }
}
