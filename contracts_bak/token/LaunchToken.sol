// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract LaunchToken is ERC20, Ownable {
    uint256 public immutable cap;

    // Trading / transfer control
    bool public tradingEnabled;

    error TradingNotEnabled();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 cap_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        require(cap_ > 0, "cap is zero");
        require(owner_ != address(0), "owner is zero");
        cap = cap_;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "to zero");
        require(totalSupply() + amount <= cap, "cap exceeded");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    /// @notice Called by the campaign (token owner) when liquidity is added and trading should start.
    function enableTrading() external onlyOwner {
        tradingEnabled = true;
    }

    /// @dev OZ v5 hook that centralizes all balance changes.
    function _update(address from, address to, uint256 value) internal override {
        if (!tradingEnabled) {
            // Before trading is enabled, only allow:
            // - mints (from == address(0))
            // - transfers where the campaign (owner) is the source
            // - transfers initiated by the campaign (owner), e.g. sellExactTokens
            //
            // This blocks:
            // - user -> user transfers
            // - user -> router addLiquidity attempts
            if (from != address(0) && from != owner() && msg.sender != owner()) {
                revert TradingNotEnabled();
            }
        }

        super._update(from, to, value);
    }
}
