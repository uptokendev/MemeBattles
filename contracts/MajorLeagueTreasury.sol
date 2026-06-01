// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MajorLeagueTreasury
 * @dev Secure treasury for PostGrad Major Leagues (Divisions, Seasonal Prizes, Championships, etc.).
 *
 * This is the central home for all league-related prize money in the PostGrad system.
 *
 * SECURITY MODEL (same philosophy as BattleTreasury):
 * - Platform cannot arbitrarily withdraw funds.
 * - Only authorized "distributors" (backend or future LeagueManager contract) can allocate rewards.
 * - Winners claim their rewards (with optional platform fee).
 * - Clear audit trail via events.
 *
 * See POSTGRAD_REVENUE_DECISION_TABLE.md for the full architecture.
 */
contract MajorLeagueTreasury is ReentrancyGuard, Ownable {

    // === FEE CONFIG (consistent with BattleTreasury) ===
    // Recommended:
    // === FEE CONFIG (Finalized) ===
    // - protocolFeeReceiver     → ProtocolRevenueVault (the 5%)
    // - seasonalTreasuryReceiver → This contract (self)
    //
    // League/seasonal prize distributions: 100% to winners (no platform fee taken here)
    //
    // IMPORTANT: This is SEPARATE from the existing TreasuryVault system
    // used by the non-PostGrad League page (for total prize pool, weekly & monthly calculations).
    //
    // See contracts/POSTGRAD_REVENUE_DECISION_TABLE.md
    address public protocolFeeReceiver;
    address public seasonalTreasuryReceiver;
    uint256 public protocolFeeBps;
    uint256 public seasonalFeeBps;

    // Authorized addresses that can trigger distributions (e.g. LeagueManager contract or backend multisig)
    mapping(address => bool) public distributors;

    // Additional safety: Maximum amount one distributor can allocate in a single transaction.
    // Phase 5: now controllable only via timelocked proposeMaxAllocationPerTx / execute (global fallback).
    uint256 public maxAllocationPerTx;

    // Track prize pools per season/division/event
    mapping(bytes32 => uint256) public prizePools;           // seasonId or leagueId => total allocated
    mapping(bytes32 => mapping(address => uint256)) public pendingRewards;

    // Revenue received from battles/sponsorships that hasn't yet been assigned to a specific prize pool
    uint256 public unallocatedBalance;

    // Finalized rules (see POSTGRAD_REVENUE_DECISION_TABLE.md):
    // - Receives 10% from BattleTreasury + 15% from SponsorshipPayments
    // - League/seasonal prize distributions: 100% to winners (no fee taken here)
    // - This contract is SEPARATE from the existing TreasuryVault system used by the non-PostGrad League page

    // Note on War Pools: BattleTreasury may be reused for betting pots (per current decision)

    // Accounting for protocol fees that failed to transfer out of this treasury.
    // Phase 1: see retryPendingFee (anyone) + timelocked pendingFeeRedirect (owner, fee-only) below.
    mapping(address => uint256) public pendingFeeWithdrawals;

    // Events
    event PrizeFunded(bytes32 indexed poolId, uint256 amount, address indexed from);
    event RewardAllocated(bytes32 indexed poolId, address indexed recipient, uint256 amount);
    event RewardClaimed(bytes32 indexed poolId, address indexed recipient, uint256 amount);
    event FeesDistributed(uint256 protocolFee, uint256 seasonalFee);
    // DistributorUpdated remains unchanged (and compatible) after Phase 3. Limits are carried in the proposal/pending struct
    // and bound at execute time; the on-chain event for role toggle stays (address, bool) for existing listeners.
    // Phase 4 follow-up adds the richer DistributorChangeProposed/Executed (with limits) alongside it for full observability.
    event DistributorUpdated(address indexed distributor, bool allowed);

    // Specific event for inflows from the 15% sponsorship cut (for easy tracking)
    // Phase 4 follow-up: expanded with indexed poolId (matching BattleCutReceived shape) for complete pool attribution on sponsorship revenue.
    event SponsorshipCutReceived(bytes32 indexed sponsorshipId, bytes32 indexed poolId, uint256 amount, address indexed from);
    event FeeTransferFailed(address indexed receiver, uint256 amount, bytes32 indexed poolId);

    // Pass 3 remediation (phased-build-267caf05): dedicated event for battle cuts (in addition to generic PrizeFunded)
    event BattleCutReceived(bytes32 indexed battleId, bytes32 indexed poolId, uint256 amount);

    // Pass 3 remediation (phased-build-267caf05): cancellation events for pending timelock proposals (operational safety)
    event PendingProtocolFeeReceiverCancelled();
    event PendingSeasonalTreasuryReceiverCancelled();
    event PendingDistributorChangeCancelled();

    // Phase 1 remediation (contractaudits4 High finding): failed fee recovery hardening
    event PendingFeeRedirectProposed(address indexed oldReceiver, address indexed newReceiver, uint256 amount, uint256 executeAfter);
    event PendingFeeRedirectExecuted(address indexed oldReceiver, address indexed newReceiver, uint256 amount);
    event PendingFeeRedirectCancelled();
    event FeeRetrySucceeded(address indexed receiver, uint256 amount);

    // Phase 3: timelocked source address management events for restricted cut receivers (BattleTreasury + SponsorshipPayments)
    event BattleTreasurySourceProposed(address indexed newSource, uint256 executeAfter);
    event BattleTreasurySourceExecuted(address indexed newSource);
    event SponsorshipPaymentsSourceProposed(address indexed newSource, uint256 executeAfter);
    event SponsorshipPaymentsSourceExecuted(address indexed newSource);

    // Phase 4 follow-up remediation (contractaudits4 Medium finding): full propose/execute events for the remaining
    // timelock categories in MajorLeagueTreasury (protocol/seasonal receivers + richer distributor with limits).
    // Completes "every timelock category has matching Proposed + Executed" requirement from closeout-checklist.md Phase 4.
    // Naming and shape modeled directly on the Phase 3 source events here + Phase 4 patterns added to BattleTreasury.sol for cross-contract consistency.
    // Sources were already complete (from Phase 3); protocol/seasonal + distributor added now (additive only).
    event ProtocolFeeReceiverProposed(address indexed newReceiver, uint256 executeAfter);
    event ProtocolFeeReceiverExecuted(address indexed newReceiver);
    event SeasonalTreasuryReceiverProposed(address indexed newReceiver, uint256 executeAfter);
    event SeasonalTreasuryReceiverExecuted(address indexed newReceiver);
    event DistributorChangeProposed(address indexed distributor, bool allowed, uint256 dailyLimit, uint256 maxPerTx, uint256 executeAfter);
    event DistributorChangeExecuted(address indexed distributor, bool allowed, uint256 dailyLimit, uint256 maxPerTx);

    // Phase 5 remediation (contractaudits4 Low): propose/execute/cancel events for the now-timelocked global maxAllocationPerTx.
    // Completes removal of all non-emergency immediate powerful setters across the three contracts.
    event MaxAllocationPerTxProposed(uint256 newMax, uint256 executeAfter);
    event MaxAllocationPerTxExecuted(uint256 newMax);
    event PendingMaxAllocationPerTxCancelled();

    // Phase 1 remediation (contractaudits5 High finding / phased-build-da26e79f):
    // Distributor dailyLimit + maxPerTx changes for *existing enabled distributors* are now exclusively
    // timelocked (removal of immediate setDistributorDailyLimit bypass). Follows exact Pending* + propose/execute/cancel
    // pattern from Phase 5 maxAllocationPerTx and Phase 3 distributor change (2-day TIMELOCK_DELAY, onlyOwner, cancel, events).
    event DistributorLimitUpdateProposed(address indexed distributor, uint256 dailyLimit, uint256 maxPerTx, uint256 executeAfter);
    event DistributorLimitUpdateExecuted(address indexed distributor, uint256 dailyLimit, uint256 maxPerTx);
    event PendingDistributorLimitUpdateCancelled();

    error NotDistributor();
    error InsufficientFunds();
    error ZeroAddress();
    error InvalidFeeConfig();
    error InvalidAmount();
    error FeeRetryFailed();
    error InvalidPoolId();
    error InvalidDistributorLimitUpdate();

    /**
     * @notice Phase 3 (contractaudits5 Low/Operational / phased-build-da26e79f): constructor now accepts optional
     * trailing source addresses for battleTreasurySource and sponsorshipPaymentsSource. 0 is allowed
     * (and documented) for controlled deployment sequence: deploy Battle + Sponsorship first, then Major
     * with sources supplied here. Cuts succeed immediately without waiting for post-deploy 2-day timelock.
     * The existing timelocked propose/execute paths for sources remain available for later rotation.
     */
    constructor(
        address _protocolFeeReceiver,
        address _seasonalTreasuryReceiver,
        uint256 _protocolFeeBps,
        uint256 _seasonalFeeBps,
        address _battleTreasurySource,        // NEW Phase 3 - may be address(0); configure via timelock if not supplied
        address _sponsorshipPaymentsSource   // NEW Phase 3
    ) Ownable(msg.sender) {
        _setFeeReceivers(_protocolFeeReceiver, _seasonalTreasuryReceiver);
        _setFees(_protocolFeeBps, _seasonalFeeBps);
        if (_battleTreasurySource != address(0)) battleTreasurySource = _battleTreasurySource;
        if (_sponsorshipPaymentsSource != address(0)) sponsorshipPaymentsSource = _sponsorshipPaymentsSource;
    }

    // ==================== ADMIN ====================

    // setDistributor removed. Use only the timelocked proposeDistributorChange + executeDistributorChange path.
    // This prevents immediate bypass of the security model for the powerful distributor role.

    // Phase 5: setMaxAllocationPerTx is now timelocked (was immediate). Use propose/execute path below.
    // Phase 1 (contractaudits5 High / phased-build-da26e79f): setDistributorDailyLimit removed entirely (see below).
    // Per-distributor dailyLimit + maxPerTx for *existing* distributors are now exclusively controlled via the
    // timelocked proposeDistributorLimitUpdate / executeDistributorLimitUpdate / cancelPendingDistributorLimitUpdate path.
    // The per-distributor limits (set atomically in distributor proposal since Phase 3) remain the primary blast-radius control.

    // --- Timelocked Distributor Management ---
    // Phase 3 update: signature now carries dailyLimit + maxPerTx; nonzero limits required when enabling (allowed=true).
    // This binds the distributor role to enforceable caps atomically (closes weak distributor limits High finding).
    // Phase 1 (da26e79f): subsequent limit updates for already-enabled distributors use the dedicated
    // proposeDistributorLimitUpdate flow (see functions after cancelPendingMaxAllocationPerTx).
    function proposeDistributorChange(address distributor, bool allowed, uint256 dailyLimit, uint256 maxPerTx) external onlyOwner {
        if (allowed) {
            require(dailyLimit > 0, "daily limit required");
            require(maxPerTx > 0, "tx limit required");
        }
        pendingDistributorChange = PendingDistributorChange({
            distributor: distributor,
            allowed: allowed,
            dailyLimit: dailyLimit,
            maxPerTx: maxPerTx,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        // Phase 4 follow-up: emit richer Proposed (with dailyLimit + maxPerTx) for distributor timelock (closes checklist item)
        emit DistributorChangeProposed(distributor, allowed, dailyLimit, maxPerTx, pendingDistributorChange.executeAfter);
    }

    function executeDistributorChange() external onlyOwner {
        PendingDistributorChange memory change = pendingDistributorChange;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");

        distributors[change.distributor] = change.allowed;
        // Phase 3: bind the per-distributor limits at execution time (from the atomic proposal)
        distributorDailyLimit[change.distributor] = change.dailyLimit;
        distributorMaxPerTx[change.distributor] = change.maxPerTx;
        // Phase 4 follow-up: emit richer Executed (incl. dailyLimit + maxPerTx) for distributor timelock + keep existing Updated for compatibility
        emit DistributorChangeExecuted(change.distributor, change.allowed, change.dailyLimit, change.maxPerTx);
        emit DistributorUpdated(change.distributor, change.allowed);

        delete pendingDistributorChange;
    }

    // Pass 3 remediation (phased-build-267caf05): owner-only cancellation for pending timelock proposal
    function cancelPendingDistributorChange() external onlyOwner {
        delete pendingDistributorChange;
        emit PendingDistributorChangeCancelled();
    }

    // Phase 5: timelocked global maxAllocationPerTx (simple pending + propose/execute/cancel).
    // Matches the style of other simple uint/addr timelocks. Emits dedicated events + legacy path not needed.
    function proposeMaxAllocationPerTx(uint256 newMax) external onlyOwner {
        pendingMaxAllocationPerTx = PendingMaxAllocation({
            newValue: newMax,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        emit MaxAllocationPerTxProposed(newMax, pendingMaxAllocationPerTx.executeAfter);
    }

    function executeMaxAllocationPerTx() external onlyOwner {
        PendingMaxAllocation memory change = pendingMaxAllocationPerTx;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        maxAllocationPerTx = change.newValue;
        delete pendingMaxAllocationPerTx;
        emit MaxAllocationPerTxExecuted(change.newValue);
    }

    function cancelPendingMaxAllocationPerTx() external onlyOwner {
        delete pendingMaxAllocationPerTx;
        emit PendingMaxAllocationPerTxCancelled();
    }

    // setDistributorDailyLimit removed in phased-build-da26e79f Phase 1 (contractaudits5 High finding).
    // Daily and per-tx limit changes for existing distributors are now exclusively timelocked via the
    // proposeDistributorLimitUpdate / executeDistributorLimitUpdate / cancelPendingDistributorLimitUpdate
    // functions below (2-day TIMELOCK_DELAY, onlyOwner, full validation, atomic update of both mappings,
    // dedicated events, and cancel support). This closes the control-bypass vector where an immediate
    // onlyOwner call could undercut the timelocked distributor role + initial limits path.
    // Initial limits remain atomically bound inside proposeDistributorChange (Phase 3).

    function proposeDistributorLimitUpdate(address distributor, uint256 dailyLimit, uint256 maxPerTx) external onlyOwner {
        if (!distributors[distributor]) revert InvalidDistributorLimitUpdate();
        if (dailyLimit == 0 || maxPerTx == 0) revert InvalidDistributorLimitUpdate();

        pendingDistributorLimitUpdate = PendingDistributorLimitUpdate({
            distributor: distributor,
            dailyLimit: dailyLimit,
            maxPerTx: maxPerTx,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        emit DistributorLimitUpdateProposed(distributor, dailyLimit, maxPerTx, pendingDistributorLimitUpdate.executeAfter);
    }

    function executeDistributorLimitUpdate() external onlyOwner {
        PendingDistributorLimitUpdate memory change = pendingDistributorLimitUpdate;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");

        // Atomically update both limits for the distributor (mirrors the binding done in executeDistributorChange).
        distributorDailyLimit[change.distributor] = change.dailyLimit;
        distributorMaxPerTx[change.distributor] = change.maxPerTx;

        emit DistributorLimitUpdateExecuted(change.distributor, change.dailyLimit, change.maxPerTx);
        // No legacy DistributorUpdated emit here — this path only mutates limits on an already-enabled distributor
        // (the role toggle + legacy event is handled exclusively by the DistributorChange* pair).

        delete pendingDistributorLimitUpdate;
    }

    function cancelPendingDistributorLimitUpdate() external onlyOwner {
        delete pendingDistributorLimitUpdate;
        emit PendingDistributorLimitUpdateCancelled();
    }

    // Immediate setters for fee receivers removed — use the timelocked propose/execute functions instead.
    // This prevents bypassing the security model.

    function _setFeeReceivers(address _protocol, address _seasonal) internal {
        if (_protocol == address(0) || _seasonal == address(0)) revert ZeroAddress();
        protocolFeeReceiver = _protocol;
        seasonalTreasuryReceiver = _seasonal;
    }

    function _setFees(uint256 _protocol, uint256 _seasonal) internal {
        if (_protocol + _seasonal > 2000) revert InvalidFeeConfig();
        protocolFeeBps = _protocol;
        seasonalFeeBps = _seasonal;
    }

    // ==================== FUNDING ====================

    /**
     * @notice Anyone (or backend) can send BNB to fund a specific league/season prize pool.
     */
    function fundPrizePool(bytes32 poolId) external payable validPoolId(poolId) {
        require(msg.value > 0, "No value sent");
        prizePools[poolId] += msg.value;
        emit PrizeFunded(poolId, msg.value, msg.sender);
    }

    /**
     * @notice Called exclusively by the authorized SponsorshipPaymentsSource (set via timelocked propose/execute)
     * to send the 15% league cut. Access-controlled by onlySponsorshipPayments (Phase 3 remediation for
     * permissionless cut receiver Medium finding).
     * If a valid poolId is provided, it is immediately credited to that pool (making it allocatable).
     * Otherwise it goes to unallocatedBalance.
     * Internal bytes32(0) sentinel logic for unallocated is preserved for the now-trusted caller.
     * Emits SponsorshipCutReceived (Phase 4: now includes poolId for attribution).
     * Phase 2 (contractaudits5 / phased-build-da26e79f): Attribution-preserving retry paths are now available on the source contracts via SponsorshipPayments.retrySponsorshipCut(sponsorshipId, poolId)... (per-ID pendingFailedSponsorshipCut + metadata delivery).
     */
    function receiveSponsorshipCut(bytes32 sponsorshipId, bytes32 poolId) external payable onlySponsorshipPayments {
        require(msg.value > 0, "No value sent");

        if (poolId != bytes32(0)) {
            prizePools[poolId] += msg.value;
            emit PrizeFunded(poolId, msg.value, msg.sender);
        } else {
            unallocatedBalance += msg.value;
        }

        // Phase 4 follow-up: emit now includes poolId (per closeout-checklist + SponsorshipCutReceived expansion)
        emit SponsorshipCutReceived(sponsorshipId, poolId, msg.value, msg.sender);
    }

    /**
     * @notice Allows authorized distributors (or owner) to move unallocated revenue into a specific prize pool.
     * This fixes the critical accounting gap where battle/sponsorship revenue could not be distributed.
     */
    function allocateUnallocatedToPool(bytes32 poolId, uint256 amount) external validPoolId(poolId) {
        if (!distributors[msg.sender] && msg.sender != owner()) revert NotDistributor();
        require(amount > 0 && amount <= unallocatedBalance, "Insufficient unallocated");

        unallocatedBalance -= amount;
        prizePools[poolId] += amount;

        emit PrizeFunded(poolId, amount, msg.sender);
    }

    /**
     * @notice Payable function exclusively for the authorized BattleTreasurySource (set via timelocked propose/execute)
     * to deliver battle seasonal fees. Access-controlled by onlyBattleTreasury (Phase 3 remediation for
     * permissionless cut receiver Medium finding).
     * Credits directly to the target poolId so it is immediately allocatable (fixes the critical stuck fee path).
     * Internal bytes32(0) sentinel for unallocated is preserved inside the trusted caller path.
     * Phase 2 (contractaudits5 / phased-build-da26e79f): Attribution-preserving retry paths are now available on the source contracts via BattleTreasury.retryBattleCut(battleId, poolId)... (per-ID pendingFailedBattleCut + metadata delivery).
     */
    function receiveBattleCut(bytes32 battleId, bytes32 poolId) external payable onlyBattleTreasury {
        require(msg.value > 0, "No value sent");

        if (poolId == bytes32(0)) {
            unallocatedBalance += msg.value;
        } else {
            prizePools[poolId] += msg.value;
            emit PrizeFunded(poolId, msg.value, msg.sender);
        }

        // Pass 3 remediation (phased-build-267caf05): always emit dedicated event for battle cut tracking (PrizeFunded retained for compatibility)
        emit BattleCutReceived(battleId, poolId, msg.value);
    }

    // ==================== DISTRIBUTION (by authorized distributors) ====================

    /**
     * @notice Distributor allocates a reward from a prize pool to a winner.
     * This just records the pending reward. Winner must claim.
     */
    function allocateReward(bytes32 poolId, address recipient, uint256 amount) external nonReentrant whenNotPaused validPoolId(poolId) {
        if (!distributors[msg.sender]) revert NotDistributor();
        // Phase 3: prefer per-distributor maxPerTx (set at distributor enable time) when present; fall back to global for transition.
        // Global maxAllocationPerTx is now also timelocked (Phase 5 propose/executeMaxAllocationPerTx).
        // Phase 1 (contractaudits5 High / phased-build-da26e79f): dailyLimit + maxPerTx for an *existing* enabled
        // distributor can only be changed via the timelocked proposeDistributorLimitUpdate path (immediate setter removed).
        uint256 effMax = distributorMaxPerTx[msg.sender] > 0 ? distributorMaxPerTx[msg.sender] : maxAllocationPerTx;
        if (effMax > 0 && amount > effMax) revert InvalidAmount();

        // Daily limit enforcement per distributor
        // Phase 1 (da26e79f): enforcement uses the per-distributor value which is now only mutable via timelocked paths
        // after initial enablement (see proposeDistributorLimitUpdate + the distributor change path).
        uint256 today = block.timestamp / 1 days;
        if (distributorLastDay[msg.sender] != today) {
            distributorDailySpent[msg.sender] = 0;
            distributorLastDay[msg.sender] = today;
        }
        uint256 dailyLimit = distributorDailyLimit[msg.sender];
        if (dailyLimit > 0 && distributorDailySpent[msg.sender] + amount > dailyLimit) {
            revert InvalidAmount(); // Would exceed daily limit
        }
        distributorDailySpent[msg.sender] += amount;

        if (prizePools[poolId] < amount) revert InsufficientFunds();
        if (recipient == address(0)) revert ZeroAddress();

        prizePools[poolId] -= amount;
        pendingRewards[poolId][recipient] += amount;

        emit RewardAllocated(poolId, recipient, amount);
    }

    /**
     * @notice Winner claims their allocated league reward.
     * Optional: apply small platform fee on league rewards if desired.
     */
    function claimReward(bytes32 poolId) external nonReentrant {
        // Claims on already-allocated rewards are allowed even when paused (emergency control only affects new allocations)
        uint256 amount = pendingRewards[poolId][msg.sender];
        if (amount == 0) revert InsufficientFunds();

        // Optional fee on league rewards (can be 0)
        uint256 protocolFee = (amount * protocolFeeBps) / 10000;
        uint256 seasonalFee = (amount * seasonalFeeBps) / 10000;
        uint256 netAmount = amount - protocolFee - seasonalFee;

        pendingRewards[poolId][msg.sender] = 0;

        // Pay the user first
        (bool success, ) = msg.sender.call{value: netAmount}("");
        require(success, "Reward payout failed");

        // Attempt fee transfers without blocking the user. Credit failed amounts for later withdrawal.
        if (protocolFee > 0) {
            (bool p1, ) = protocolFeeReceiver.call{value: protocolFee}("");
            if (!p1) {
                pendingFeeWithdrawals[protocolFeeReceiver] += protocolFee;
                emit FeeTransferFailed(protocolFeeReceiver, protocolFee, poolId);
            }
        }
        if (seasonalFee > 0) {
            (bool s1, ) = seasonalTreasuryReceiver.call{value: seasonalFee}("");
            if (!s1) {
                pendingFeeWithdrawals[seasonalTreasuryReceiver] += seasonalFee;
                emit FeeTransferFailed(seasonalTreasuryReceiver, seasonalFee, poolId);
            }
        }

        emit RewardClaimed(poolId, msg.sender, netAmount);
        if (protocolFee + seasonalFee > 0) {
            emit FeesDistributed(protocolFee, seasonalFee);
        }
    }

    // ==================== VIEWS ====================
    // See contracts/USER_INTERACTION_GUIDE.md for recommended frontend integration patterns.

    function getPendingReward(bytes32 poolId, address user) external view returns (uint256) {
        return pendingRewards[poolId][user];
    }

    function getPrizePoolBalance(bytes32 poolId) external view returns (uint256) {
        return prizePools[poolId];
    }

    /**
     * @notice Returns how much a specific user can claim from a pool.
     * Frontends should use this to show "You can claim X BNB".
     */
    function getClaimableAmount(bytes32 poolId, address user) external view returns (uint256) {
        return pendingRewards[poolId][user];
    }

    /**
     * @notice Calculates the net amount after any configured fees.
     * Per current policy, league prizes should have 0 fees (100% to winners).
     */
    function getNetClaimableAmount(bytes32 poolId, address user) external view returns (uint256) {
        uint256 amount = pendingRewards[poolId][user];
        if (amount == 0) return 0;

        uint256 protocolFee = (amount * protocolFeeBps) / 10000;
        uint256 seasonalFee = (amount * seasonalFeeBps) / 10000;
        return amount - protocolFee - seasonalFee;
    }

    /**
     * @notice Allows a fee receiver to claim protocol fees that previously failed to transfer out of this treasury.
     *
     * Phase 1 hardening: `retryPendingFee(receiver)` provides a public retry path (anyone may call)
     * that follows the auditor-recommended zero-then-attempt-recredit pattern for robustness with
     * contract receivers. For permanently stuck fee receivers the owner may use the timelocked
     * proposeFeeRedirect / executeFeeRedirect / cancelPendingFeeRedirect (fee funds only).
     */
    function claimPendingFees() external nonReentrant {
        uint256 amount = pendingFeeWithdrawals[msg.sender];
        require(amount > 0, "Nothing to claim");

        pendingFeeWithdrawals[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Fee claim failed");
    }

    // ==================== PHASE 1: FAILED FEE RECOVERY HARDENING ====================
    // Addresses the High finding in contractaudits4.md: contract fee receivers that reject
    // plain ETH can strand protocol/seasonal fees permanently. These paths are additive only.
    // retryPendingFee is public (anyone) and follows the auditor's exact recommended body.
    // The redirect trio is owner-only + 2-day timelocked + restricted to fee amounts in pendingFeeWithdrawals.

    /**
     * @notice Anyone may retry sending a pending fee amount to its recorded receiver.
     * Implements the auditor-recommended pattern exactly: zero the mapping first, attempt the call,
     * re-credit the amount and revert on failure. Emits FeeRetrySucceeded on success.
     */
    function retryPendingFee(address receiver) external nonReentrant {
        uint256 amount = pendingFeeWithdrawals[receiver];
        require(amount > 0, "Nothing to retry");

        pendingFeeWithdrawals[receiver] = 0;

        (bool success, ) = receiver.call{value: amount}("");
        if (!success) {
            pendingFeeWithdrawals[receiver] = amount; // recredit on failure
            revert FeeRetryFailed();
        }
        emit FeeRetrySucceeded(receiver, amount);
    }

    /**
     * @notice Owner proposes a timelocked redirect of a recorded pending fee amount from one
     * receiver to another (fee funds only, never user escrow principal).
     */
    function proposeFeeRedirect(address oldReceiver, address newReceiver, uint256 amount) external onlyOwner {
        require(newReceiver != address(0), "Invalid address");
        require(amount > 0, "Invalid amount");
        require(amount <= pendingFeeWithdrawals[oldReceiver], "Insufficient pending fees");

        pendingFeeRedirect = PendingFeeRedirect({
            oldReceiver: oldReceiver,
            newReceiver: newReceiver,
            amount: amount,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        emit PendingFeeRedirectProposed(oldReceiver, newReceiver, amount, pendingFeeRedirect.executeAfter);
    }

    /**
     * @notice Owner executes a previously proposed fee redirect after the timelock delay.
     * Defensive re-check ensures the recorded pending amount is still available.
     */
    function executeFeeRedirect() external onlyOwner {
        PendingFeeRedirect memory change = pendingFeeRedirect;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        require(change.amount <= pendingFeeWithdrawals[change.oldReceiver], "Pending amount changed");

        pendingFeeWithdrawals[change.oldReceiver] -= change.amount;
        pendingFeeWithdrawals[change.newReceiver] += change.amount;

        emit PendingFeeRedirectExecuted(change.oldReceiver, change.newReceiver, change.amount);
        delete pendingFeeRedirect;
    }

    /**
     * @notice Owner cancels a pending fee redirect proposal (before or after timelock).
     */
    function cancelPendingFeeRedirect() external onlyOwner {
        delete pendingFeeRedirect;
        emit PendingFeeRedirectCancelled();
    }

    bool public paused;

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    // Phase 3: access control for the cut receiver entrypoints (closes permissionless Medium finding).
    // Sources are set via their own timelocked propose/execute (modeled on fee receiver pattern).
    modifier onlyBattleTreasury() {
        require(msg.sender == battleTreasurySource, "not battle treasury");
        _;
    }

    modifier onlySponsorshipPayments() {
        require(msg.sender == sponsorshipPaymentsSource, "not sponsorship payments");
        _;
    }

    // Phase 3: reserves bytes32(0) as invalid for all public prize pool mutation paths (closes Medium ambiguity finding).
    // Sentinel bytes32(0) meaning ("unallocated") is preserved *only* inside the now-restricted receive*Cut functions.
    modifier validPoolId(bytes32 poolId) {
        if (poolId == bytes32(0)) revert InvalidPoolId();
        _;
    }

    // setPaused is kept immediate for emergency use only (see TRUST_MODEL.md "Remaining Immediate Controls (Post Remediation)").
    // All other powerful owner controls (receivers, distributors, sources, maxAllocationPerTx, etc.) now use the 2-day timelock + cancel pattern.
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    // === Simple Timelock for Critical Admin Changes ===
    uint256 public constant TIMELOCK_DELAY = 2 days;

    struct PendingChange {
        address newValue;
        uint256 executeAfter;
        bool exists;
    }

    PendingChange public pendingProtocolFeeReceiver;
    PendingChange public pendingSeasonalTreasuryReceiver;

    // Phase 3: timelocked source addresses for restricted cut receivers (receiveBattleCut / receiveSponsorshipCut)
    // These close the permissionless cut-receiver Medium finding. Initially unset (address(0)); owner proposes post-deploy.
    address public battleTreasurySource;
    address public sponsorshipPaymentsSource;
    PendingChange public pendingBattleTreasurySource;
    PendingChange public pendingSponsorshipPaymentsSource;

    // Timelock for distributor role changes (now properly binds the action)
    // Phase 3: dailyLimit + maxPerTx now carried atomically in the pending struct (enforced nonzero on enable)
    struct PendingDistributorChange {
        address distributor;
        bool allowed;
        uint256 dailyLimit;
        uint256 maxPerTx;
        uint256 executeAfter;
        bool exists;
    }

    PendingDistributorChange public pendingDistributorChange;

    // Phase 1 remediation (failed fee recovery): timelocked redirect path for fee-only funds
    // when a receiver contract permanently rejects ETH. Restricted to recorded pendingFeeWithdrawals amounts.
    struct PendingFeeRedirect {
        address oldReceiver;
        address newReceiver;
        uint256 amount;
        uint256 executeAfter;
        bool exists;
    }

    PendingFeeRedirect public pendingFeeRedirect;

    // Phase 5: timelocked path for the global maxAllocationPerTx (closes remaining sensitive immediate setter).
    // Per-distributor maxPerTx (bound atomically at distributor proposal time since Phase 3) are already protected.
    // Simple uint256 pending struct following established pattern.
    struct PendingMaxAllocation {
        uint256 newValue;
        uint256 executeAfter;
        bool exists;
    }

    PendingMaxAllocation public pendingMaxAllocationPerTx;

    // Phase 1 (contractaudits5 High finding / phased-build-da26e79f): timelocked path exclusively for
    // updating dailyLimit + maxPerTx on already-enabled distributors. Appended after PendingMaxAllocation
    // (storage-safe). Initial limits bound in PendingDistributorChange / executeDistributorChange (Phase 3).
    // Subsequent changes require 2-day timelock + onlyOwner + nonzero + currently-enabled check.
    struct PendingDistributorLimitUpdate {
        address distributor;
        uint256 dailyLimit;
        uint256 maxPerTx;
        uint256 executeAfter;
        bool exists;
    }

    PendingDistributorLimitUpdate public pendingDistributorLimitUpdate;

    // Daily allocation limits per distributor for extra safety
    // Phase 3: per-distributor maxPerTx (bound at proposal/execute time) + dailyLimit
    // Phase 1 (contractaudits5 High / da26e79f): these two mappings for *existing* distributors are now
    // only mutated by the timelocked proposeDistributorLimitUpdate + execute path (and at initial enable time).
    // The immediate setDistributorDailyLimit has been removed.
    mapping(address => uint256) public distributorDailyLimit;
    mapping(address => uint256) public distributorDailySpent;
    mapping(address => uint256) public distributorLastDay;
    mapping(address => uint256) public distributorMaxPerTx;

    function proposeProtocolFeeReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "Invalid address");
        pendingProtocolFeeReceiver = PendingChange({
            newValue: newReceiver,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        // Phase 4 follow-up: emit Proposed for protocolFeeReceiver timelock category (completes coverage)
        emit ProtocolFeeReceiverProposed(newReceiver, pendingProtocolFeeReceiver.executeAfter);
    }

    function executeProtocolFeeReceiver() external onlyOwner {
        PendingChange memory change = pendingProtocolFeeReceiver;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        protocolFeeReceiver = change.newValue;
        // Phase 4 follow-up: emit Executed for protocolFeeReceiver timelock category (completes coverage)
        emit ProtocolFeeReceiverExecuted(change.newValue);
        delete pendingProtocolFeeReceiver;
    }

    function proposeSeasonalTreasuryReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "Invalid address");
        pendingSeasonalTreasuryReceiver = PendingChange({
            newValue: newReceiver,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        // Phase 4 follow-up: emit Proposed for seasonalTreasuryReceiver timelock category (completes coverage)
        emit SeasonalTreasuryReceiverProposed(newReceiver, pendingSeasonalTreasuryReceiver.executeAfter);
    }

    function executeSeasonalTreasuryReceiver() external onlyOwner {
        PendingChange memory change = pendingSeasonalTreasuryReceiver;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        seasonalTreasuryReceiver = change.newValue;
        // Phase 4 follow-up: emit Executed for seasonalTreasuryReceiver timelock category (completes coverage)
        emit SeasonalTreasuryReceiverExecuted(change.newValue);
        delete pendingSeasonalTreasuryReceiver;
    }

    // Pass 3 remediation (phased-build-267caf05): owner-only cancellation for pending timelock proposals
    function cancelPendingProtocolFeeReceiver() external onlyOwner {
        delete pendingProtocolFeeReceiver;
        emit PendingProtocolFeeReceiverCancelled();
    }

    function cancelPendingSeasonalTreasuryReceiver() external onlyOwner {
        delete pendingSeasonalTreasuryReceiver;
        emit PendingSeasonalTreasuryReceiverCancelled();
    }

    // ==================== PHASE 3: TIMELOCKED CUT RECEIVER SOURCES ====================
    // Restricts receiveBattleCut and receiveSponsorshipCut to known trusted contracts only.
    // Functions modeled on the existing fee-receiver timelock pattern (propose/execute/cancel using PendingChange).
    // Proposed/Executed events emitted here (additive). Phase 4 follow-up completed the protocol/seasonal + richer distributor
    // Proposed/Executed (plus SponsorshipCutReceived poolId expansion) for full timelock category coverage per closeout-checklist.
    // Cancels perform silent delete (no cancel events declared for sources in Phase 3 per exact plan list).

    function proposeBattleTreasurySource(address newSource) external onlyOwner {
        require(newSource != address(0), "Invalid address");
        pendingBattleTreasurySource = PendingChange({
            newValue: newSource,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        emit BattleTreasurySourceProposed(newSource, pendingBattleTreasurySource.executeAfter);
    }

    function executeBattleTreasurySource() external onlyOwner {
        PendingChange memory change = pendingBattleTreasurySource;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        battleTreasurySource = change.newValue;
        emit BattleTreasurySourceExecuted(change.newValue);
        delete pendingBattleTreasurySource;
    }

    function cancelPendingBattleTreasurySource() external onlyOwner {
        delete pendingBattleTreasurySource;
        // No dedicated Cancel event emitted in Phase 3 (events limited to the 4 Proposed/Executed listed in plan).
    }

    function proposeSponsorshipPaymentsSource(address newSource) external onlyOwner {
        require(newSource != address(0), "Invalid address");
        pendingSponsorshipPaymentsSource = PendingChange({
            newValue: newSource,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        emit SponsorshipPaymentsSourceProposed(newSource, pendingSponsorshipPaymentsSource.executeAfter);
    }

    function executeSponsorshipPaymentsSource() external onlyOwner {
        PendingChange memory change = pendingSponsorshipPaymentsSource;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        sponsorshipPaymentsSource = change.newValue;
        emit SponsorshipPaymentsSourceExecuted(change.newValue);
        delete pendingSponsorshipPaymentsSource;
    }

    function cancelPendingSponsorshipPaymentsSource() external onlyOwner {
        delete pendingSponsorshipPaymentsSource;
        // No dedicated Cancel event emitted in Phase 3 (events limited to the 4 Proposed/Executed listed in plan).
    }

    receive() external payable {
        // Any direct ETH is treated as unallocated league revenue
        if (msg.value > 0) {
            unallocatedBalance += msg.value;
        }
    }
}