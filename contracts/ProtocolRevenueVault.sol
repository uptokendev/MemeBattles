// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NativeTreasuryVaultBase} from "./NativeTreasuryVaultBase.sol";

/// @title ProtocolRevenueVault
/// @notice Custodial native-asset bucket for residual protocol revenue after reward splits.
contract ProtocolRevenueVault is NativeTreasuryVaultBase {
    constructor(address _admin) NativeTreasuryVaultBase(_admin) {}
}
