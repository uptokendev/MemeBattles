// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITopazV2Factory {
    function getPool(address tokenA, address tokenB, bool stable) external view returns (address pool);
}
