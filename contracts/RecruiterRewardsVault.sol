// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NativeTreasuryVaultBase} from "./NativeTreasuryVaultBase.sol";

/// @title RecruiterRewardsVault
/// @notice Custodial native-asset bucket for recruiter-directed fee slices.
contract RecruiterRewardsVault is NativeTreasuryVaultBase {
    constructor(address _admin) NativeTreasuryVaultBase(_admin) {}
}
