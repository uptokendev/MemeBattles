// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPancakeRouter02} from "../interfaces/IPancakeRouter02.sol";
import {MockV2Factory} from "./MockV2Factory.sol";
import {MockV2Pair} from "./MockV2Pair.sol";

contract MockRouter is IPancakeRouter02 {
    address private immutable _factory;
    address private immutable _wrapped;

    /// @dev Mirrors UniswapV2Library.quote: addLiquidity reverts when the
    /// pair has one-sided reserves (the pre-seeded-pair attack surface).
    error InsufficientLiquidity();

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
        // Mirror UniswapV2Router02._addLiquidity behavior with respect to
        // existing reserves. If reserves are zero on both sides we accept the
        // requested amounts (first-mint case). If reserves are one-sided we
        // revert via UniswapV2Library.quote — this is the attack surface
        // Ackee finding W15 describes.
        address pair = MockV2Factory(_factory).getPair(token, _wrapped);
        if (pair != address(0)) {
            // Pair convention in our mocks: setReserves(tokenAmount, wethAmount).
            (uint112 reserveToken, uint112 reserveWeth, ) = MockV2Pair(pair).getReserves();
            if (
                (reserveToken == 0 && reserveWeth > 0) ||
                (reserveToken > 0 && reserveWeth == 0)
            ) {
                revert InsufficientLiquidity();
            }
        }

        IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        amountToken = amountTokenDesired;
        amountETH = msg.value;
        liquidity = amountTokenDesired + msg.value;

        // Test helper behavior: if a v2 pair is registered in the mock factory,
        // update its reserves/totalSupply to simulate an actual AMM pool.
        if (pair != address(0)) {
            MockV2Pair(pair).setReserves(uint112(amountTokenDesired), uint112(msg.value));
            // Non-zero to indicate "LP minted" (exact value isn't important in our tests).
            MockV2Pair(pair).setTotalSupply(1);
        }
        emit LiquidityAdded(token, amountToken, amountETH, to);
    }
}
