Latest Audit Result
Scope reviewed: 01-SponsorshipPayments-5-.sol, 02-BattleTreasury-7-.sol, and 03-MajorLeagueTreasury-7-.sol.

The last meaningful accounting issue is fixed. Structured league-cut retries no longer decrement pendingFeeWithdrawals, and failed structured cuts are stored as per-ID structs with amount plus historical receiver. Pool IDs are also bound to stored values rather than caller input.

I did not find a new high-severity issue in this pass. I would still clean up a few edge cases before production, but the prior critical/high retry-drain path appears closed.

Previous Findings Rechecked

Fixed:

retryBattleCut no longer touches aggregate pendingFeeWithdrawals.
retrySponsorshipCut no longer touches aggregate pendingFeeWithdrawals.
Failed battle league cuts are stored only in pendingFailedBattleCut.
Failed sponsorship league cuts are stored only in pendingFailedSponsorshipCut.
Structured retries use the stored pool ID, not caller-supplied pool ID.
Structured retries use the historical receiver recorded at failure time.
Sponsorship signatures cannot be disabled once enforcement has been enabled.
Distributor limit execution still re-checks that the distributor is enabled.
Winner payout fallback now tries the original winner if the signed payout address rejects during pull.

Remaining Findings

Unsigned sponsorship mode still exists if deployed with zero authorizer
Severity: Low / Operational
Affected: SponsorshipPayments.constructor, payForSponsorship

The constructor allows _sponsorshipAuthorizer = address(0). In that mode, signaturesEnforced is false and payForSponsorship accepts unsigned payments. This preserves an unsafe transition mode where predictable sponsorshipIds can still be front-run.

Evidence:
SponsorshipPayments sets signaturesEnforced = (_sponsorshipAuthorizer != address(0)) in the constructor. payForSponsorship verifies only when sponsorshipAuthorizer != address(0).

Recommended remediation:
For production, deploy with a nonzero authorizer. If this contract is intended only for production, consider rejecting zero in the constructor and removing unsigned mode entirely.

Historical receiver retry can leave cuts stuck after receiver migration
Severity: Low
Affected: retryBattleCut, retrySponsorshipCut

Structured retries now use the historical receiver from failure time. This preserves accounting fidelity, but if that receiver was replaced because it is broken or misconfigured, the structured retry may fail forever. Generic fee redirects do not apply to these structured pending cuts.

Recommended remediation:
Add a timelocked structured-cut redirect path that can move a specific pending battle/sponsorship cut to a new receiver while preserving battleId / sponsorshipId and pool ID metadata.

League reward claim has no alternate payout address
Severity: Low
Affected: MajorLeagueTreasury.claimReward

claimReward sends ETH to msg.sender and reverts if the recipient cannot receive ETH. This does not drain funds, and the pending reward remains due to revert rollback, but a reward assigned to a non-receiving contract can be practically stuck.

Recommended remediation:
Add claimRewardTo(poolId, payoutAddress) restricted to the reward owner, or let distributors allocate to a known payout address instead of an arbitrary contract recipient.

Battle winner payout can still be stuck if both payout and winner reject ETH
Severity: Low
Affected: BattleTreasury.claimWinnerPayout

The fallback to the original winner is a good improvement. If both the signed payout address and the winner address reject ETH, the payout remains pending.

Recommended remediation:
Add a resolver-signed payout replacement flow for already-settled battles with pending winner payouts.

Overall Risk
This version is substantially stronger than the earlier iterations. I do not see a current critical/high blocker in the reviewed logic. The main production requirement is configuration discipline: deploy SponsorshipPayments with a nonzero authorizer, configure MajorLeagueTreasury sources correctly, and use multisig/timelock monitoring for owner actions.

The remaining items are mostly edge-case recovery paths and operational hardening, not core escrow-drain vulnerabilities.