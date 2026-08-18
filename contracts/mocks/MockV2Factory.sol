// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MockV2Pair} from "./MockV2Pair.sol";

/// @dev Minimal UniswapV2/PancakeV2 factory mock for tests.
contract MockV2Factory {
    mapping(bytes32 => address) public pairs;

    event PairCreated(address indexed token0, address indexed token1, address pair);

    function _key(address a, address b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function setPair(address tokenA, address tokenB, address pair) external {
        pairs[_key(tokenA, tokenB)] = pair;
    }

    function getPair(address tokenA, address tokenB) external view returns (address pair) {
        return pairs[_key(tokenA, tokenB)];
    }

    /// @notice Mirrors UniswapV2Factory.createPair: deploys a new pair, sets
    /// its token0/token1 in canonical address order, registers it in the map,
    /// and returns its address.
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "IDENTICAL_ADDRESSES");
        require(pairs[_key(tokenA, tokenB)] == address(0), "PAIR_EXISTS");
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);

        MockV2Pair p = new MockV2Pair();
        p.setTokens(t0, t1);

        pair = address(p);
        pairs[_key(tokenA, tokenB)] = pair;
        emit PairCreated(t0, t1, pair);
    }
}
