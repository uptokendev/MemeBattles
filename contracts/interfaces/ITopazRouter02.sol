// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITopazRouter02 {
    function poolFactory() external view returns (address);

    function WETH() external view returns (address);

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
        returns (
            uint256 amountToken,
            uint256 amountETH,
            uint256 liquidity
        );
}
