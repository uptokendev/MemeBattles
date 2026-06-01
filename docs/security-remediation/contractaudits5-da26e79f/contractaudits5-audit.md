Third Audit Result
The latest contracts are materially improved. The previous critical battle seasonal-fee bug is fixed: BattleTreasury.claim() now calls payable receiveBattleCut(bytes32,bytes32), and MajorLeagueTreasury.receiveBattleCut() credits either the target pool or unallocatedBalance.

I did not run a full compiler build because this workspace still has no local Solidity project/compiler available, but the OpenZeppelin import style now looks consistent with OZ v5: @openzeppelin/contracts/utils/ReentrancyGuard.sol plus Ownable(msg.sender).

Current Findings

Distributor daily limits can still be changed immediately
Severity: High
Affected: MajorLeagueTreasury.setDistributorDailyLimit

Most privileged controls are now timelocked, but setDistributorDailyLimit(address,uint256) remains an immediate onlyOwner setter.

This undercuts the distributor blast-radius controls. A distributor can only be added through the timelocked proposeDistributorChange, but after that distributor exists, the owner can immediately raise their daily limit or set it to 0, which disables the daily cap entirely. Since allocation is the function that moves pool balances into claimable rewards, this is still a powerful control.

Evidence:
MajorLeagueTreasury lines 147-178 timelock distributor role and initial limits, but lines 211-213 allow immediate daily-limit changes.

Exploit/failure scenario:
A distributor is added with conservative limits. Later, a compromised owner key immediately sets distributorDailyLimit[distributor] = 0. The distributor can then allocate up to its per-tx cap repeatedly until prize pools are exhausted.

Recommended remediation:
Remove setDistributorDailyLimit, or replace it with a timelocked proposeDistributorLimits(distributor,dailyLimit,maxPerTx) flow that updates both daily and per-tx limits atomically.

Sponsorship ID uniqueness enables frontrun/DoS of predictable sponsorships
Severity: Medium / High depending business flow
Affected: SponsorshipPayments.payForSponsorship

sponsorshipId is now globally unique. That fixes duplicate accounting, but it introduces a new griefing vector if sponsorship IDs are predictable or assigned off-chain before payment.

Any caller can pay first with a known sponsorshipId, any valid recipient, and the minimum amount. The contract marks sponsorshipPaid[sponsorshipId] = true, blocking the intended sponsor forever.

Evidence:
SponsorshipPayments lines 220-222 enforce first-payment-wins before the payment split.

Exploit/failure scenario:
The frontend or backend exposes a sponsorship ID for a campaign. An attacker sees it, pays 1 wei or the minimum amount using that ID and their own recipient. The legitimate sponsor’s later transaction reverts with SponsorshipAlreadyPaid.

Recommended remediation:
Bind sponsorship payment terms with an authorization signature, or make the uniqueness key include the expected payer/recipient/amount/campaign:

keccak256(abi.encode(sponsorshipId, payer, recipient, poolId, amount))

Better: require an EIP-712 backend signature over sponsorshipId, payer, recipient, poolId, amount, deadline, and chainId.

Failed league-cut retries lose pool attribution
Severity: Medium
Affected: BattleTreasury.retryPendingFee, SponsorshipPayments.retryPendingFee, MajorLeagueTreasury.receive

If a league-cut transfer to MajorLeagueTreasury fails, the source contract credits pendingFeeWithdrawals[seasonalTreasuryReceiver]. Retrying later sends plain ETH with empty calldata. MajorLeagueTreasury.receive() accepts that as unallocatedBalance.

This avoids permanent loss, but it loses the original battleId, sponsorshipId, and poolId. A failed battle cut intended for a specific seasonal pool becomes generic unallocated revenue after retry.

Evidence:
BattleTreasury.claim() sends metadata to receiveBattleCut, but retryPendingFee(receiver) later uses plain receiver.call{value: amount}("").
SponsorshipPayments.payForSponsorship() sends metadata to receiveSponsorshipCut, but its retry path also sends plain ETH.

Recommended remediation:
Track failed fee metadata for structured receivers, or add specialized retry paths:

retryBattleCut(bytes32 battleId, bytes32 poolId)
retrySponsorshipCut(bytes32 sponsorshipId, bytes32 poolId)

At minimum, document that failed league cuts become unallocated and require manual allocation.

One-sided battle refund does not set settled = true
Severity: Low
Affected: BattleTreasury.refund

In the incomplete-deposit refund path, the contract zeros deposits and sets state = Settled, but does not set battle.settled = true.

This does not appear exploitable because all important paths check state first, but it leaves inconsistent state and can confuse indexers or downstream tooling.

Evidence:
BattleTreasury lines 629-631 zero deposits and set state, but do not set settled.

Recommended remediation:
Set battle.settled = true in the one-sided refund path as well.

Resolved battle funds can remain stuck if winner cannot receive ETH
Severity: Medium
Affected: BattleTreasury.claim

claim() requires the winner payout transfer to succeed. If the winner is a contract that rejects ETH, the claim reverts forever. That can lock not only the winner’s upside, but also the loser’s stake and the fee receivers’ cuts.

Evidence:
BattleTreasury lines 565-567 pay the winner directly and revert on failure.

Recommended remediation:
Use a pull-payment balance for winner payouts as well, or allow the winner to specify a payout address in the signed resolution. If using a payout address, include it in the EIP-712 signed payload.

Cut-source addresses are unset at deployment
Severity: Low / Operational
Affected: MajorLeagueTreasury.receiveBattleCut, receiveSponsorshipCut

The restricted cut receivers are good security hardening, but battleTreasurySource and sponsorshipPaymentsSource start unset and can only be set after the timelock. Until they are configured, league cuts from the other contracts will fail and become pending fees in the source contracts.

Recommended remediation:
Allow constructor initialization of trusted source contracts, or deploy in a controlled sequence and wait for source timelocks before routing real payments.

Previously Flagged Items Rechecked

Fixed:

BattleTreasury now uses receiveBattleCut instead of sending value to a non-payable function.
Failed fees are now tracked via pendingFeeWithdrawals.
Sponsorship receiver changes are timelocked; setReceivers is removed.
Battle authorized creators are timelocked.
Resolved battles are no longer generically refundable after the resolution deadline.
resolveWinner now checks resolutionDeadline.
The EIP-712 payload now includes full battle context.
Sponsorship poolId is now caller-supplied.
Distributor proposal now stores the intended allow/remove action and limits.
Public pool mutation rejects bytes32(0) where appropriate.
Active battle timeout refunds are pull-based, preventing one participant’s reverting receiver from blocking the other.

Remaining centralization/trust assumptions:

Owner can still pause core actions immediately.
Owner can redirect failed fee balances after timelock.
Owner can allocate unallocated treasury revenue into any valid pool.
Resolver remains trusted to decide winners correctly.
Distributors remain trusted within their configured limits.

Overall Risk
This version is much closer to deployable than the prior two. I would not call it clean yet because the immediate setDistributorDailyLimit still weakens the main treasury control model, and sponsorship ID uniqueness can be abused unless IDs are private, unpredictable, or signature-authorized.

Priority fixes:

Timelock distributor limit changes and remove setDistributorDailyLimit.
Add signed sponsorship authorization or bind sponsorshipId to payer/recipient/amount.
Preserve pool attribution when retrying failed battle/sponsorship league cuts.
Set settled = true in the one-sided battle refund path.
Consider pull-based winner payouts or signed payout addresses.