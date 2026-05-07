// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Subset of IPancakeFactory needed to fall back to direct LP mint
/// when an attacker has front-run pair creation (Ackee W15 mitigation).
interface IPancakeV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address);
    function createPair(address tokenA, address tokenB) external returns (address);
}

/// @notice Subset of IPancakeV2Pair needed to read reserves and mint LP
/// directly without going through the router.
interface IPancakeV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 timestamp);
    function token0() external view returns (address);
    function mint(address to) external returns (uint256 liquidity);
}

/// @notice Minimal Wrapped Native (WBNB / WETH) interface for the
/// direct-mint LP fallback. We wrap our native into WBNB before
/// transferring it into the pair.
interface IWrappedNative {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
}
