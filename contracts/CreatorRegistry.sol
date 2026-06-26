// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Contract-level creator tier, cooldown, and live bonding token enforcement.
/// @dev Backend/admin remains the risk brain; this registry is the on-chain enforcement source.
contract CreatorRegistry is Ownable {
    enum CreatorTier {
        Unknown,
        NewCreator,
        TrustedCreator,
        ProvenCreator
    }

    struct CreatorProfile {
        CreatorTier tier;
        uint256 trustScore;
        uint256 liveBondingCount;
        uint256 lastLaunchTimestamp;
        bool restricted;
        bool manualReviewRequired;
    }

    struct CreatorRules {
        uint256 maxLiveBonding;
        uint256 cooldownSeconds;
        uint256 creatorBuyLockSeconds;
        uint256 creatorBuyCapWei;
        uint256 maxClusterWallets;
    }

    mapping(address => CreatorProfile) private _profiles;
    mapping(address => bool) public launchRecorder;

    event CreatorTierUpdated(address indexed creator, CreatorTier tier);
    event CreatorTrustScoreUpdated(address indexed creator, uint256 trustScore);
    event CreatorRestrictedUpdated(address indexed creator, bool restricted);
    event CreatorManualReviewUpdated(address indexed creator, bool manualReviewRequired);
    event LaunchRecorderUpdated(address indexed recorder, bool allowed);
    event CreatorLaunchRecorded(address indexed creator, uint256 liveBondingCount, uint256 launchedAt);
    event CreatorGraduationRecorded(address indexed creator, uint256 liveBondingCount);

    error CreatorZero();
    error RecorderZero();
    error NotLaunchRecorder();
    error InvalidTier();
    error CreatorRestricted();
    error CreatorManualReview();
    error CreatorCooldown();
    error CreatorLiveLimit();

    modifier onlyLaunchRecorder() {
        if (!launchRecorder[msg.sender]) revert NotLaunchRecorder();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setLaunchRecorder(address recorder, bool allowed) external onlyOwner {
        if (recorder == address(0)) revert RecorderZero();
        launchRecorder[recorder] = allowed;
        emit LaunchRecorderUpdated(recorder, allowed);
    }

    function setCreatorTier(address creator, CreatorTier tier) external onlyOwner {
        if (creator == address(0)) revert CreatorZero();
        if (tier == CreatorTier.Unknown) revert InvalidTier();
        _profiles[creator].tier = tier;
        emit CreatorTierUpdated(creator, tier);
    }

    function setCreatorTrustScore(address creator, uint256 trustScore) external onlyOwner {
        if (creator == address(0)) revert CreatorZero();
        _profiles[creator].trustScore = trustScore;
        emit CreatorTrustScoreUpdated(creator, trustScore);
    }

    function setCreatorRestricted(address creator, bool restricted) external onlyOwner {
        if (creator == address(0)) revert CreatorZero();
        _profiles[creator].restricted = restricted;
        emit CreatorRestrictedUpdated(creator, restricted);
    }

    function setManualReviewRequired(address creator, bool required) external onlyOwner {
        if (creator == address(0)) revert CreatorZero();
        _profiles[creator].manualReviewRequired = required;
        emit CreatorManualReviewUpdated(creator, required);
    }

    function recordLaunch(address creator) external onlyLaunchRecorder {
        _assertCanLaunch(creator);
        CreatorProfile storage profile = _profiles[creator];
        profile.liveBondingCount += 1;
        profile.lastLaunchTimestamp = block.timestamp;
        emit CreatorLaunchRecorded(creator, profile.liveBondingCount, block.timestamp);
    }

    function recordGraduation(address creator) external onlyLaunchRecorder {
        if (creator == address(0)) revert CreatorZero();
        CreatorProfile storage profile = _profiles[creator];
        if (profile.liveBondingCount > 0) {
            profile.liveBondingCount -= 1;
        }
        emit CreatorGraduationRecorded(creator, profile.liveBondingCount);
    }

    function canLaunch(address creator) external view returns (bool) {
        if (creator == address(0)) return false;
        CreatorProfile memory profile = _profiles[creator];
        CreatorRules memory rules = getCreatorRules(creator);
        if (profile.restricted || profile.manualReviewRequired) return false;
        if (profile.liveBondingCount >= rules.maxLiveBonding) return false;
        if (profile.lastLaunchTimestamp != 0 && block.timestamp < profile.lastLaunchTimestamp + rules.cooldownSeconds) return false;
        return true;
    }

    function getCreatorProfile(address creator) external view returns (CreatorProfile memory) {
        return _profiles[creator];
    }

    function getCreatorRules(address creator) public view returns (CreatorRules memory) {
        CreatorTier tier = _effectiveTier(_profiles[creator].tier);
        return _rulesForTier(tier);
    }

    function getRulesForTier(CreatorTier tier) external pure returns (CreatorRules memory) {
        if (tier == CreatorTier.Unknown) tier = CreatorTier.NewCreator;
        return _rulesForTier(tier);
    }

    function _assertCanLaunch(address creator) internal view {
        if (creator == address(0)) revert CreatorZero();
        CreatorProfile memory profile = _profiles[creator];
        CreatorRules memory rules = getCreatorRules(creator);
        if (profile.restricted) revert CreatorRestricted();
        if (profile.manualReviewRequired) revert CreatorManualReview();
        if (profile.liveBondingCount >= rules.maxLiveBonding) revert CreatorLiveLimit();
        if (profile.lastLaunchTimestamp != 0 && block.timestamp < profile.lastLaunchTimestamp + rules.cooldownSeconds) revert CreatorCooldown();
    }

    function _effectiveTier(CreatorTier tier) internal pure returns (CreatorTier) {
        return tier == CreatorTier.Unknown ? CreatorTier.NewCreator : tier;
    }

    function _rulesForTier(CreatorTier tier) internal pure returns (CreatorRules memory) {
        if (tier == CreatorTier.NewCreator) {
            return CreatorRules({
                maxLiveBonding: 3,
                cooldownSeconds: 24 hours,
                creatorBuyLockSeconds: 24 hours,
                creatorBuyCapWei: 0.25 ether,
                maxClusterWallets: 3
            });
        }
        if (tier == CreatorTier.TrustedCreator) {
            return CreatorRules({
                maxLiveBonding: 5,
                cooldownSeconds: 24 hours,
                creatorBuyLockSeconds: 6 hours,
                creatorBuyCapWei: 1 ether,
                maxClusterWallets: 5
            });
        }
        if (tier == CreatorTier.ProvenCreator) {
            return CreatorRules({
                maxLiveBonding: 10,
                cooldownSeconds: 24 hours,
                creatorBuyLockSeconds: 1 hours,
                creatorBuyCapWei: 3 ether,
                maxClusterWallets: 10
            });
        }
        revert InvalidTier();
    }
}
