// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Minimal UniswapV2/PancakeV2 pair mock for tests. Supports the
/// direct-mint LP path used by LaunchCampaign as the W15 fallback.
contract MockV2Pair {
    uint256 public totalSupply;
    uint112 private _r0;
    uint112 private _r1;
    uint32 private _ts;

    address public token0; // pair convention: token side
    address public token1; // pair convention: weth side

    function setTokens(address t0, address t1) external {
        token0 = t0;
        token1 = t1;
    }

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

    /// @notice Simplified UniswapV2Pair.mint(): infers deposited amounts
    /// from balance deltas vs cached reserves, mints arbitrary LP, and
    /// updates reserves. Sufficient for testing the W15 direct-mint
    /// fallback without re-implementing the full constant-product math.
    function mint(address /* to */) external returns (uint256 liquidity) {
        require(token0 != address(0) && token1 != address(0), "tokens unset");
        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = bal0 - uint256(_r0);
        uint256 amount1 = bal1 - uint256(_r1);
        require(amount0 > 0 && amount1 > 0, "INSUFFICIENT_LIQUIDITY_MINTED");
        liquidity = amount0 + amount1; // arbitrary; test doesn't care about ratio
        totalSupply += liquidity;
        _r0 = uint112(bal0);
        _r1 = uint112(bal1);
        _ts = uint32(block.timestamp);
    }
}
