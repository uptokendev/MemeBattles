// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title SponsorshipPayments
 * @dev Minimal, safe contract for handling all PostGrad sponsorship payments.
 *
 * Split (finalized): 70/15/15
 * - 70% → Recipient (the party being sponsored)
 * - 15% → Protocol (`ProtocolRevenueVault`)
 * - 15% → Major Leagues (`MajorLeagueTreasury`)
 *
 * Design goals (per architecture decisions):
 * - Immediate split — no long-term holding of funds.
 * - Very small attack surface.
 * - Easy to audit and reason about.
 * - Supports different sponsorship types via sponsorshipId (for off-chain tracking).
 *
 * This is the ONLY contract that should be called for sponsorship payments.
 *
 * Phase 2 (contractaudits5 / phased-build-da26e79f): EIP-712 authorization for payForSponsorship
 * when sponsorshipAuthorizer is set (closes frontrunning/DoS on globally-unique sponsorshipId).
 * Also added attribution-preserving retrySponsorshipCut for failed league cuts.
 * contractaudits8: ctor requires non-zero authorizer (unsigned mode removed entirely); timelocked
 * structured-cut redirect (propose/execute/cancel) added for historical receiver recovery.
 */
contract SponsorshipPayments is ReentrancyGuard, Ownable {
    using ECDSA for bytes32;

    address public protocolFeeReceiver;     // Should be ProtocolRevenueVault
    address public seasonalTreasuryReceiver; // Should be MajorLeagueTreasury

    uint256 public constant RECIPIENT_BPS = 7000; // 70%
    uint256 public constant PROTOCOL_BPS  = 1500; // 15%
    uint256 public constant LEAGUE_BPS    = 1500; // 15%
    uint256 public constant TOTAL_BPS     = 10000;

    // Simple timelock for receiver changes
    uint256 public constant TIMELOCK_DELAY = 2 days;

    struct PendingChange {
        address newValue;
        uint256 executeAfter;
        bool exists;
    }

    PendingChange public pendingProtocolFeeReceiver;
    PendingChange public pendingSeasonalTreasuryReceiver;

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

    // Phase 5: timelocked path for minimumSponsorshipAmount (closes remaining sensitive immediate setter per contractaudits4).
    // Uses dedicated PendingMinimum struct (simple uint256) following established timelock patterns.
    struct PendingMinimum {
        uint256 newValue;
        uint256 executeAfter;
        bool exists;
    }

    PendingMinimum public pendingMinimumSponsorshipAmount;

    // Phase 2 (contractaudits5 Medium/High): timelocked sponsorshipAuthorizer for EIP-712 binding
    // of payForSponsorship calls. When non-zero, signatures are required (closes globally-unique
    // sponsorshipId frontrun/DoS vector). contractaudits8: ctor requires non-zero; address(0) rejected
    // at execute (no unsigned mode remains; signaturesEnforced permanent). Uses exact Pending* + propose/execute/cancel
    // pattern from the Phase 5 minimumSponsorshipAmount implementation in this file.
    struct PendingAuthorizer {
        address newValue;
        uint256 executeAfter;
        bool exists;
    }

    PendingAuthorizer public pendingSponsorshipAuthorizer;
    address public sponsorshipAuthorizer; // Set at construction (non-zero required per contractaudits8) or via timelocked propose/execute/cancel (Phase 2, contractaudits5 / phased-build-da26e79f)
    // contractsaudits7 + contractaudits8: signaturesEnforced is true at ctor (authorizer non-zero) and cannot be disabled (execute rejects 0).
    bool public signaturesEnforced;

    // Accounting for fees that failed to transfer (non-blocking path).
    // Phase 1: see retryPendingFee (anyone) + timelocked pendingFeeRedirect (owner, fee-only) below.
    mapping(address => uint256) public pendingFeeWithdrawals;

    // Phase 2 (contractaudits5 Medium) + contractsaudits7: per-sponsorshipId pending league-cut (amount + the
    // seasonalTreasuryReceiver at failure time). Structured cuts NOT in generic pending (prevents double-pay
    // and erasure of unrelated). retry uses historical receiver if global changes.
    struct PendingSponsorshipCut {
        uint256 amount;
        address receiver;
    }
    mapping(bytes32 => PendingSponsorshipCut) public pendingFailedSponsorshipCut;

    // contractaudits8: timelocked redirect for a specific pendingFailedSponsorshipCut entry.
    // Allows owner to point a stuck structured cut (after historical receiver migration or misconfig)
    // to a new receiver while preserving the sponsorshipId key + poolId metadata (for retrySponsorshipCut).
    // Uses exact 2-day Pending* + propose/execute/cancel + onlyOwner pattern (append-only, no new trust).
    struct PendingSponsorshipCutRedirect {
        bytes32 sponsorshipId;
        address newReceiver;
        uint256 executeAfter;
        bool exists;
    }
    PendingSponsorshipCutRedirect public pendingSponsorshipCutRedirect;

    // contractsaudits6: store the original poolId at payment time so that retrySponsorshipCut is bound to it
    // (prevents caller from supplying arbitrary poolId for the metadata credit on Major).
    mapping(bytes32 => bytes32) public sponsorshipPoolId;

    // Phase 4: expanded with payer, poolId, and cumulativePaid for full observability (per contractaudits4 Medium finding).
    // sponsorshipId is enforced unique at payment time.
    event SponsorshipPaid(
        bytes32 indexed sponsorshipId,
        address indexed payer,
        address indexed recipient,
        bytes32 poolId,
        uint256 totalAmount,
        uint256 recipientAmount,
        uint256 protocolAmount,
        uint256 leagueAmount,
        uint256 cumulativePaid
    );

    event FeeTransferFailed(address indexed receiver, uint256 amount, bytes32 indexed sponsorshipId);

    // Pass 3 remediation (phased-build-267caf05): cancellation events for pending timelock proposals (operational safety)
    event PendingProtocolFeeReceiverCancelled();
    event PendingSeasonalTreasuryReceiverCancelled();

    // Phase 4 remediation (contractaudits4 Medium finding): full propose/execute events for the two receiver timelocks.
    // Provides complete on-chain observability of all admin receiver changes (modeled on Phase 3 source events in MajorLeagueTreasury).
    event ProtocolFeeReceiverProposed(address indexed newReceiver, uint256 executeAfter);
    event ProtocolFeeReceiverExecuted(address indexed newReceiver);
    event SeasonalTreasuryReceiverProposed(address indexed newReceiver, uint256 executeAfter);
    event SeasonalTreasuryReceiverExecuted(address indexed newReceiver);

    // Phase 1 remediation (contractaudits4 High finding): failed fee recovery hardening
    event PendingFeeRedirectProposed(address indexed oldReceiver, address indexed newReceiver, uint256 amount, uint256 executeAfter);
    event PendingFeeRedirectExecuted(address indexed oldReceiver, address indexed newReceiver, uint256 amount);
    event PendingFeeRedirectCancelled();
    event FeeRetrySucceeded(address indexed receiver, uint256 amount);

    event ReceiversUpdated(
        address indexed protocolFeeReceiver,
        address indexed seasonalTreasuryReceiver
    );

    event MinimumSponsorshipAmountUpdated(uint256 newMinimum);

    // Phase 5 remediation (contractaudits4 Low): full propose/execute/cancel events for the now-timelocked minimumSponsorshipAmount setter.
    // Completes "no remaining immediate powerful setters" (except documented emergency pauses).
    event MinimumSponsorshipAmountProposed(uint256 newMinimum, uint256 executeAfter);
    event MinimumSponsorshipAmountExecuted(uint256 newMinimum);
    event PendingMinimumSponsorshipAmountCancelled();

    // Phase 2 (contractaudits5 Medium/High): sponsorshipAuthorizer timelock events (exact naming + style
    // copied from the Phase 5 MinimumSponsorshipAmount* events above; appended for full observability).
    event SponsorshipAuthorizerProposed(address indexed newAuthorizer, uint256 executeAfter);
    event SponsorshipAuthorizerExecuted(address indexed newAuthorizer);
    event PendingSponsorshipAuthorizerCancelled();

    // Phase 2 (contractaudits5 Medium): dedicated event emitted on successful attribution-preserving retry
    // (contrasts with generic FeeRetrySucceeded from plain retryPendingFee). Carries the original IDs so
    // indexers can attribute the cut to the correct prize pool after recovery.
    event SponsorshipCutRetriedWithMetadata(bytes32 indexed sponsorshipId, bytes32 indexed poolId, uint256 amount);

    // contractaudits8: events for the timelocked structured sponsorship cut redirect (edge recovery for
    // historical receiver migration). Mirrors the style and safety of fee redirect + other timelocks.
    event SponsorshipCutRedirectProposed(bytes32 indexed sponsorshipId, address indexed newReceiver, uint256 executeAfter);
    event SponsorshipCutRedirectExecuted(bytes32 indexed sponsorshipId, address indexed newReceiver);
    event PendingSponsorshipCutRedirectCancelled();

    // EIP-712 typehash for sponsorship authorization (Phase 2 / contractaudits5).
    // 6-field struct binds the exact payment intent (prevents frontrun on sponsorshipId alone).
    bytes32 public constant SPONSORSHIP_AUTH_TYPEHASH = keccak256(
        "SponsorshipAuthorization(bytes32 sponsorshipId,address payer,address recipient,bytes32 poolId,uint256 amount,uint256 deadline)"
    );

    error InvalidAmount();
    error ZeroAddress();
    error InvalidSplit();
    error FeeRetryFailed();
    error SponsorshipAlreadyPaid();

    // Phase 2 (contractaudits5): new custom errors for EIP-712 sponsorship authorization failures.
    error InvalidSponsorshipAuthorization();
    error SponsorshipAuthorizationExpired();

    // contractaudits8: for the new timelocked structured-cut redirect recovery (historical receiver migration).
    error NoPendingCutRedirect();

    constructor(
        address _protocolFeeReceiver,
        address _seasonalTreasuryReceiver,
        address _sponsorshipAuthorizer
    ) Ownable(msg.sender) {
        _setReceivers(_protocolFeeReceiver, _seasonalTreasuryReceiver);
        // contractaudits8: unsigned mode removed for production. Ctor now requires non-zero authorizer so
        // signatures are always enforced (closes the Low/Operational remaining finding). No path to deploy
        // allowing unsigned payForSponsorship (prevents predictable-ID frontrun even at init).
        require(_sponsorshipAuthorizer != address(0), "Authorizer required");
        sponsorshipAuthorizer = _sponsorshipAuthorizer;
        signaturesEnforced = true;
    }

    // setReceivers removed after deployment. All post-deployment receiver changes must use the timelock propose/execute path.
    // _setReceivers remains internal for constructor initialization only.

    function _setReceivers(
        address _protocol,
        address _seasonal
    ) internal {
        if (_protocol == address(0) || _seasonal == address(0)) {
            revert ZeroAddress();
        }
        protocolFeeReceiver = _protocol;
        seasonalTreasuryReceiver = _seasonal;
        emit ReceiversUpdated(_protocol, _seasonal);
    }

    // --- Timelocked Receiver Changes ---
    function proposeProtocolFeeReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "Invalid address");
        pendingProtocolFeeReceiver = PendingChange({
            newValue: newReceiver,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        // Phase 4: emit Proposed for timelock observability.
        emit ProtocolFeeReceiverProposed(newReceiver, pendingProtocolFeeReceiver.executeAfter);
    }

    function executeProtocolFeeReceiver() external onlyOwner {
        PendingChange memory change = pendingProtocolFeeReceiver;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        protocolFeeReceiver = change.newValue;
        delete pendingProtocolFeeReceiver;
        // Phase 4: emit dedicated Executed event (in addition to the existing ReceiversUpdated for compatibility).
        emit ProtocolFeeReceiverExecuted(change.newValue);
        emit ReceiversUpdated(protocolFeeReceiver, seasonalTreasuryReceiver);
    }

    function proposeSeasonalTreasuryReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "Invalid address");
        pendingSeasonalTreasuryReceiver = PendingChange({
            newValue: newReceiver,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        // Phase 4: emit Proposed for timelock observability.
        emit SeasonalTreasuryReceiverProposed(newReceiver, pendingSeasonalTreasuryReceiver.executeAfter);
    }

    function executeSeasonalTreasuryReceiver() external onlyOwner {
        PendingChange memory change = pendingSeasonalTreasuryReceiver;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        seasonalTreasuryReceiver = change.newValue;
        delete pendingSeasonalTreasuryReceiver;
        // Phase 4: emit dedicated Executed event (in addition to the existing ReceiversUpdated for compatibility).
        emit SeasonalTreasuryReceiverExecuted(change.newValue);
        emit ReceiversUpdated(protocolFeeReceiver, seasonalTreasuryReceiver);
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

    /**
     * @notice Pay for a sponsorship.
     *
     * contractaudits8: unsigned mode eliminated entirely. Ctor requires non-zero sponsorshipAuthorizer and
     * verification is unconditional. EIP-712 signature + deadline always required. This solves the remaining
     * Low/Operational "unsigned sponsorship mode if deployed with zero authorizer" finding.
     *
     * Phase 2 update (contractaudits5 / phased-build-da26e79f):
     * - Signature changed to include `deadline` and `signature` (EIP-712).
     * - The caller MUST supply a valid EIP-712 signature from the sponsorshipAuthorizer over the SponsorshipAuthorization struct.
     * - The struct is: SponsorshipAuthorization(sponsorshipId, payer=msg.sender, recipient, poolId, amount=msg.value, deadline)
     * - Domain: name="SponsorshipPayments", version="1", chainId, verifyingContract=this.
     * - Off-chain: use ethers.signTypedData (or equivalent) with the exact typehash and domain.
     *   Personal sign / toEthSignedMessageHash will fail (exactly as with BattleTreasury.resolveWinner).
     * - constructor now requires non-zero _sponsorshipAuthorizer (signatures always enforced for production; no unsigned path remains).
     * - contractsaudits7 + contractaudits8: executeSponsorshipAuthorizer cannot set authorizer to 0 once enforced (always true post-ctor).
     * - This binds the globally-unique sponsorshipId to the intended payer/recipient/amount/pool/deadline,
     *   closing the Medium/High frontrun/DoS vector (any attacker could previously pre-pay a predictable ID).
     *
     * @param sponsorshipId Unique identifier for this sponsorship (for tracking different types/periods).
     *        Enforced unique on-chain in Phase 4: first successful payForSponsorship wins; subsequent calls with
     *        the same sponsorshipId revert with SponsorshipAlreadyPaid (or InvalidAmount per plan example).
     * @param recipient The address that should receive the 70% (the sponsored party)
     * @param poolId Optional target pool in MajorLeagueTreasury for the 15% league cut. Pass bytes32(0) to send to unallocated.
     * @param deadline EIP-712 signature deadline (unix timestamp). Always required.
     * @param signature EIP-712 signature over the SponsorshipAuthorization struct (always required).
     *
     * minimumSponsorshipAmount is enforced if >0. It is now controlled exclusively via the timelocked
     * proposeMinimumSponsorshipAmount / executeMinimumSponsorshipAmount / cancelPendingMinimumSponsorshipAmount
     * (Phase 5 remediation). No immediate owner setter remains for this parameter.
     */
    function payForSponsorship(
        bytes32 sponsorshipId,
        address recipient,
        bytes32 poolId,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        uint256 amount = msg.value;
        if (amount == 0) revert InvalidAmount();
        if (minimumSponsorshipAmount > 0 && amount < minimumSponsorshipAmount) revert InvalidAmount();
        if (recipient == address(0)) revert ZeroAddress();

        // contractaudits8: EIP-712 verification is now unconditional (authorizer never 0 post-ctor).
        // Placed after basic checks and before the uniqueness guard (so signature failures are cheap and
        // do not interfere with the first-payer-wins semantics of SponsorshipAlreadyPaid).
        _verifySponsorshipAuthorization(
            sponsorshipId,
            msg.sender,
            recipient,
            poolId,
            amount,
            deadline,
            signature
        );

        // Phase 4: enforce sponsorshipId uniqueness (first payment wins). Revert before any state changes or transfers.
        if (sponsorshipPaid[sponsorshipId]) revert SponsorshipAlreadyPaid();
        sponsorshipPaid[sponsorshipId] = true;

        // contractsaudits6: store original poolId so retrySponsorshipCut is bound to it (caller-supplied poolId
        // in the retry function is accepted for compat but the stored value is used for the metadata call).
        sponsorshipPoolId[sponsorshipId] = poolId;

        uint256 recipientAmount = (amount * RECIPIENT_BPS) / TOTAL_BPS;
        uint256 protocolAmount  = (amount * PROTOCOL_BPS)  / TOTAL_BPS;
        uint256 leagueAmount    = (amount * LEAGUE_BPS)    / TOTAL_BPS;

        // Due to integer division there may be a tiny dust amount.
        // We send it to the league side to keep accounting clean.
        uint256 totalSent = recipientAmount + protocolAmount + leagueAmount;
        if (totalSent < amount) {
            leagueAmount += (amount - totalSent);
        }

        // Send to recipient (70%)
        (bool rSuccess, ) = recipient.call{value: recipientAmount}("");
        require(rSuccess, "Recipient transfer failed");

        // Attempt fee transfers — do not revert if they fail.
        // Phase 1/contractsaudits6: for structured league cuts, credit ONLY to per-ID pendingFailedSponsorshipCut
        // (never to generic pendingFeeWithdrawals[seasonal]) so that generic retry cannot double-pay or erase
        // unrelated fees. See contractsaudits7. Protocol cuts still use the generic pending.
        if (protocolAmount > 0 && protocolFeeReceiver != address(0)) {
            (bool pSuccess, ) = protocolFeeReceiver.call{value: protocolAmount}("");
            if (!pSuccess) {
                pendingFeeWithdrawals[protocolFeeReceiver] += protocolAmount;
                emit FeeTransferFailed(protocolFeeReceiver, protocolAmount, sponsorshipId);
            }
        }

        if (leagueAmount > 0 && seasonalTreasuryReceiver != address(0)) {
            (bool lSuccess, ) = seasonalTreasuryReceiver.call{value: leagueAmount}(
                abi.encodeWithSignature("receiveSponsorshipCut(bytes32,bytes32)", sponsorshipId, poolId)
            );
            if (!lSuccess) {
                // Phase 1/contractsaudits6/7: structured league cuts recorded ONLY in per-ID (with receiver at failure).
                // NOT in generic (prevents double-pay and erasure of unrelated fees). The stored receiver ensures
                // retry goes to historical one even if global seasonalTreasuryReceiver changes via timelock.
                pendingFailedSponsorshipCut[sponsorshipId] = PendingSponsorshipCut({
                    amount: leagueAmount,
                    receiver: seasonalTreasuryReceiver
                });
                emit FeeTransferFailed(seasonalTreasuryReceiver, leagueAmount, sponsorshipId);
            }
        }

        totalPaidPerSponsorship[sponsorshipId] += amount;

        // Phase 4: emit now includes payer (msg.sender), poolId, and post-increment cumulative for full schema.
        emit SponsorshipPaid(
            sponsorshipId,
            msg.sender,
            recipient,
            poolId,
            amount,
            recipientAmount,
            protocolAmount,
            leagueAmount,
            totalPaidPerSponsorship[sponsorshipId]
        );
    }

    bool public paused;

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    // setPaused is kept immediate for emergency use only (see TRUST_MODEL.md "Remaining Immediate Controls (Post Remediation)").
    // All other powerful owner controls now use the 2-day timelock + cancel pattern.
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    uint256 public minimumSponsorshipAmount; // Now set exclusively via timelocked propose/execute (Phase 5)

    // Phase 4: sponsorshipId is now a true unique paid-once identifier (first payment wins; duplicates revert).
    // Paired with cumulative tracking below for hybrid model (uniqueness guard + cumulative reporting).
    mapping(bytes32 => bool) public sponsorshipPaid;

    // Track cumulative amount paid per sponsorshipId (now with uniqueness enforcement above per Phase 4).
    mapping(bytes32 => uint256) public totalPaidPerSponsorship;

    // Phase 5: setMinimumSponsorshipAmount is now timelocked (was immediate owner setter).
    // propose/execute/cancel follow the exact same pattern as receiver and fee-redirect timelocks.
    // The public var + legacy MinimumSponsorshipAmountUpdated event are preserved for compatibility.
    // NatSpec and USER_INTERACTION_GUIDE updated to document the new flow.
    function proposeMinimumSponsorshipAmount(uint256 newMin) external onlyOwner {
        pendingMinimumSponsorshipAmount = PendingMinimum({
            newValue: newMin,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        emit MinimumSponsorshipAmountProposed(newMin, pendingMinimumSponsorshipAmount.executeAfter);
    }

    function executeMinimumSponsorshipAmount() external onlyOwner {
        PendingMinimum memory change = pendingMinimumSponsorshipAmount;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        minimumSponsorshipAmount = change.newValue;
        delete pendingMinimumSponsorshipAmount;
        emit MinimumSponsorshipAmountExecuted(change.newValue);
        emit MinimumSponsorshipAmountUpdated(change.newValue); // compatibility with prior listeners
    }

    function cancelPendingMinimumSponsorshipAmount() external onlyOwner {
        delete pendingMinimumSponsorshipAmount;
        emit PendingMinimumSponsorshipAmountCancelled();
    }

    // ==================== PHASE 2: SPONSORSHIP AUTHORIZER TIMELOCK (contractaudits5) ====================
    // Exact copy of the Phase 5 PendingMinimum + propose/execute/cancel pattern (including event style,
    // 2-day TIMELOCK_DELAY, onlyOwner, require strings, delete, and emit ordering).
    // contractaudits8: address(0) is rejected at execute (signaturesEnforced is permanent; no unsigned mode).

    /**
     * @notice Owner proposes a new sponsorshipAuthorizer (EIP-712 signer) with 2-day timelock.
     * @param newAuthorizer The address that will be required to produce SponsorshipAuthorization signatures
     *        when set (non-zero). contractaudits8: passing address(0) is rejected at execute time (signaturesEnforced
     *        is permanent after ctor; unsigned mode does not exist).
     */
    function proposeSponsorshipAuthorizer(address newAuthorizer) external onlyOwner {
        pendingSponsorshipAuthorizer = PendingAuthorizer({
            newValue: newAuthorizer,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        emit SponsorshipAuthorizerProposed(newAuthorizer, pendingSponsorshipAuthorizer.executeAfter);
    }

    /**
     * @notice Owner executes a previously proposed sponsorshipAuthorizer change after the timelock.
     * contractaudits8: newValue==address(0) is rejected when signaturesEnforced (always after ctor).
     */
    function executeSponsorshipAuthorizer() external onlyOwner {
        PendingAuthorizer memory change = pendingSponsorshipAuthorizer;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        if (signaturesEnforced && change.newValue == address(0)) {
            revert("cannot disable signatures once enforced (contractsaudits7)");
        }
        sponsorshipAuthorizer = change.newValue;
        if (change.newValue != address(0)) {
            signaturesEnforced = true;
        }
        delete pendingSponsorshipAuthorizer;
        emit SponsorshipAuthorizerExecuted(change.newValue);
    }

    /**
     * @notice Owner cancels a pending sponsorshipAuthorizer proposal (before or after timelock expiry).
     */
    function cancelPendingSponsorshipAuthorizer() external onlyOwner {
        delete pendingSponsorshipAuthorizer;
        emit PendingSponsorshipAuthorizerCancelled();
    }

    // Reject direct transfers — use payForSponsorship() for proper attribution and splitting
    receive() external payable {
        revert("Use payForSponsorship() for proper 70/15/15 split");
    }

    // ==================== USER-FRIENDLY HELPERS ====================
    // See contracts/USER_INTERACTION_GUIDE.md for recommended frontend integration patterns.

    /**
     * @notice Returns exactly how the amount would be split.
     * Frontends can call this before sending to show the user a clear breakdown.
     */
    function getSplit(uint256 amount)
        external
        pure
        returns (
            uint256 recipientAmount,
            uint256 protocolAmount,
            uint256 leagueAmount
        )
    {
        recipientAmount = (amount * RECIPIENT_BPS) / TOTAL_BPS;
        protocolAmount  = (amount * PROTOCOL_BPS)  / TOTAL_BPS;
        leagueAmount    = (amount * LEAGUE_BPS)    / TOTAL_BPS;

        uint256 total = recipientAmount + protocolAmount + leagueAmount;
        if (total < amount) {
            leagueAmount += (amount - total);
        }
    }

    /**
     * @notice Returns the current minimum required sponsorship amount (0 = no minimum).
     * The value is now only changeable via the 2-day timelocked propose/execute path (Phase 5).
     */
    function getMinimumSponsorshipAmount() external view returns (uint256) {
        return minimumSponsorshipAmount;
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
     * seasonalTreasuryReceiver (MajorLeagueTreasury), prefer the specialized `retrySponsorshipCut(sponsorshipId, poolId)`
     * which re-delivers the exact metadata call (`receiveSponsorshipCut(bytes32,bytes32)`) and thereby
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
    // and the symmetric retryBattleCut added to BattleTreasury in the same remediation pass.
    // The metadata call ensures the cut is attributed to the original poolId on MajorLeagueTreasury.

    /**
     * @notice Anyone may retry a previously failed league cut for a specific sponsorship, delivering
     * the exact `receiveSponsorshipCut(bytes32 sponsorshipId, bytes32 poolId)` metadata call so that
     * MajorLeagueTreasury credits the intended prize pool instead of generic unallocatedBalance.
     *
     * Pattern (identical to retryPendingFee and the ec52d84a Phase 1 precedent):
     * 1. Snapshot amount from the per-ID pendingFailedSponsorshipCut mapping.
     * 2. Zero the per-ID entry first (CEI).
     * 3. Perform the metadata .call to seasonalTreasuryReceiver.
     * 4. On failure: restore the per-ID amount and revert FeeRetryFailed.
     * 5. On success: emit the dedicated SponsorshipCutRetriedWithMetadata event.
     *
     * contractsaudits7: removed aggregate decrement step. Structured league cuts are intentionally
     * not recorded in the generic pendingFeeWithdrawals[seasonalTreasuryReceiver] (see payForSponsorship failure leg),
     * so decrementing it would silently erase unrelated pending fees from other sources.
     *
     * The original sponsorshipId + poolId are carried through, preserving full attribution for indexers
     * and league accounting. This directly addresses the Medium "Failed league-cut retries lose pool attribution"
     * finding in contractaudits5.md.
     *
     * contractsaudits6: poolId param is accepted for compatibility but the canonical value is taken from
     * sponsorshipPoolId[sponsorshipId] (set at payForSponsorship time). This binds the retry to the original
     * pool chosen by the payer.
     *
     * contractsaudits7: the receiver for the metadata call is the one stored with the cut at failure time
     * (not current global seasonalTreasuryReceiver) in case the receiver is later changed via timelock.
     *
     * contractaudits8: if the historical receiver itself later becomes unusable, owner can use the
     * proposeSponsorshipCutRedirect / executeSponsorshipCutRedirect / cancelPendingSponsorshipCutRedirect
     * (2-day timelock) to update *only* the .receiver on this per-ID record (amount + sponsorshipId + pool
     * binding unchanged). This provides the recommended recovery for the "historical receiver retry can
     * leave cuts stuck" Low finding without touching generic fees or other entries.
     */
    function retrySponsorshipCut(bytes32 sponsorshipId, bytes32 poolId) external nonReentrant {
        PendingSponsorshipCut memory cut = pendingFailedSponsorshipCut[sponsorshipId];
        uint256 amount = cut.amount;
        require(amount > 0, "Nothing to retry");

        pendingFailedSponsorshipCut[sponsorshipId] = PendingSponsorshipCut({amount: 0, receiver: address(0)});

        // contractsaudits6: bind to the original stored poolId from payment time (the passed poolId is accepted
        // for signature/ABI compatibility but ignored). This prevents caller from choosing arbitrary pool
        // for the metadata credit on Major.
        bytes32 poolIdToUse = sponsorshipPoolId[sponsorshipId];

        // contractsaudits7: use the historical receiver stored at failure time (not current global).
        address receiverToUse = cut.receiver != address(0) ? cut.receiver : seasonalTreasuryReceiver;

        // contractsaudits7: removed aggregate decrement step. Structured league cuts are intentionally
        // not recorded in the generic pendingFeeWithdrawals[seasonalTreasuryReceiver] (see payForSponsorship failure leg),
        // so decrementing it would silently erase unrelated pending fees from other sources.

        (bool success, ) = receiverToUse.call{value: amount}(
            abi.encodeWithSignature("receiveSponsorshipCut(bytes32,bytes32)", sponsorshipId, poolIdToUse)
        );
        if (!success) {
            pendingFailedSponsorshipCut[sponsorshipId] = cut; // recredit on failure
            revert FeeRetryFailed();
        }
        emit SponsorshipCutRetriedWithMetadata(sponsorshipId, poolIdToUse, amount);
    }

    // ==================== contractaudits8: TIMELOCKED STRUCTURED CUT REDIRECT (edge recovery) ====================
    // Addresses the Low "Historical receiver retry can leave cuts stuck after receiver migration".
    // When the receiver recorded in pendingFailedSponsorshipCut at failure time is no longer viable
    // (e.g. contract migration, permanent reject), owner can timelock a receiver change on that
    // *specific* per-ID entry. The sponsorshipId key, amount, and poolId binding are preserved so that
    // a later retrySponsorshipCut(sponsorshipId, ...) will deliver to the new receiver with correct metadata.
    // Follows identical 2-day timelock + onlyOwner + cancel + rich Proposed/Executed events pattern as
    // fee redirect and authorizer/minimum timelocks. Append-only. No effect on generic pendingFeeWithdrawals.
    // Execute re-checks the per-ID cut still has remaining amount (defensive, in case raced with a retry).

    /**
     * @notice Owner proposes a 2-day timelocked redirect of the receiver for a specific pending
     * failed sponsorship league cut (per-ID structured entry only). Preserves sponsorshipId + pool
     * for attribution on eventual retrySponsorshipCut.
     */
    function proposeSponsorshipCutRedirect(bytes32 sponsorshipId, address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "Invalid address");
        // Note: we allow propose even if no current pending (execute will enforce); keeps pattern simple.
        pendingSponsorshipCutRedirect = PendingSponsorshipCutRedirect({
            sponsorshipId: sponsorshipId,
            newReceiver: newReceiver,
            executeAfter: block.timestamp + TIMELOCK_DELAY,
            exists: true
        });
        emit SponsorshipCutRedirectProposed(sponsorshipId, newReceiver, pendingSponsorshipCutRedirect.executeAfter);
    }

    /**
     * @notice Owner executes a previously proposed structured cut redirect after timelock.
     * Updates only the .receiver on the pendingFailedSponsorshipCut entry (amount and key unchanged).
     */
    function executeSponsorshipCutRedirect() external onlyOwner {
        PendingSponsorshipCutRedirect memory change = pendingSponsorshipCutRedirect;
        require(change.exists, "No pending change");
        require(block.timestamp >= change.executeAfter, "Timelock not expired");
        // Defensive: the per-ID cut must still hold a positive amount (protects against stale redirect
        // after a successful retry or another redirect that zeroed it).
        if (pendingFailedSponsorshipCut[change.sponsorshipId].amount == 0) {
            revert NoPendingCutRedirect();
        }
        pendingFailedSponsorshipCut[change.sponsorshipId].receiver = change.newReceiver;
        emit SponsorshipCutRedirectExecuted(change.sponsorshipId, change.newReceiver);
        delete pendingSponsorshipCutRedirect;
    }

    /**
     * @notice Owner cancels a pending structured sponsorship cut redirect (before or after expiry).
     */
    function cancelPendingSponsorshipCutRedirect() external onlyOwner {
        delete pendingSponsorshipCutRedirect;
        emit PendingSponsorshipCutRedirectCancelled();
    }

    // ==================== EIP-712 HELPERS (Phase 2 / contractaudits5) ====================
    // Modeled verbatim on BattleTreasury.resolveWinner EIP-712 construction (ec52d84a precedent):
    // - _domainSeparatorV4 with contract-specific name
    // - _hashTypedDataV4 (digest = \x19\x01 || domain || structHash)
    // - recover + exact signer check
    // - No personal_sign / toEthSignedMessageHash path (same as Battle post-remediation)
    // Deadline check inside the verify helper (reverts with dedicated error).

    function _domainSeparatorV4() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("SponsorshipPayments")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function _hashTypedDataV4(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash)
        );
    }

    /**
     * @dev Internal EIP-712 verification for payForSponsorship authorization.
     * Reverts with SponsorshipAuthorizationExpired or InvalidSponsorshipAuthorization on failure.
     * Only called when sponsorshipAuthorizer != address(0).
     */
    function _verifySponsorshipAuthorization(
        bytes32 sponsorshipId,
        address payer,
        address recipient,
        bytes32 poolId,
        uint256 amount,
        uint256 deadline,
        bytes calldata signature
    ) internal view {
        if (block.timestamp > deadline) {
            revert SponsorshipAuthorizationExpired();
        }

        bytes32 structHash = keccak256(
            abi.encode(
                SPONSORSHIP_AUTH_TYPEHASH,
                sponsorshipId,
                payer,
                recipient,
                poolId,
                amount,
                deadline
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);

        if (digest.recover(signature) != sponsorshipAuthorizer) {
            revert InvalidSponsorshipAuthorization();
        }
    }
}
