// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice On-chain enforcement registry for wallet and cluster restrictions.
/// @dev Detection happens off-chain. Backend/admin syncs final enforcement state here.
contract RiskRegistry is Ownable {
    struct WalletRiskProfile {
        uint8 riskLevel;
        bool restricted;
        bytes32 clusterId;
    }

    struct ClusterProfile {
        uint256 size;
        uint8 riskLevel;
        bool restricted;
    }

    mapping(address => WalletRiskProfile) private _wallets;
    mapping(bytes32 => ClusterProfile) private _clusters;

    event WalletRiskUpdated(address indexed wallet, uint8 riskLevel, bool restricted);
    event WalletClusterUpdated(address indexed wallet, bytes32 indexed clusterId);
    event ClusterRiskUpdated(bytes32 indexed clusterId, uint256 size, uint8 riskLevel, bool restricted);

    error WalletZero();
    error ClusterZero();
    error WalletRestricted();
    error ClusterRestricted();
    error ClusterTooLarge();

    constructor() Ownable(msg.sender) {}

    function setWalletRisk(address wallet, uint8 riskLevel, bool restricted) external onlyOwner {
        if (wallet == address(0)) revert WalletZero();
        WalletRiskProfile storage profile = _wallets[wallet];
        profile.riskLevel = riskLevel;
        profile.restricted = restricted;
        emit WalletRiskUpdated(wallet, riskLevel, restricted);
    }

    function setWalletCluster(address wallet, bytes32 clusterId) external onlyOwner {
        if (wallet == address(0)) revert WalletZero();
        _wallets[wallet].clusterId = clusterId;
        emit WalletClusterUpdated(wallet, clusterId);
    }

    function setClusterRisk(bytes32 clusterId, uint256 size, uint8 riskLevel, bool restricted) external onlyOwner {
        if (clusterId == bytes32(0)) revert ClusterZero();
        _clusters[clusterId] = ClusterProfile({size: size, riskLevel: riskLevel, restricted: restricted});
        emit ClusterRiskUpdated(clusterId, size, riskLevel, restricted);
    }

    function canWalletTrade(address wallet) external view returns (bool) {
        if (wallet == address(0)) return false;
        WalletRiskProfile memory walletProfile = _wallets[wallet];
        if (walletProfile.restricted) return false;
        if (walletProfile.clusterId != bytes32(0) && _clusters[walletProfile.clusterId].restricted) return false;
        return true;
    }

    function canCreatorLaunch(address creator, uint256 maxClusterWallets) external view returns (bool) {
        if (creator == address(0)) return false;
        WalletRiskProfile memory walletProfile = _wallets[creator];
        if (walletProfile.restricted) return false;
        if (walletProfile.clusterId == bytes32(0)) return true;

        ClusterProfile memory cluster = _clusters[walletProfile.clusterId];
        if (cluster.restricted) return false;
        if (maxClusterWallets > 0 && cluster.size > maxClusterWallets) return false;
        return true;
    }

    function assertWalletCanTrade(address wallet) external view {
        if (wallet == address(0)) revert WalletZero();
        WalletRiskProfile memory walletProfile = _wallets[wallet];
        if (walletProfile.restricted) revert WalletRestricted();
        if (walletProfile.clusterId != bytes32(0) && _clusters[walletProfile.clusterId].restricted) revert ClusterRestricted();
    }

    function assertCreatorCanLaunch(address creator, uint256 maxClusterWallets) external view {
        if (creator == address(0)) revert WalletZero();
        WalletRiskProfile memory walletProfile = _wallets[creator];
        if (walletProfile.restricted) revert WalletRestricted();
        if (walletProfile.clusterId == bytes32(0)) return;

        ClusterProfile memory cluster = _clusters[walletProfile.clusterId];
        if (cluster.restricted) revert ClusterRestricted();
        if (maxClusterWallets > 0 && cluster.size > maxClusterWallets) revert ClusterTooLarge();
    }

    function getWalletRisk(address wallet) external view returns (WalletRiskProfile memory) {
        return _wallets[wallet];
    }

    function getClusterRisk(bytes32 clusterId) external view returns (ClusterProfile memory) {
        return _clusters[clusterId];
    }
}
