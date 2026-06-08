Findings

Failed league cuts can be paid twice through generic retry plus metadata retry
Severity: High
Affected: BattleTreasury.retryPendingFee, BattleTreasury.retryBattleCut, SponsorshipPayments.retryPendingFee, SponsorshipPayments.retrySponsorshipCut

The new retry design records failed league cuts in two places:

aggregate: pendingFeeWithdrawals[seasonalTreasuryReceiver]
per-ID: pendingFailedBattleCut[battleId] or pendingFailedSponsorshipCut[sponsorshipId]

The generic retry/claim path clears only the aggregate pending amount. The metadata retry path clears only the per-ID amount.

That means the same failed league cut can be paid once through retryPendingFee(seasonalTreasuryReceiver) or claimPendingFees(), then paid again through retryBattleCut(...) or retrySponsorshipCut(...) if the contract has enough unrelated ETH.

Evidence:
BattleTreasury.claim() credits both mappings at lines 608-615.
BattleTreasury.retryPendingFee() clears only pendingFeeWithdrawals[receiver] at lines 891-902.
BattleTreasury.retryBattleCut() clears only pendingFailedBattleCut[battleId] and does not require the aggregate amount to still exist at lines 973-991.

The same pattern exists in SponsorshipPayments.payForSponsorship() lines 337-345, retryPendingFee() lines 529-540, and retrySponsorshipCut() lines 610-628.

Exploit/failure scenario:
A battle seasonal fee of 1 BNB fails. The contract records 1 BNB in both pendingFeeWithdrawals[MajorLeagueTreasury] and pendingFailedBattleCut[battleId].

Someone calls retryPendingFee(MajorLeagueTreasury), sending 1 BNB as plain ETH. The aggregate pending fee is now zero, but pendingFailedBattleCut[battleId] is still 1 BNB.

Later, anyone calls retryBattleCut(battleId, poolId). If BattleTreasury holds unrelated active battle deposits, it sends another 1 BNB to MajorLeagueTreasury, draining funds that belong to other battles.

This is especially dangerous in BattleTreasury, which can hold active user escrow balances.

Recommended remediation:
Use one canonical pending-fee record for structured league cuts. Do not let aggregate and per-ID records be independently consumable.

Minimum fix:

require(pendingFeeWithdrawals[seasonalTreasuryReceiver] >= amount, "Aggregate missing");
pendingFeeWithdrawals[seasonalTreasuryReceiver] -= amount;

But the better fix is to avoid recording seasonal league cuts in the generic aggregate mapping at all. Store them only in a structured pending record:

struct PendingBattleCut {
    uint256 amount;
    bytes32 poolId;
}
mapping(bytes32 => PendingBattleCut) public pendingBattleCuts;

Then retryPendingFee() should not process seasonalTreasuryReceiver league cuts that have metadata-specific retry paths.

Metadata retry lets any caller choose the pool ID
Severity: High / Medium
Affected: BattleTreasury.retryBattleCut, SponsorshipPayments.retrySponsorshipCut

The new metadata retry functions accept poolId as a caller-supplied argument. They do not verify it against the original battle’s seasonalPoolId or the original sponsorship’s poolId.

Evidence:
BattleTreasury.retryBattleCut(bytes32 battleId, bytes32 poolId) lines 973-986 passes caller-supplied poolId to receiveBattleCut.
SponsorshipPayments.retrySponsorshipCut(bytes32 sponsorshipId, bytes32 poolId) lines 610-623 does the same for sponsorships.

For battles, the correct pool ID already exists in battles[battleId].seasonalPoolId, so accepting a free-form pool ID is unnecessary.

For sponsorships, the contract currently does not store the original pool ID, so it cannot validate retries.

Exploit/failure scenario:
A league cut intended for poolA fails. Anyone calls the retry function with poolB. The funds are credited to the wrong prize pool. If a distributor or off-chain process treats pools as separate accounting domains, this can misallocate league funds.

Recommended remediation:
For battles, remove the poolId parameter and use:

bytes32 poolId = battles[battleId].seasonalPoolId;

For sponsorships, store the original pool ID at payment time:

mapping(bytes32 => bytes32) public sponsorshipPoolId;

Then retry with the stored value only.

Sponsorship authorization is optional and defaults off
Severity: Medium
Affected: SponsorshipPayments.payForSponsorship, constructor, sponsorshipAuthorizer

The EIP-712 authorization design is good, but it is only enforced when sponsorshipAuthorizer != address(0). The constructor does not set an authorizer. That means newly deployed contracts accept unsigned sponsorships until the owner goes through the timelocked authorizer setup.

Evidence:
SponsorshipPayments.payForSponsorship() only verifies signatures inside if (sponsorshipAuthorizer != address(0)) at lines 292-302.
The constructor at lines 171-176 does not accept or set an authorizer.

This leaves the earlier predictable-ID griefing issue open during deployment, migration, or any period where the authorizer is intentionally or accidentally disabled.

Recommended remediation:
Add an authorizer constructor parameter and require signatures by default. If unsigned mode is truly needed, make it an explicit deployment mode with a separate constructor flag and document it as unsafe for public use.

Generic retry still degrades league-cut attribution
Severity: Medium
Affected: BattleTreasury.retryPendingFee, SponsorshipPayments.retryPendingFee

Even if the double-payment bug is fixed, the generic retry path still sends bare ETH to MajorLeagueTreasury. That lands in receive() as unallocatedBalance, losing battleId, sponsorshipId, and poolId.

The comments warn users to prefer the metadata retry, but the unsafe path remains callable by anyone.

Recommended remediation:
For receiver == seasonalTreasuryReceiver, either revert in retryPendingFee() when structured pending cuts exist, or remove seasonal league cuts from the generic pending-fee system entirely.

Resolved battle can still lock funds if signed payout address rejects ETH
Severity: Low / Medium
Affected: BattleTreasury.claim

The winner payout address is now signed, which is a real improvement. However, claim() still pushes ETH and reverts if the payout address rejects ETH.

Evidence:
BattleTreasury.claim() lines 590-593.

This is now mostly a resolver/payout-configuration risk rather than an attacker-controlled issue, because the payout address is included in the EIP-712 payload. Still, a bad signature can leave a resolved battle unclaimable.

Recommended remediation:
Use a pull-payment winner balance, or allow the resolver to sign a replacement payout address with an explicit updatePayoutAddress flow before claim.

Distributor limit update execution does not re-check distributor is still enabled
Severity: Low
Affected: MajorLeagueTreasury.executeDistributorLimitUpdate

proposeDistributorLimitUpdate() checks that the distributor is currently enabled, but executeDistributorLimitUpdate() does not re-check after the timelock delay.

Evidence:
Proposal checks if (!distributors[distributor]) revert at lines 244-246.
Execution updates limits at lines 258-271 without checking distributors[change.distributor].

Impact is limited because allocateReward() still checks distributors[msg.sender]. This can leave stale limits on a removed distributor, which may matter if the distributor is later re-enabled.

Recommended remediation:
Add the same enabled-distributor check in execution, or clear limits when disabling a distributor.

Previous Findings Rechecked

Fixed:

Immediate distributor daily-limit setter was removed.
Distributor limit updates are now timelocked and nonzero-validated.
One-sided battle refunds now set settled = true.
Winner payout address is included in the signed battle resolution.
Battle seasonal-fee retry and sponsorship league-cut retry now attempt metadata delivery.
MajorLeagueTreasury constructor can set source contracts immediately.
Sponsorship payments now support EIP-712 authorization over payer, recipient, pool, amount, and deadline.

Still not fully fixed:

Sponsorship authorization is not mandatory by default.
League-cut retry metadata is not bound to stored original pool IDs.
Generic and metadata retry paths can independently consume the same failed league cut.

Overall Risk
This version is close, but I would not deploy it as-is because the retry accounting can double-pay failed league cuts and drain unrelated balances, especially from BattleTreasury escrow funds.

Priority fixes:

Replace the dual aggregate/per-ID retry model with one canonical structured pending-cut record.
Bind retry pool IDs to stored original pool IDs.
Disable generic retryPendingFee() for structured league cuts.
Make sponsorship authorization active from deployment, or clearly prevent public use until configured.
Add execution-time validation for distributor limit updates.