// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockV2Pair} from "./MockV2Pair.sol";

/// @dev Minimal UniswapV2/PancakeV2/Topaz-compatible factory mock for tests.
contract MockV2Factory {
    mapping(bytes32 => address) public pairs;

    function _key(address a, address b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function setPair(address tokenA, address tokenB, address pair) external {
        pairs[_key(tokenA, tokenB)] = pair;
        MockV2Pair(pair).setTokens(tokenA < tokenB ? tokenA : tokenB, tokenA < tokenB ? tokenB : tokenA);
    }

    function setPool(address tokenA, address tokenB, bool stable, address pool) external {
        require(!stable, "stable pool unsupported");
        pairs[_key(tokenA, tokenB)] = pool;
        MockV2Pair(pool).setTokens(tokenA < tokenB ? tokenA : tokenB, tokenA < tokenB ? tokenB : tokenA);
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        return _create(tokenA, tokenB);
    }

    function createPool(address tokenA, address tokenB, bool stable) external returns (address pool) {
        require(!stable, "stable pool unsupported");
        return _create(tokenA, tokenB);
    }

    function getPair(address tokenA, address tokenB) external view returns (address pair) {
        return pairs[_key(tokenA, tokenB)];
    }

    function getPool(address tokenA, address tokenB, bool stable) external view returns (address pool) {
        require(!stable, "stable pool unsupported");
        return pairs[_key(tokenA, tokenB)];
    }

    function _create(address tokenA, address tokenB) internal returns (address pair) {
        bytes32 key = _key(tokenA, tokenB);
        pair = pairs[key];
        if (pair != address(0)) return pair;
        MockV2Pair created = new MockV2Pair();
        created.setTokens(tokenA < tokenB ? tokenA : tokenB, tokenA < tokenB ? tokenB : tokenA);
        pair = address(created);
        pairs[key] = pair;
    }
}
