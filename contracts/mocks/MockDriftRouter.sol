// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPancakeRouter02} from "../interfaces/IPancakeRouter02.sol";
import {ITopazRouter02} from "../interfaces/ITopazRouter02.sol";
import {MockV2Factory} from "./MockV2Factory.sol";
import {MockV2Pair} from "./MockV2Pair.sol";

contract MockDriftRouter is IPancakeRouter02, ITopazRouter02 {
    address private immutable _factory;
    address private immutable _wrapped;

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
        address,
        uint256
    )
        external
        payable
        override(IPancakeRouter02)
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        return _addDriftLiquidity(token, amountTokenDesired);
    }

    function addLiquidityETH(
        address token,
        bool stable,
        uint256 amountTokenDesired,
        uint256,
        uint256,
        address,
        uint256
    )
        external
        payable
        override(ITopazRouter02)
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        require(!stable, "stable pool unsupported");
        return _addDriftLiquidity(token, amountTokenDesired);
    }

    function _addDriftLiquidity(address token, uint256 amountTokenDesired)
        internal
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        amountToken = amountTokenDesired / 2;
        amountETH = msg.value;
        liquidity = amountToken + amountETH;

        IERC20(token).transferFrom(msg.sender, address(this), amountToken);

        address pair = MockV2Factory(_factory).getPair(token, _wrapped);
        if (pair == address(0)) pair = MockV2Factory(_factory).createPair(token, _wrapped);
        MockV2Pair(pair).setReserves(uint112(amountToken), uint112(amountETH));
        MockV2Pair(pair).setTotalSupply(1);
    }
}
