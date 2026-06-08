Latest Audit Result
Scope reviewed: 01-BattleTreasury-6-.sol, 02-MajorLeagueTreasury-6-.sol, and 03-SponsorshipPayments-4-.sol.

The major issues from the last pass are mostly fixed. The old double-payment path via generic retry plus metadata retry is closed in the normal failure path because structured league cuts are no longer recorded in pendingFeeWithdrawals. Retry pool IDs are now bound to stored values, sponsorship authorizer can be set in the constructor, one-sided refunds set settled, and distributor limit updates re-check the distributor at execution.

I still would make a few changes before deployment.

Findings

Structured retry can erase unrelated aggregate pending fees
Severity: Medium
Affected: BattleTreasury.retryBattleCut, SponsorshipPayments.retrySponsorshipCut

The structured retry functions still contain legacy aggregate-cleanup logic:

BattleTreasury.retryBattleCut() decrements pendingFeeWithdrawals[seasonalTreasuryReceiver] if it is at least the structured cut amount.
SponsorshipPayments.retrySponsorshipCut() does the same.

But structured league cuts are now intentionally not recorded in pendingFeeWithdrawals. That means any aggregate balance under seasonalTreasuryReceiver would be unrelated, for example from a fee redirect, unusual receiver configuration, or protocolFeeReceiver == seasonalTreasuryReceiver.

Evidence:
BattleTreasury lines 1035-1038.
SponsorshipPayments lines 638-640.

Failure scenario:
pendingFeeWithdrawals[seasonalTreasuryReceiver] contains 1 BNB from an unrelated pending fee. A failed battle cut of 1 BNB is retried through retryBattleCut. The retry sends the structured cut to MajorLeagueTreasury, but also subtracts the unrelated aggregate pending fee. The aggregate fee receiver’s claim is silently erased.

Recommended remediation:
Remove the aggregate decrement entirely from both structured retry functions. Since structured cuts are no longer recorded in pendingFeeWithdrawals, there is nothing to keep consistent.

Winner payout can still be permanently stuck if the signed payout address always rejects ETH
Severity: Low / Medium
Affected: BattleTreasury.claim, claimWinnerPayout

The new pending winner payout flow is an improvement because a reverting payout address no longer blocks fee routing or settlement. However, claimWinnerPayout() retries the same signed payout address. If that address is a non-upgradeable contract that permanently rejects ETH, the winner amount remains stuck.

Evidence:
BattleTreasury.claim() credits pendingWinnerPayouts[battleId] on payout failure around lines 607-612.
claimWinnerPayout() sends only to battle.winnerPayoutAddress or battle.winner around lines 763-779.

Recommended remediation:
Add a signed payout-address replacement flow, or make the pending payout claimable by the winner to a caller-specified address if authorized by a fresh resolver signature.

Sponsorship authorization can still be disabled
Severity: Low / Operational
Affected: SponsorshipPayments.constructor, executeSponsorshipAuthorizer, payForSponsorship

The constructor now accepts _sponsorshipAuthorizer, which is good. But address(0) remains allowed and disables signature checks. That may be intentional for transition mode, but public deployments with address(0) still have the predictable sponsorshipId first-payment griefing risk.

Evidence:
Constructor allows _sponsorshipAuthorizer to be zero at lines 175-183.
payForSponsorship() only verifies signatures when sponsorshipAuthorizer != address(0) around lines 300-310.

Recommended remediation:
For production, deploy with a nonzero authorizer and avoid disabling it. If unsigned mode is only for testing, consider a separate test-only build or an irreversible signaturesRequired flag.

Pending structured cuts follow the current seasonal receiver, not the original receiver
Severity: Low
Affected: BattleTreasury.retryBattleCut, SponsorshipPayments.retrySponsorshipCut

If seasonalTreasuryReceiver changes after a structured league cut fails, retry sends the pending cut to the new receiver. This is timelocked, so it is mostly a governance/trust assumption, but it may surprise accounting if pending cuts were intended for the receiver configured at the time of payment.

Recommended remediation:
Store the receiver alongside the pending structured cut if historical receiver fidelity matters.

Previous Findings Rechecked

Fixed:

Structured league cuts are no longer recorded in generic pendingFeeWithdrawals during normal failure paths.
Retry pool IDs are bound to stored values: battle seasonalPoolId and sponsorship sponsorshipPoolId.
Sponsorship authorizer is now constructor-configurable.
Distributor limit execution re-checks the distributor is still enabled.
Winner payout failure no longer blocks the whole battle settlement.
One-sided refund consistency remains fixed.

Overall Risk
This version is substantially better and no longer has the obvious high-severity escrow-drain retry bug from the previous pass. The main thing I would fix before deployment is the leftover aggregate decrement in the structured retry functions. It is small code, but it touches money accounting and can silently erase unrelated pending fees.

I’d treat the remaining items as deployment hardening and accounting cleanup rather than architectural blockers, assuming you remove that aggregate decrement before going live.