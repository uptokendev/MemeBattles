// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal UniswapV2/PancakeV2 pair mock for tests.
contract MockV2Pair {
    address public token0;
    address public token1;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    uint112 private _r0;
    uint112 private _r1;
    uint32 private _ts;

    function setTokens(address token0_, address token1_) external {
        token0 = token0_;
        token1 = token1_;
    }

    function setTotalSupply(uint256 v) external {
        uint256 currentBalance = balanceOf[msg.sender];
        if (v > totalSupply) {
            uint256 delta = v - totalSupply;
            balanceOf[msg.sender] = currentBalance + delta;
        } else if (v < totalSupply) {
            uint256 delta = totalSupply - v;
            require(currentBalance >= delta, "insufficient mock balance");
            balanceOf[msg.sender] = currentBalance - delta;
        }
        totalSupply = v;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
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