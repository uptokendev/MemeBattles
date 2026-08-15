// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NativeTreasuryVaultBase} from "./NativeTreasuryVaultBase.sol";

/// @title ProtocolRevenueVault
/// @notice Residual protocol revenue after reward splits.
///         Operator is filled first up to a USD cap; overflow stays for the
///         admin/multisig (or is forwarded to `overflowTreasury` if set).
contract ProtocolRevenueVault is NativeTreasuryVaultBase {
    uint256 internal constant WAD = 1e18;

    address public operator;
    address public overflowTreasury;
    uint256 public operatorFillCapUsd;
    uint256 public operatorFilledUsd;
    uint256 public nativeUsdPrice;

    event OperatorFillUpdated(address indexed operator, address indexed overflowTreasury, uint256 capUsd, uint256 nativeUsdPrice);
    event OperatorFilled(address indexed operator, uint256 amount, uint256 filledUsd);

    constructor(address _admin) NativeTreasuryVaultBase(_admin) {
        operatorFillCapUsd = 10_000 * WAD;
    }

    function setOperatorFill(
        address newOperator,
        address newOverflowTreasury,
        uint256 newCapUsd,
        uint256 newNativeUsdPrice
    ) external onlyAdmin {
        require(newCapUsd > 0, "cap=0");
        operator = newOperator;
        overflowTreasury = newOverflowTreasury;
        operatorFillCapUsd = newCapUsd;
        nativeUsdPrice = newNativeUsdPrice;
        emit OperatorFillUpdated(newOperator, newOverflowTreasury, newCapUsd, newNativeUsdPrice);
    }

    receive() external payable override {
        require(msg.value > 0, "amount=0");
        _applyOperatorFill(msg.value);
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    function _applyOperatorFill(uint256 amount) internal {
        if (operator == address(0) || nativeUsdPrice == 0 || operatorFilledUsd >= operatorFillCapUsd) {
            _forwardOverflow(amount);
            return;
        }
        uint256 usd = (amount * nativeUsdPrice) / WAD;
        if (usd == 0) {
            _forwardOverflow(amount);
            return;
        }
        uint256 remainingUsd = operatorFillCapUsd - operatorFilledUsd;
        if (usd <= remainingUsd) {
            operatorFilledUsd += usd;
            (bool ok, ) = operator.call{value: amount}("");
            require(ok, "operator send");
            emit OperatorFilled(operator, amount, operatorFilledUsd);
            return;
        }
        uint256 toOperator = (amount * remainingUsd) / usd;
        operatorFilledUsd = operatorFillCapUsd;
        if (toOperator > 0) {
            (bool ok, ) = operator.call{value: toOperator}("");
            require(ok, "operator send");
            emit OperatorFilled(operator, toOperator, operatorFilledUsd);
        }
        uint256 rest = amount - toOperator;
        if (rest > 0) _forwardOverflow(rest);
    }

    function _forwardOverflow(uint256 amount) internal {
        if (amount == 0 || overflowTreasury == address(0) || overflowTreasury == address(this)) {
            return;
        }
        (bool ok, ) = overflowTreasury.call{value: amount}("");
        require(ok, "overflow send");
    }
}
