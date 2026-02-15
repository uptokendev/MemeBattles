// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Minimal UniswapV2/PancakeV2 factory mock for tests.
contract MockV2Factory {
    mapping(bytes32 => address) public pairs;

    function _key(address a, address b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function setPair(address tokenA, address tokenB, address pair) external {
        pairs[_key(tokenA, tokenB)] = pair;
    }

    function getPair(address tokenA, address tokenB) external view returns (address pair) {
        return pairs[_key(tokenA, tokenB)];
    }
}
