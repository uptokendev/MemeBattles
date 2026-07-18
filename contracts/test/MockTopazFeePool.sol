// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockTopazFeeFactory {
    uint256 public feeBps;

    constructor(uint256 feeBps_) {
        feeBps = feeBps_;
    }

    function setFeeBps(uint256 feeBps_) external {
        feeBps = feeBps_;
    }

    function getFee(address, bool) external view returns (uint256) {
        return feeBps;
    }
}

contract MockTopazFeePool is ERC20 {
    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    bool public immutable stable;

    constructor(address factory_, address token0_, address token1_, bool stable_) ERC20("Mock Topaz LP", "mTLP") {
        factory = factory_;
        token0 = token0_;
        token1 = token1_;
        stable = stable_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function claimFees() external pure returns (uint256, uint256) {
        return (0, 0);
    }
}
