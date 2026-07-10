// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockV2Pair} from "./MockV2Pair.sol";

/// @dev Minimal UniswapV2/PancakeV2 factory mock for tests.
contract MockV2Factory {
    mapping(bytes32 => address) public pairs;

    function _key(address a, address b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function setPair(address tokenA, address tokenB, address pair) external {
        pairs[_key(tokenA, tokenB)] = pair;
        MockV2Pair(pair).setTokens(tokenA < tokenB ? tokenA : tokenB, tokenA < tokenB ? tokenB : tokenA);
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        bytes32 key = _key(tokenA, tokenB);
        pair = pairs[key];
        if (pair != address(0)) return pair;
        MockV2Pair created = new MockV2Pair();
        created.setTokens(tokenA < tokenB ? tokenA : tokenB, tokenA < tokenB ? tokenB : tokenA);
        pair = address(created);
        pairs[key] = pair;
    }

    function getPair(address tokenA, address tokenB) external view returns (address pair) {
        return pairs[_key(tokenA, tokenB)];
    }
}