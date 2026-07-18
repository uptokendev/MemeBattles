// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITopazRouter02} from "../interfaces/ITopazRouter02.sol";

/// @notice Exact subset of the production Topaz Router ABI used by MemeWarzone.
interface ITopazProductionRouter {
    function defaultFactory() external view returns (address);
    function weth() external view returns (address);

    function addLiquidityETH(
        address token,
        bool stable,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
}

/// @notice Immutable ABI adapter between MemeWarzone's audited router interface and Topaz production.
/// @dev The adapter contains no custody, administration, upgrade, rescue, or configuration paths.
contract TopazRouterAdapter is ITopazRouter02 {
    error ZeroAddress();
    error ContractCodeMissing();
    error InvalidTopazFactory();
    error InvalidWrappedNative();

    ITopazProductionRouter public immutable topazRouter;
    address private immutable _poolFactory;
    address private immutable _wrappedNative;

    constructor(address topazRouter_) {
        if (topazRouter_ == address(0)) revert ZeroAddress();
        if (topazRouter_.code.length == 0) revert ContractCodeMissing();

        ITopazProductionRouter productionRouter = ITopazProductionRouter(topazRouter_);
        address factory_ = productionRouter.defaultFactory();
        address wrapped_ = productionRouter.weth();

        if (factory_ == address(0) || factory_.code.length == 0) revert InvalidTopazFactory();
        if (wrapped_ == address(0) || wrapped_.code.length == 0) revert InvalidWrappedNative();

        topazRouter = productionRouter;
        _poolFactory = factory_;
        _wrappedNative = wrapped_;
    }

    /// @inheritdoc ITopazRouter02
    function poolFactory() external view returns (address) {
        return _poolFactory;
    }

    /// @inheritdoc ITopazRouter02
    function WETH() external view returns (address) {
        return _wrappedNative;
    }

    /// @inheritdoc ITopazRouter02
    function addLiquidityETH(
        address token,
        bool stable,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        external
        payable
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        return topazRouter.addLiquidityETH{value: msg.value}(
            token,
            stable,
            amountTokenDesired,
            amountTokenMin,
            amountETHMin,
            to,
            deadline
        );
    }
}
