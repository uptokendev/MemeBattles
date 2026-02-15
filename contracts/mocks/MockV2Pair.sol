// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Minimal UniswapV2/PancakeV2 pair mock for tests.
contract MockV2Pair {
    uint256 public totalSupply;
    uint112 private _r0;
    uint112 private _r1;
    uint32 private _ts;

    function setTotalSupply(uint256 v) external {
        totalSupply = v;
    }

    function setReserves(uint112 r0, uint112 r1) external {
        _r0 = r0;
        _r1 = r1;
        _ts = uint32(block.timestamp);
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (_r0, _r1, _ts);
    }
}
