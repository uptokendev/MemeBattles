// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BattleTreasury
 * @dev Secure escrow for 1v1 meme coin battles.
 *
 * SECURITY PRINCIPLES (non-negotiable):
 * - No admin or owner can withdraw arbitrary funds.
 * - Funds can ONLY leave the contract through legitimate winner claims
 *   or explicit refunds after timeout.
 * - Uses strict state machine + deadlines.
 * - Reentrancy protected.
 * - Winner resolution requires a valid signature from the trusted resolver.
 *
 * Flow:
 * 1. Backend calls createBattle(...) when a challenge is accepted.
 * 2. Both creator and challenger must call deposit() with the agreed amount before deadline.
 * 3. Once both deposited → battle becomes active (backend can start it).
 * 4. After battle ends off-chain, resolver signs the winner.
 * 5. Winner calls claim() → receives (pot - fee), fee is sent to feeReceiver.
 * 6. If one side deposits and the other misses the deadline → depositor can refund.
 */
contract BattleTreasury is ReentrancyGuard, Ownable {
    using ECDSA for bytes32;

    enum BattleState {
        Created,           // Battle record created, waiting for deposits
        AwaitingDeposits,  // Deposits are open
        Active,            // Both sides deposited, battle can run
        Resolved,          // Winner decided off-chain
        Settled            // Funds claimed
    }

    struct Battle {
        address creator;           // The one who opened the coin for battle
        address challenger;
        uint256 stakeAmount;       // The agreed stake each side must deposit (enforced on-chain)
        uint256 creatorDeposit;
        uint256 challengerDeposit;
        uint256 depositDeadline;   // Timestamp after which incomplete deposits can be refunded
        address winner;
        BattleState state;
        bool creatorDeposited;
        bool challengerDeposited;
        bool settled;              // Whether the pot has been claimed/refunded
        bytes32 seasonalPoolId;    // Target pool in MajorLeagueTreasury for the 10% cut (set at creation)
        uint256 resolutionDeadline; // After this, if not resolved, parties can request refund/cancellation
        address winnerPayoutAddress; // Phase 3: signed payout (or 0 = use winner). Set in resolveWinner from EIP-712 payload. Used in claim() for the actual transfer.
    }

    mapping(bytes32 => Battle) public battles;

    // Addresses allowed to create battles (backend or BattleFactory)
    mapping(address => bool) public authorizedCreators;

    // === FEE CONFIG (Finalized) ===
    // Battle Pots: 85% Winner / 5% Protocol / 10% Major Leagues
    // - protocolFeeReceiver     → ProtocolRevenueVault
    // - seasonalTreasuryReceiver → MajorLeagueTreasury
    //
    // Sponsorships: 70/15/15 (70% recipient / 15% Protocol / 15% Major Leagues)
    //
    // War Pools / Betting: Will reuse BattleTreasury logic if safe
    //
    // IMPORTANT: MajorLeagueTreasury is completely separate from the existing
    // TreasuryVault system used by the non-PostGrad League page.
    //
    // See contracts/POSTGRAD_REVENUE_DECISION_TABLE.md
    address public protocolFeeReceiver;
    address public seasonalTreasuryReceiver;
    uint256 public protocolFeeBps;          // 500 = 5%
    uint256 public seasonalFeeBps;          // 1000 = 10%

    // Total fee = protocolFeeBps + seasonalFeeBps (recommended max 1500 = 15%)
    address public resolver;                // The account (backend) that signs winner resolutions

    // Finalized splits (see POSTGRAD_REVENUE_DECISION_TABLE.md):
    // - Battle pots: 85% Winner / 5% Protocol / 10% Major Leagues
    // - Sponsorships (handled elsewhere): 70/15/15
    // - War Pools: Will attempt to reuse this contract's logic if safe
    //
    // Phase 1: Fee recovery for failed transfers to contract receivers now includes
    // retryPendingFee (anyone-callable, recredit-on-fail) + timelocked propose/executeFeeRedirect
    // (owner-only, fee amounts recorded in pendingFeeWithdrawals only).
    //
    // Phase 2 (contractaudits5 Medium / phased-build-da26e79f): attribution-preserving retry for
    // failed seasonal league cuts via pendingFailedBattleCut + retryBattleCut (symmetric to SponsorshipPayments).

    // IMPORTANT SEPARATION:
    // MajorLeagueTreasury is completely independent from the existing
    // TreasuryVault system used by the non-PostGrad League page.

    bool public paused;

    // Accounting for fees that failed to transfer (non-blocking path).
    // Phase 1: see retryPendingFee (anyone) + timelocked pendingFeeRedirect (owner, fee-only) below.
    mapping(address => uint256) public pendingFeeWithdrawals;

    // Phase 2 (contractaudits4 High): pendingRefunds for pull-based active-battle timeout refunds.
    // Credited in the (refactored) two-party post-resolutionDeadline path inside refund().
    // Users pull via claimRefund(). Prevents one reverting receiver from griefing the other participant's refund.
    // One-sided (AwaitingDeposits, single depositor) refund path remains direct push (self-affected only).
    // Also see NatSpec on refund() + claimRefund() and the new subsection in USER_INTERACTION_GUIDE.md.
    mapping(address => uint256) public pendingRefunds;

    // Phase 2 (contractaudits5 Medium / phased-build-da26e79f): per-battleId pending league-cut amount for attribution-preserving retry.
    // Populated in the seasonal/ league failure leg of claim() (in addition to the aggregate pendingFeeWithdrawals).
    // retryBattleCut uses this to re-deliver via receiveBattleCut(bytes32,bytes32) metadata ABI
    // so the cut lands in the correct prize pool on MajorLeagueTreasury instead of unallocatedBalance.
    mapping(bytes32 => uint256) public pendingFailedBattleCut;

    // === Simple Timelock for Critical Admin Changes ===
    uint256 public constant TIMELOCK_DELAY = 2 days;

    // Phase 2: upper bound on depositWindowSeconds in createBattle (closes missing max from contractaudits4).
    // One-sided incomplete deposit refunds and the new active-timeout pull refunds (pendingRefunds) are unaffected.
    uint256 public constant MAX_DEPOSIT_WINDOW = 7 days;

    struct PendingChange {
        address newValue;
        uint256 executeAfter;
        bool exists;
    }

    PendingChange public pendingProtocolFeeReceiver;
    PendingChange public pendingSeasonalTreasuryReceiver;
    PendingChange public pendingResolver;

    // Pass 3 remediation follow-up: timelocked path for authorized creators
    // (closes the remaining immediate powerful setter from the original contractaudits.md)
    struct PendingAuthorizedCreatorChange {
        address creator;
        bool allowed;
        uint256 executeAfter;
        bool exists;
    }

    PendingAuthorizedCreatorChange public pendingAuthorizedCreatorChange;

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

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    // Events
    // Phase 4: expanded BattleCreated with stakeAmount, resolutionDeadline, and seasonalPoolId (plus depositDeadline already present)
    // for full event schema completion (contractaudits4 Medium finding). All fields now emitted at creation.
    event BattleCreated(
        bytes32 indexed battleId,
        address indexed creator,
        address indexed challenger,
        uint256 stakeAmount,
        uint256 depositDeadline,
        uint256 resolutionDeadline,
        bytes32 seasonalPoolId
    );
    event Deposited(bytes32 indexed battleId, address indexed depositor, uint256 amount);
    event BattleActivated(bytes32 indexed battleId);
    event WinnerResolved(bytes32 indexed battleId, address indexed winner);
    event Claimed(
        bytes32 indexed battleId,
        address indexed winner,
        uint256 amountToWinner,
        uint256 feeAmount
    );
    event Refunded(bytes32 indexed battleId, address indexed to, uint256 amount);
    event FeeTransferFailed(address indexed receiver, uint256 amount, bytes32 indexed battleId);

    // Pass 3 remediation (phased-build-267caf05): cancellation events for pending timelock proposals (operational safety)
    event PendingProtocolFeeReceiverCancelled();
    event PendingSeasonalTreasuryReceiverCancelled();
    event PendingResolverCancelled();
    event PendingAuthorizedCreatorChangeCancelled();
    event AuthorizedCreatorUpdated(address indexed creator, bool allowed);

    // Phase 4 remediation (contractaudits4 Medium finding): full propose/execute events for all four timelock categories
    // (protocolFeeReceiver, seasonalTreasuryReceiver, resolver, authorizedCreator). Completes timelock observability
    // across the contract (cancellations were added in Pass 3; these add the propose + execute sides).
    // Naming and shape modeled directly on the Phase 3 source events in MajorLeagueTreasury.sol for consistency.
    event ProtocolFeeReceiverProposed(address indexed newReceiver, uint256 executeAfter);
    event ProtocolFeeReceiverExecuted(address indexed newReceiver);
    event SeasonalTreasuryReceiverProposed(address indexed newReceiver, uint256 executeAfter);
    event SeasonalTreasuryReceiverExecuted(address indexed newReceiver);
    event ResolverProposed(address indexed newResolver, uint256 executeAfter);
    event ResolverExecuted(address indexed newResolver);
    event AuthorizedCreatorProposed(address indexed creator, bool allowed, uint256 executeAfter);
    event AuthorizedCreatorExecuted(address indexed creator, bool allowed);

    // Phase 1 remediation (contractaudits4 High finding): failed fee recovery hardening
    event PendingFeeRedirectProposed(address indexed oldReceiver, address indexed newReceiver, uint256 amount, uint256 executeAfter);
    event PendingFeeRedirectExecuted(address indexed oldReceiver, address indexed newReceiver, uint256 amount);
    event PendingFeeRedirectCancelled();
    event FeeRetrySucceeded(address indexed receiver, uint256 amount);

    // Phase 2 remediation (contractaudits4 High finding): pull-based refunds for active-battle timeouts.
    // refund() on unresolved Active + past resolutionDeadline now credits pendingRefunds (no direct transfers).
    // Users call claimRefund() to pull. Emitted for each recipient so indexers see exact credits.
    event RefundCredited(bytes32 indexed battleId, address indexed to, uint256 amount);
    event RefundClaimed(address indexed to, uint256 amount);

    // Phase 2 (contractaudits5 Medium / phased-build-da26e79f): dedicated event for the attribution-preserving
    // retry path on failed battle league cuts (contrasts with generic FeeRetrySucceeded from plain retryPendingFee).
    // Carries the original battleId + poolId so indexers can attribute the recovered cut to the correct prize pool.
    event BattleCutRetriedWithMetadata(bytes32 indexed battleId, bytes32 poolId, uint256 amount);

    // Errors
    error InvalidAmount();
    error BattleAlreadyExists();
    error BattleNotFound();
    error NotParticipant();
    error DeadlinePassed();
    error AlreadyDeposited();
    error NotReadyToActivate();
    error InvalidWinner();
    error AlreadySettled();
    error NothingToRefund();
    error InvalidSignature();
    error FeeRetryFailed();
    error NoPendingRefund();

    constructor(
        address _protocolFeeReceiver,
        address _seasonalTreasuryReceiver,
        uint256 _protocolFeeBps,
        uint256 _seasonalFeeBps,
        address _resolver
    ) Ownable(msg.sender) {
        require(_protocolFeeReceiver != address(0), "Invalid protocol fee receiver");
        require(_seasonalTreasuryReceiver != address(0), "Invalid seasonal treasury receiver");
        require(_resolver != address(0), "Invalid resolver");
        require(_protocolFeeBps + _seasonalFeeBps <= 2000, "Combined fees too high"); // Max 20%

        protocolFeeReceiver = _protocolFeeReceiver;
        seasonalTreasuryReceiver = _seasonalTreasuryReceiver;
        protocolFeeBps = _protocolFeeBps;
        seasonalFeeBps = _seasonalFeeBps;
        resolver = _resolver;
    }

    // ==================== ADMIN / CONFIG ====================

    // Immediate setters removed — all critical changes must go through the timelock propose/execute flow
    // to prevent bypassing the security model. Only constructor initialization is allowed.
    // setPaused is kept immediate for emergency use only (see TRUST_MODEL.md "Remaining Immediate Controls (Post Remediation)").

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    // setAuthorizedCreator is no longer immediate. Use the timelocked propose/execute/cancel path below.
    // This closes the last remaining immediate powerful setter flagged in the original contractaudits.md.

    // --- Timelocked Admin Changes ---

    function proposeProtocolFeeReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "Invalid address");
        pendingProtocolFeeReceiver = PendingChange({
            newValue: newReceiver,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        // Phase 4: emit Proposed for full timelock observability.
        emit ProtocolFeeReceiverProposed(newReceiver, pendingProtocolFeeReceiver.executeAfter);
    }

    function executeProtocolFeeReceiver() external onlyOwner {
        PendingChange memory change = pendingProtocolFeeReceiver;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        protocolFeeReceiver = change.newValue;
        delete pendingProtocolFeeReceiver;
        // Phase 4: emit dedicated Executed event for observability (previously silent on success).
        emit ProtocolFeeReceiverExecuted(change.newValue);
    }

    function proposeSeasonalTreasuryReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "Invalid address");
        pendingSeasonalTreasuryReceiver = PendingChange({
            newValue: newReceiver,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        // Phase 4: emit Proposed for full timelock observability.
        emit SeasonalTreasuryReceiverProposed(newReceiver, pendingSeasonalTreasuryReceiver.executeAfter);
    }

    function executeSeasonalTreasuryReceiver() external onlyOwner {
        PendingChange memory change = pendingSeasonalTreasuryReceiver;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        seasonalTreasuryReceiver = change.newValue;
        delete pendingSeasonalTreasuryReceiver;
        // Phase 4: emit dedicated Executed event for observability (previously silent on success).
        emit SeasonalTreasuryReceiverExecuted(change.newValue);
    }

    function proposeResolver(address newResolver) external onlyOwner {
        require(newResolver != address(0), "Invalid resolver");
        pendingResolver = PendingChange({
            newValue: newResolver,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        // Phase 4: emit Proposed for full timelock observability.
        emit ResolverProposed(newResolver, pendingResolver.executeAfter);
    }

    function executeResolver() external onlyOwner {
        PendingChange memory change = pendingResolver;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        resolver = change.newValue;
        delete pendingResolver;
        // Phase 4: emit dedicated Executed event for observability (previously silent on success).
        emit ResolverExecuted(change.newValue);
    }

    // Pass 3 remediation (phased-build-267caf05): owner-only cancellation for pending timelock proposals
    // (non-blocking; allows aborting a mistaken or no-longer-desired change before the 2-day delay expires)
    function cancelPendingProtocolFeeReceiver() external onlyOwner {
        delete pendingProtocolFeeReceiver;
        emit PendingProtocolFeeReceiverCancelled();
    }

    function cancelPendingSeasonalTreasuryReceiver() external onlyOwner {
        delete pendingSeasonalTreasuryReceiver;
        emit PendingSeasonalTreasuryReceiverCancelled();
    }

    function cancelPendingResolver() external onlyOwner {
        delete pendingResolver;
        emit PendingResolverCancelled();
    }

    // Pass 3 remediation follow-up: timelocked management of authorized creators
    // (removes the last immediate powerful setter flagged in the original contractaudits.md)
    function proposeAuthorizedCreator(address creator, bool allowed) external onlyOwner {
        pendingAuthorizedCreatorChange = PendingAuthorizedCreatorChange({
            creator: creator,
            allowed: allowed,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        // Phase 4: emit Proposed (richer shape with allowed + executeAfter) for full timelock observability.
        emit AuthorizedCreatorProposed(creator, allowed, pendingAuthorizedCreatorChange.executeAfter);
    }

    function executeAuthorizedCreator() external onlyOwner {
        PendingAuthorizedCreatorChange memory change = pendingAuthorizedCreatorChange;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");

        authorizedCreators[change.creator] = change.allowed;
        emit AuthorizedCreatorUpdated(change.creator, change.allowed);
        // Phase 4: emit dedicated Executed event (richer, includes allowed) for observability.
        emit AuthorizedCreatorExecuted(change.creator, change.allowed);

        delete pendingAuthorizedCreatorChange;
    }

    function cancelPendingAuthorizedCreator() external onlyOwner {
        delete pendingAuthorizedCreatorChange;
        emit PendingAuthorizedCreatorChangeCancelled();
    }

    // ==================== BATTLE LIFECYCLE ====================

    /**
     * @notice Called by backend when a challenge is accepted.
     * Creates the battle record and opens the deposit window.
     *
     * Phase 4: The emitted BattleCreated event now includes the full schema (stakeAmount, depositDeadline,
     * resolutionDeadline, seasonalPoolId) for complete observability. The on-chain Battle struct has always
     * stored these; the event expansion closes the under-specified event Medium finding.
     */
    function createBattle(
        bytes32 battleId,
        address creator,
        address challenger,
        uint256 stakeAmount,         // The exact amount each side must deposit
        uint256 depositWindowSeconds,
        bytes32 seasonalPoolId       // Target poolId in MajorLeagueTreasury for the 10% seasonal cut
    ) external whenNotPaused {
        require(authorizedCreators[msg.sender], "Not authorized to create battles");
        if (battles[battleId].creator != address(0)) revert BattleAlreadyExists();
        if (creator == address(0) || challenger == address(0) || creator == challenger) revert InvalidAmount();
        if (stakeAmount == 0) revert InvalidAmount();
        if (depositWindowSeconds < 1 hours) revert InvalidAmount(); // Minimum protection
        if (depositWindowSeconds > MAX_DEPOSIT_WINDOW) revert InvalidAmount(); // Phase 2: hard upper bound (7 days)

        uint256 depositDeadline = block.timestamp + depositWindowSeconds;
        uint256 resolutionDeadline = depositDeadline + 30 days; // Example: 30 days after deposit window to resolve

        battles[battleId] = Battle({
            creator: creator,
            challenger: challenger,
            stakeAmount: stakeAmount,
            creatorDeposit: 0,
            challengerDeposit: 0,
            depositDeadline: depositDeadline,
            winner: address(0),
            state: BattleState.AwaitingDeposits,
            creatorDeposited: false,
            challengerDeposited: false,
            settled: false,
            seasonalPoolId: seasonalPoolId,
            resolutionDeadline: resolutionDeadline,
            winnerPayoutAddress: address(0)
        });

        // Phase 4: emit now passes the full set of fields (stake, deadlines, seasonalPoolId) to match expanded event.
        emit BattleCreated(battleId, creator, challenger, stakeAmount, depositDeadline, resolutionDeadline, seasonalPoolId);
    }

    /**
     * @notice Participants deposit their stake in BNB.
     * Must send exactly the agreed amount (enforced off-chain + in UI).
     */
    function deposit(bytes32 battleId) external payable nonReentrant whenNotPaused {
        Battle storage battle = battles[battleId];
        if (battle.creator == address(0)) revert BattleNotFound();
        if (battle.state != BattleState.AwaitingDeposits) revert InvalidAmount();
        if (block.timestamp > battle.depositDeadline) revert DeadlinePassed();

        // Enforce the on-chain agreed stake amount (critical for fair escrow)
        if (msg.value != battle.stakeAmount) revert InvalidAmount();

        if (msg.sender == battle.creator) {
            if (battle.creatorDeposited) revert AlreadyDeposited();
            battle.creatorDeposit = msg.value;
            battle.creatorDeposited = true;
        } else if (msg.sender == battle.challenger) {
            if (battle.challengerDeposited) revert AlreadyDeposited();
            battle.challengerDeposit = msg.value;
            battle.challengerDeposited = true;
        } else {
            revert NotParticipant();
        }

        emit Deposited(battleId, msg.sender, msg.value);

        // If both have now deposited, move to Active
        if (battle.creatorDeposited && battle.challengerDeposited) {
            battle.state = BattleState.Active;
            emit BattleActivated(battleId);
        }
    }

    /**
     * @notice Backend (or anyone) can mark a battle as ready after both deposits.
     * This is mostly for frontend state.
     */
    function markActive(bytes32 battleId) external {
        Battle storage battle = battles[battleId];
        if (battle.state != BattleState.Active) revert NotReadyToActivate();
        // Already active from deposit logic, this is mostly a no-op / safety
    }

    // EIP-712 domain separator for secure off-chain winner signatures
    bytes32 public constant RESOLVE_WINNER_TYPEHASH = keccak256(
        "ResolveWinner(bytes32 battleId,address creator,address challenger,address winner,uint256 stakeAmount,uint256 depositDeadline,uint256 resolutionDeadline,bytes32 seasonalPoolId,address payoutAddress)"
    );

    function _domainSeparatorV4() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("BattleTreasury")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /**
     * @notice Resolver (backend) submits the winner with a signature.
     * Uses EIP-712 typed data for proper domain separation (prevents replay across chains/contracts).
     *
     * Off-chain signing requirements:
     * Phase 3 (contractaudits5 Medium / phased-build-da26e79f): 9-field signed payload now includes `address payoutAddress` (final; 0 = fallback to winner in claim for lock safety).
     * - The signed struct is the full `ResolveWinner` type with 9 fields.
     * - Callers/resolvers MUST use standard EIP-712 signing (`ethers.signTypedData` / `signTypedData_v4`, Ledger Live typed data, etc.).
     * - Personal sign of the struct hash (or of the inner EIP-712 hash) will no longer work after this fix.
     */
    function resolveWinner(
        bytes32 battleId,
        address winner,
        address payoutAddress,
        bytes calldata signature
    ) external nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.state != BattleState.Active) revert InvalidAmount();
        if (block.timestamp > battle.resolutionDeadline) revert DeadlinePassed();
        if (winner != battle.creator && winner != battle.challenger) revert InvalidWinner();

        // Build EIP-712 struct hash with full battle context for stronger binding
        bytes32 structHash = keccak256(
            abi.encode(
                RESOLVE_WINNER_TYPEHASH,
                battleId,
                battle.creator,
                battle.challenger,
                winner,
                battle.stakeAmount,
                battle.depositDeadline,
                battle.resolutionDeadline,
                battle.seasonalPoolId,
                payoutAddress
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash)
        );

        if (digest.recover(signature) != resolver) {
            revert InvalidSignature();
        }

        battle.winner = winner;
        battle.winnerPayoutAddress = payoutAddress;
        battle.state = BattleState.Resolved;

        emit WinnerResolved(battleId, winner);
    }

    /**
     * @notice Winner claims the pot.
     *
     * Fee split (as per build plan):
     * - Winner receives: 100% - (protocolFeeBps + seasonalFeeBps)
     * - protocolFeeBps goes to protocolFeeReceiver (MemeWarzone main revenue)
     * - seasonalFeeBps goes to seasonalTreasuryReceiver (leagues, events, seasonal rewards)
     *
     * Phase 2: immediately after marking settled (before winner/fee transfers), both creatorDeposit
     * and challengerDeposit are zeroed. This ensures post-settlement views report 0 and storage
     * invariants hold (closes uncleared storage for the claim path).
     *
     * Phase 2 (contractaudits5 / phased-build-da26e79f Medium): the seasonal fee failure leg now also populates
     * `pendingFailedBattleCut[battleId]` (in addition to aggregate pendingFeeWithdrawals) so that the
     * specialized `retryBattleCut(battleId, poolId)` can later re-deliver via the exact `receiveBattleCut(bytes32,bytes32)`
     * metadata call, preserving pool attribution on MajorLeagueTreasury.
     *
     * No admin can touch these funds except through this claim path.
     */
    function claim(bytes32 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.state != BattleState.Resolved) revert InvalidAmount();
        if (msg.sender != battle.winner) revert NotParticipant();
        if (battle.settled) revert AlreadySettled();

        uint256 totalPot = battle.creatorDeposit + battle.challengerDeposit;
        if (totalPot == 0) revert InvalidAmount();

        uint256 protocolFee = (totalPot * protocolFeeBps) / 10000;
        uint256 seasonalFee = (totalPot * seasonalFeeBps) / 10000;
        uint256 totalFee = protocolFee + seasonalFee;
        uint256 winnerAmount = totalPot - totalFee;

        battle.settled = true;
        battle.state = BattleState.Settled;

        // Phase 2: zero both deposit fields immediately after setting settled (before any external calls).
        // Captures ensure pot math (performed above) remains correct even after zeroing.
        // This makes getPotBalance / getCurrentPot / getBattle return 0 post-settlement for all settled paths,
        // closing the uncleared storage High finding for the winner-claim path.
        uint256 creatorDep = battle.creatorDeposit;
        uint256 challengerDep = battle.challengerDeposit;
        battle.creatorDeposit = 0;
        battle.challengerDeposit = 0;

        // Pay winner first (never block user funds on fee receiver behavior)
        address payout = battle.winnerPayoutAddress != address(0) ? battle.winnerPayoutAddress : battle.winner;
        (bool winnerSuccess, ) = payout.call{value: winnerAmount}("");
        require(winnerSuccess, "Winner payout failed");

        // Attempt fee transfers — do not revert if they fail. Credit to pending for later withdrawal.
        if (protocolFee > 0 && protocolFeeReceiver != address(0)) {
            (bool pSuccess, ) = protocolFeeReceiver.call{value: protocolFee}("");
            if (!pSuccess) {
                pendingFeeWithdrawals[protocolFeeReceiver] += protocolFee;
                emit FeeTransferFailed(protocolFeeReceiver, protocolFee, battleId);
            }
        }

        if (seasonalFee > 0 && seasonalTreasuryReceiver != address(0)) {
            (bool sSuccess, ) = seasonalTreasuryReceiver.call{value: seasonalFee}(
                abi.encodeWithSignature("receiveBattleCut(bytes32,bytes32)", battleId, battle.seasonalPoolId)
            );
            if (!sSuccess) {
                pendingFeeWithdrawals[seasonalTreasuryReceiver] += seasonalFee;
                // Phase 2 (contractaudits5): also record per-ID for attribution-preserving retry path.
                // This amount can later be retried via retryBattleCut(battleId, battle.seasonalPoolId) which
                // re-sends the metadata call so MajorLeagueTreasury credits the specific prize pool
                // (instead of plain ETH landing in unallocatedBalance via receive()).
                pendingFailedBattleCut[battleId] += seasonalFee;
                emit FeeTransferFailed(seasonalTreasuryReceiver, seasonalFee, battleId);
            }
        }

        emit Claimed(battleId, battle.winner, winnerAmount, totalFee);
    }

    /**
     * @notice Refund entrypoint (one-sided push vs two-party pull).
     *
     * One-sided incomplete-deposit path (AwaitingDeposits state, exactly one side deposited,
     * past depositDeadline): push-based direct transfer to the depositor only. This path
     * remains push-based (with zeroing) because only the affected party's own receive() behavior
     * can block their refund — the other side has no deposit at risk.
     *
     * Two-party active-battle timeout path (Active state + past resolutionDeadline + !settled):
     * Pull-based (Phase 2 remediation for contractaudits4 High griefing vector). Captures
     * amounts, zeros both deposit fields, marks settled, credits pendingRefunds for creator
     * AND challenger, emits RefundCredited per recipient. No direct ETH transfers or requires
     * that could revert the entire tx. Each participant later pulls via claimRefund().
     *
     * Resolved battles must use the winner's claim() path (protected).
     * Phase 3 (contractaudits5 Low / phased-build-da26e79f): one-sided AwaitingDeposits refund path now also sets `battle.settled = true` for full consistency with claim() and active-timeout paths (inline code comment + checklist requirement).
     */
    function refund(bytes32 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];

        bool pastDepositDeadline = block.timestamp > battle.depositDeadline;
        bool pastResolutionDeadline = block.timestamp > battle.resolutionDeadline;

        if (battle.state == BattleState.AwaitingDeposits) {
            if (!pastDepositDeadline) revert DeadlinePassed();

            address refundTo;
            uint256 refundAmount;

            if (battle.creatorDeposited && !battle.challengerDeposited) {
                refundTo = battle.creator;
                refundAmount = battle.creatorDeposit;
            } else if (battle.challengerDeposited && !battle.creatorDeposited) {
                refundTo = battle.challenger;
                refundAmount = battle.challengerDeposit;
            } else {
                revert NothingToRefund();
            }

            battle.creatorDeposit = 0;
            battle.challengerDeposit = 0;
            battle.state = BattleState.Settled;
            battle.settled = true; // Phase 3 remediation (contractaudits5 Low finding): one-sided incomplete-deposit path now sets settled for full consistency with claim() and active-timeout paths.

            // One-sided refund path remains push-based per Phase 2 design (only self can be impacted
            // by a reverting receiver on this path). See NatSpec above and USER_INTERACTION_GUIDE.md.
            (bool success, ) = refundTo.call{value: refundAmount}("");
            require(success, "Refund failed");

            emit Refunded(battleId, refundTo, refundAmount);
            return;
        }

        // Safety hatch only for unresolved (Active) battles after resolution deadline.
        // Phase 2: converted to pull-based credits (pendingRefunds) so a single participant's
        // reverting receive() cannot block the other participant's refund.
        // Resolved battles should be claimed by the winner (or after a separate claim deadline if added later).
        // We deliberately do NOT allow generic refund once Resolved to protect the game outcome.
        if (battle.state == BattleState.Active && pastResolutionDeadline && !battle.settled) {
            uint256 creatorAmount = battle.creatorDeposit;
            uint256 challengerAmount = battle.challengerDeposit;
            uint256 total = creatorAmount + challengerAmount;
            if (total == 0) revert NothingToRefund();

            // Zero deposits first (checks-effects-interactions + makes views/invariants correct post-settlement)
            battle.creatorDeposit = 0;
            battle.challengerDeposit = 0;

            battle.settled = true;
            battle.state = BattleState.Settled;

            if (creatorAmount > 0) {
                pendingRefunds[battle.creator] += creatorAmount;
                emit RefundCredited(battleId, battle.creator, creatorAmount);
            }
            if (challengerAmount > 0) {
                pendingRefunds[battle.challenger] += challengerAmount;
                emit RefundCredited(battleId, battle.challenger, challengerAmount);
            }

            // No direct calls or requires here — pull model via claimRefund() (with recredit-on-failure).
            // Old batch Refunded emit removed for this path; per-party RefundCredited provides observability.
            return;
        }

        revert InvalidAmount();
    }

    /**
     * @notice Pull-based claim for refunds credited by the active-battle timeout path in refund().
     *
     * Phase 2: follows the same robust recredit-on-failure pattern as retryPendingFee (zero first,
     * attempt send, restore on failure and revert). This ensures a user with a temporarily rejecting
     * receiver does not lose their credited refund.
     *
     * Only callable by participants who have a positive pendingRefunds balance (credited during
     * the two-party post-deadline refund()).
     */
    function claimRefund() external nonReentrant {
        uint256 amount = pendingRefunds[msg.sender];
        if (amount == 0) revert NoPendingRefund();

        pendingRefunds[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) {
            pendingRefunds[msg.sender] = amount; // recredit on failure
            revert("Refund claim failed");
        }
        emit RefundClaimed(msg.sender, amount);
    }

    // ==================== VIEW HELPERS ====================

    function getBattle(bytes32 battleId) external view returns (Battle memory) {
        return battles[battleId];
    }

    function getPotBalance(bytes32 battleId) external view returns (uint256) {
        Battle memory b = battles[battleId];
        // Phase 2: after claim() or the active-timeout branch of refund(), both deposit fields are zeroed
        // (before any external calls). Therefore this (and getBattle) correctly returns 0 for settled battles.
        // One-sided push refunds also zero the fields. See closeout checklist and NatSpec on refund/claim.
        return b.creatorDeposit + b.challengerDeposit;
    }

    // Reject unexpected direct ETH transfers to prevent stuck funds (use deposit() instead)
    receive() external payable {
        revert("Direct transfers not allowed - use deposit()");
    }

    // ==================== USER-FRIENDLY VIEW FUNCTIONS ====================
    // See contracts/USER_INTERACTION_GUIDE.md for recommended frontend integration patterns.

    /**
     * @notice Returns detailed information about a user's participation in a battle.
     * This helps frontends show clear status to creators and challengers.
     *
     * Phase 2 note: depositedAmount will be 0 after settlement (claim or active-timeout refund)
     * because deposit fields are zeroed on those paths. canRefund only applies to the one-sided
     * AwaitingDeposits incomplete case (push path); the two-party active case uses claimRefund()
     * after the refund() credit step.
     */
    function getBattleParticipantInfo(bytes32 battleId, address user)
        external
        view
        returns (
            uint256 depositedAmount,
            bool hasDeposited,
            bool canClaim,
            bool canRefund,
            uint256 timeUntilDeadline
        )
    {
        Battle memory battle = battles[battleId];
        // Phase 2: deposit fields (and thus depositedAmount) are now zeroed post-settlement in claim() and
        // the active timeout refund() path. The one-sided canRefund logic below is unchanged.

        if (user == battle.creator) {
            depositedAmount = battle.creatorDeposit;
            hasDeposited = battle.creatorDeposited;
        } else if (user == battle.challenger) {
            depositedAmount = battle.challengerDeposit;
            hasDeposited = battle.challengerDeposited;
        }

        bool bothDeposited = battle.creatorDeposited && battle.challengerDeposited;
        bool pastDeadline = block.timestamp > battle.depositDeadline;

        canClaim = battle.state == BattleState.Resolved &&
                   battle.winner == user &&
                   !battle.settled;

        canRefund = battle.state == BattleState.AwaitingDeposits &&
                    hasDeposited &&
                    pastDeadline &&
                    !bothDeposited;

        if (battle.state == BattleState.AwaitingDeposits && !pastDeadline) {
            timeUntilDeadline = battle.depositDeadline > block.timestamp
                ? battle.depositDeadline - block.timestamp
                : 0;
        }
    }

    /**
     * @notice Checks if a battle pot can be claimed by the winner.
     *
     * Phase 2: deposit fields are zeroed inside claim() immediately after settled=true (before transfers).
     * This view (and getBattle) therefore reports clean post-settlement state.
     * Phase 3 (contractaudits5 Low / phased-build-da26e79f): one-sided refund path now sets `battle.settled = true` (consistency note per checklist; see refund() for the code change).
     */
    function isClaimable(bytes32 battleId) external view returns (bool) {
        Battle memory battle = battles[battleId];
        return battle.state == BattleState.Resolved &&
               battle.winner != address(0) &&
               !battle.settled;
    }

    /**
     * @notice Checks if a user can get a refund for a battle (one side deposited, deadline passed).
     *
     * Phase 2: this only covers the one-sided AwaitingDeposits incomplete-deposit push path.
     * The two-party active post-resolutionDeadline case is now handled via refund() credit +
     * claimRefund() pull; isRefundable will return false for it (correctly, since settled after credit).
     * Deposit fields zeroed on all settlement paths.
     * Phase 3 (contractaudits5 Low / phased-build-da26e79f): one-sided AwaitingDeposits refund path now sets `battle.settled = true` (full consistency with claim/active-timeout; see exact comment in refund()).
     */
    function isRefundable(bytes32 battleId, address user) external view returns (bool) {
        Battle memory battle = battles[battleId];
        bool pastDeadline = block.timestamp > battle.depositDeadline;
        bool bothDeposited = battle.creatorDeposited && battle.challengerDeposited;

        if (!pastDeadline || bothDeposited) return false;

        if (user == battle.creator) return battle.creatorDeposited && !battle.challengerDeposited;
        if (user == battle.challenger) return battle.challengerDeposited && !battle.creatorDeposited;

        return false;
    }

    /**
     * @notice Returns the current total pot size for a battle.
     *
     * Phase 2: deposit fields are zeroed in claim() (after settled, before transfers) and in the
     * active-timeout refund() branch (pull credits). One-sided also zeros. Thus this returns 0
     * for all settled battles, keeping view helpers and invariants consistent post-settlement.
     */
    function getCurrentPot(bytes32 battleId) external view returns (uint256) {
        Battle memory battle = battles[battleId];
        return battle.creatorDeposit + battle.challengerDeposit;
    }

    /**
     * @notice Allows a fee receiver to claim fees that previously failed to transfer.
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
     *
     * Phase 2 note (contractaudits5 / phased-build-da26e79f): For league-cut amounts destined for
     * seasonalTreasuryReceiver (MajorLeagueTreasury), prefer the specialized `retryBattleCut(battleId, poolId)`
     * which re-delivers the exact metadata call (`receiveBattleCut(bytes32,bytes32)`) and thereby
     * preserves the original pool attribution on Major. Plain `retryPendingFee(seasonalTreasuryReceiver)`
     * sends bare ETH and lands in unallocatedBalance. The original IDs are always available in the
     * preceding FeeTransferFailed event.
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

    // ==================== PHASE 2: ATTRIBUTION-PRESERVING LEAGUE CUT RETRY (contractaudits5) ====================
    // Added after the Phase 1 retry/redirect block (append-only). Follows identical nonReentrant +
    // zero-first + recredit-on-fail + CEI + custom error pattern as retryPendingFee in this file
    // and the symmetric retrySponsorshipCut in SponsorshipPayments.sol (Battle side added in
    // Phase 4 Fix Round 1 of phased-build-da26e79f to complete the Medium finding remediation).
    // The metadata call ensures the cut is attributed to the original poolId on MajorLeagueTreasury.

    /**
     * @notice Anyone may retry a previously failed league cut for a specific battle, delivering
     * the exact `receiveBattleCut(bytes32 battleId, bytes32 poolId)` metadata call so that
     * MajorLeagueTreasury credits the intended prize pool instead of generic unallocatedBalance.
     *
     * Pattern (identical to retryPendingFee and the ec52d84a Phase 1 precedent):
     * 1. Snapshot amount from the per-ID pendingFailedBattleCut mapping.
     * 2. Zero the per-ID entry first (CEI).
     * 3. Optionally decrement the aggregate pendingFeeWithdrawals[seasonal] for consistency.
     * 4. Perform the metadata .call to seasonalTreasuryReceiver.
     * 5. On failure: restore the per-ID amount and revert FeeRetryFailed (aggregate already adjusted safely).
     * 6. On success: emit the dedicated BattleCutRetriedWithMetadata event.
     *
     * The original battleId + poolId are carried through, preserving full attribution for indexers
     * and league accounting. This directly addresses the Medium "Failed league-cut retries lose pool attribution"
     * finding in contractaudits5.md.
     */
    function retryBattleCut(bytes32 battleId, bytes32 poolId) external nonReentrant {
        uint256 amount = pendingFailedBattleCut[battleId];
        require(amount > 0, "Nothing to retry");

        pendingFailedBattleCut[battleId] = 0;

        // Keep aggregate consistent when the failed cut had also been credited to pendingFeeWithdrawals.
        if (pendingFeeWithdrawals[seasonalTreasuryReceiver] >= amount) {
            pendingFeeWithdrawals[seasonalTreasuryReceiver] -= amount;
        }

        (bool success, ) = seasonalTreasuryReceiver.call{value: amount}(
            abi.encodeWithSignature("receiveBattleCut(bytes32,bytes32)", battleId, poolId)
        );
        if (!success) {
            pendingFailedBattleCut[battleId] = amount; // recredit on failure
            revert FeeRetryFailed();
        }
        emit BattleCutRetriedWithMetadata(battleId, poolId, amount);
    }
}
