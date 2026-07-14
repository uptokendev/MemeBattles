// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ITopazRouter02} from "../interfaces/ITopazRouter02.sol";
import {MockTopazFactory} from "./MockTopazFactory.sol";
import {MockTopazPool} from "./MockTopazPool.sol";

contract MockTopazDriftRouter is ITopazRouter02 {
    address private immutable _poolFactory;
    address private immutable _wrapped;

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
        amountToken = amountTokenDesired / 2;
        amountETH = msg.value;
        liquidity = amountToken + amountETH;

        IERC20(token).transferFrom(msg.sender, address(this), amountToken);

        address pool = MockTopazFactory(_poolFactory).getPool(token, _wrapped, false);
        if (pool == address(0)) pool = MockTopazFactory(_poolFactory).createPool(token, _wrapped, false);
        MockTopazPool(pool).setReserves(uint112(amountToken), uint112(amountETH));
        MockTopazPool(pool).mint(to, liquidity);
    }
}
