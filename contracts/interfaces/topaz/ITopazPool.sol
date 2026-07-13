// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Topaz pool surface required by the permanent LP locker.
interface ITopazPool {
    function claimFees() external returns (uint256 amount0, uint256 amount1);

    function token0() external view returns (address);

    function token1() external view returns (address);

    function claimable0(address account) external view returns (uint256);

    function claimable1(address account) external view returns (uint256);

    function stable() external view returns (bool);
}
