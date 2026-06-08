Security Audit Re-run — Latest Upload

Scope reviewed:

BattleTreasury(3).sol
MajorLeagueTreasury(3).sol
SponsorshipPayments(1).sol
final-report(2).md

This upload finally contains the three relevant treasury/payment contracts. That fixes the earlier scope mismatch. I reviewed the actual source and compared it against the final report. The report claims the remediation is “READY TO CLOSE,” with all three phases 100% passed, clean compile, and E2E money-flow tests including BattleTreasury, MajorLeagueTreasury, and SponsorshipPayments.

My conclusion is more conservative:

Overall Verdict

Not ready for production deployment yet.

I do not see an obvious direct-theft bug or the earlier critical broken battle-fee routing issue. The system is much improved. But there are still several high/medium issues that can strand funds, weaken distributor controls, or create unreliable accounting.

I would block deployment until at least the first three findings below are fixed.

Confirmed Fixes / Improvements

These look correctly addressed in the latest source:

SponsorshipPayments.sol is now present.
SponsorshipPayments.payForSponsorship() uses the new receiveSponsorshipCut(bytes32,bytes32) flow.
SponsorshipPayments.setReceivers() appears removed; receiver changes are timelocked.
BattleTreasury.claim() now sends the seasonal cut to payable receiveBattleCut(bytes32,bytes32).
MajorLeagueTreasury.receiveBattleCut() is payable and credits either prizePools[poolId] or unallocatedBalance.
BattleTreasury.resolveWinner() uses EIP-712 style hashing without the previous extra personal-sign wrapper.
The EIP-712 struct now includes full battle context: battleId, participants, winner, stake amount, deadlines, and seasonalPoolId.
BattleTreasury.resolveWinner() rejects late resolutions after resolutionDeadline.
BattleTreasury.refund() no longer allows generic refund after a battle is already Resolved.
OpenZeppelin import paths are now v5-style: @openzeppelin/contracts/utils/ReentrancyGuard.sol.
Immediate fee receiver setters are removed from the three main contracts.
MajorLeagueTreasury.setDistributor() is removed and distributor role changes are timelocked.

Those are meaningful improvements.

High Findings
1. Failed fee recovery can still permanently strand funds for contract receivers

Severity: High
Affected: BattleTreasury, MajorLeagueTreasury, SponsorshipPayments

All three contracts use the same failed-fee pattern:

failed fee is credited to pendingFeeWithdrawals[receiver];
only receiver can later call claimPendingFees();
the claim sends ETH/BNB back to msg.sender using a raw call.

Examples:

BattleTreasury.claim() credits failed protocol/seasonal fees at lines 435–449.
BattleTreasury.claimPendingFees() only lets msg.sender claim its own pending amount at lines 619–626.
MajorLeagueTreasury.claimReward() credits failed reward fees at lines 266–279.
MajorLeagueTreasury.claimPendingFees() has the same receiver-only claim pattern at lines 322–329.
SponsorshipPayments.payForSponsorship() credits failed protocol/league fees at lines 171–187.
SponsorshipPayments.claimPendingFees() has the same receiver-only claim pattern at lines 264–271.

This is fine for EOAs. It is fragile for contract receivers.

If protocolFeeReceiver is a vault contract that rejects plain native-token transfers, the fee transfer fails. The amount is credited to pendingFeeWithdrawals[vault]. But then the vault itself must call claimPendingFees(), and the treasury will again send native token to the vault using empty calldata. If that receive path still rejects, recovery fails forever.

The same problem can hit seasonalTreasuryReceiver if it is later changed to a contract without a compatible receive/fallback path.

Impact

User payouts are protected, which is good. But protocol/league fees can become permanently stuck inside the sending contract.

Recommended fix

Add a retry function callable by anyone, but always paying the recorded receiver:

function retryPendingFee(address receiver) external nonReentrant {
    uint256 amount = pendingFeeWithdrawals[receiver];
    require(amount > 0, "Nothing to retry");

    pendingFeeWithdrawals[receiver] = 0;

    (bool success, ) = receiver.call{value: amount}("");
    if (!success) {
        pendingFeeWithdrawals[receiver] = amount;
        revert("Fee retry failed");
    }
}

That still does not solve a permanently non-payable receiver. For that, add a timelocked recovery route for fee funds only:

function redirectStuckFee(
    address oldReceiver,
    address newReceiver,
    uint256 amount
) external onlyOwner /* timelocked */ nonReentrant {
    require(newReceiver != address(0), "bad receiver");
    require(amount <= pendingFeeWithdrawals[oldReceiver], "too much");

    pendingFeeWithdrawals[oldReceiver] -= amount;
    pendingFeeWithdrawals[newReceiver] += amount;
}

Because these are protocol/league fees, not user escrow principal, a timelocked fee-only rescue path is reasonable.

2. Active battle timeout refunds are push-based and can be blocked by one participant

Severity: High
Affected: BattleTreasury.refund()

For unresolved active battles after resolutionDeadline, the contract refunds both participants in one transaction:

if (battle.creatorDeposit > 0) {
    (bool c, ) = battle.creator.call{value: battle.creatorDeposit}("");
    require(c, "Creator refund failed");
}
if (battle.challengerDeposit > 0) {
    (bool ch, ) = battle.challenger.call{value: battle.challengerDeposit}("");
    require(ch, "Challenger refund failed");
}

This is lines 503–509.

If either participant is a contract that rejects native-token transfers, the whole refund reverts. That blocks the other participant too.

Exploit scenario

Creator is an EOA.
Challenger is a contract with a reverting receive().
Both deposit.
Resolver never resolves the battle.
After resolutionDeadline, anyone calls refund().
Creator refund would succeed, but challenger refund fails.
Entire transaction reverts.
Creator remains locked because challenger’s contract blocks the batch refund.

Recommended fix

Use pull-based refunds for active-battle timeout refunds:

mapping(address => uint256) public pendingRefunds;

function refund(bytes32 battleId) external nonReentrant {
    Battle storage battle = battles[battleId];

    require(
        battle.state == BattleState.Active &&
        block.timestamp > battle.resolutionDeadline &&
        !battle.settled,
        "Not refundable"
    );

    uint256 creatorAmount = battle.creatorDeposit;
    uint256 challengerAmount = battle.challengerDeposit;

    battle.creatorDeposit = 0;
    battle.challengerDeposit = 0;
    battle.settled = true;
    battle.state = BattleState.Settled;

    pendingRefunds[battle.creator] += creatorAmount;
    pendingRefunds[battle.challenger] += challengerAmount;
}

function claimRefund() external nonReentrant {
    uint256 amount = pendingRefunds[msg.sender];
    require(amount > 0, "No refund");

    pendingRefunds[msg.sender] = 0;

    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Refund failed");
}

The one-sided incomplete-deposit refund is less dangerous because only the depositor’s own receiver behavior can block them. But the active-battle two-party refund should definitely be pull-based.

3. Distributor safety limits are still weak: default unlimited and immediate owner-controlled

Severity: High / Medium
Affected: MajorLeagueTreasury

allocateReward() checks limits only if the values are nonzero:

if (maxAllocationPerTx > 0 && amount > maxAllocationPerTx) revert InvalidAmount();
...
if (dailyLimit > 0 && distributorDailySpent[msg.sender] + amount > dailyLimit) {
    revert InvalidAmount();
}

This is lines 220–234.

That means:

maxAllocationPerTx == 0 means unlimited;
distributorDailyLimit[distributor] == 0 means unlimited;
a newly approved distributor appears to have no effective cap unless the owner separately sets one.

Also, both limit setters are immediate owner actions:

setMaxAllocationPerTx(uint256 newMax)
setDistributorDailyLimit(address distributor, uint256 dailyLimit)

These are lines 103–105 and 134–136.

So the distributor role itself is timelocked, but the actual damage limiter is not.

Impact

If a distributor key is compromised and has no daily limit, it can allocate the full prize pool to an attacker-controlled recipient. The recipient can then claim.

If the owner key is compromised, the attacker can immediately set limits to unlimited, even though distributor role changes are timelocked.

Recommended fix

Bind distributor limits into the timelocked distributor proposal:

struct PendingDistributorChange {
    address distributor;
    bool allowed;
    uint256 dailyLimit;
    uint256 maxPerTx;
    uint256 executeAfter;
    bool exists;
}

Require nonzero limits when enabling a distributor:

if (allowed) {
    require(dailyLimit > 0, "daily limit required");
    require(maxPerTx > 0, "tx limit required");
}

Also make global allocation-limit changes timelocked, or remove global mutable limit and store per-distributor limits only.

Medium Findings
4. MajorLeagueTreasury.receiveBattleCut() and receiveSponsorshipCut() are permissionless

Severity: Medium
Affected: MajorLeagueTreasury

Anyone can call:

receiveSponsorshipCut(bytes32 sponsorshipId, bytes32 poolId)
receiveBattleCut(bytes32 battleId, bytes32 poolId)

This does not let an attacker steal funds. They must send real native token.

But it lets anyone emit official-looking battle/sponsorship revenue events with arbitrary IDs. This can pollute dashboards, revenue analytics, sponsor accounting, or leaderboard systems if indexers treat these events as canonical.

BattleCutReceived also does not include msg.sender, while SponsorshipCutReceived does.

Recommended fix

Restrict known source contracts:

address public battleTreasury;
address public sponsorshipPayments;

modifier onlyBattleTreasury() {
    require(msg.sender == battleTreasury, "not battle treasury");
    _;
}

modifier onlySponsorshipPayments() {
    require(msg.sender == sponsorshipPayments, "not sponsorship payments");
    _;
}

Then add timelocked setters for those source addresses.

If you intentionally want permissionless donations, rename/document the functions as donation-compatible and make indexers validate msg.sender.

5. bytes32(0) is both a sentinel and a valid prize pool ID

Severity: Medium
Affected: MajorLeagueTreasury

The inbound functions use bytes32(0) to mean “unallocated”:

if (poolId == bytes32(0)) {
    unallocatedBalance += msg.value;
}

But the same zero pool ID can also be used in:

fundPrizePool(bytes32 poolId)
allocateUnallocatedToPool(bytes32 poolId, uint256 amount)
allocateReward(bytes32 poolId, address recipient, uint256 amount)

That means bytes32(0) can simultaneously mean:

unallocated revenue sentinel; and
a real prize pool key in prizePools.

Impact

This can confuse accounting, indexers, dashboards, and operational scripts. It also makes it easier to misallocate funds to the zero pool.

Recommended fix

Reserve zero as invalid for real pools:

error InvalidPoolId();

modifier validPool(bytes32 poolId) {
    if (poolId == bytes32(0)) revert InvalidPoolId();
    _;
}

Apply it to:

fundPrizePool
allocateUnallocatedToPool
allocateReward

Keep bytes32(0) only as the inbound “unallocated” sentinel.

6. Battle deposit windows have a minimum but no maximum

Severity: Medium
Affected: BattleTreasury.createBattle()

The contract enforces:

if (depositWindowSeconds < 1 hours) revert InvalidAmount();

But there is no maximum.

An authorized creator can create a battle with a huge deposit window. If one participant deposits and the other does not, that participant cannot refund until the deposit deadline. A mistaken or compromised authorized creator can therefore create long user fund locks.

Recommended fix

Add a max:

uint256 public constant MAX_DEPOSIT_WINDOW = 7 days;

if (depositWindowSeconds > MAX_DEPOSIT_WINDOW) revert InvalidAmount();

For a fast battle product, 24–72 hours may be more appropriate.

7. Storage accounting is not cleared after claim or active timeout refund

Severity: Medium / Low
Affected: BattleTreasury

After claim(), the contract marks the battle settled but does not zero:

battle.creatorDeposit
battle.challengerDeposit

Same for the active timeout refund path.

This does not allow double claim/refund because state and settled block repeat exits. But view helpers like getPotBalance() and getCurrentPot() will continue showing the old pot after funds have already left.

Impact

Frontend may display stale pot balances.
Off-chain accounting may think settled battles still have escrowed value.
Invariant checks like “sum of deposits equals contract balance” will fail after settlement.

Recommended fix

After calculating payout amounts, zero deposits before external calls:

uint256 creatorDeposit = battle.creatorDeposit;
uint256 challengerDeposit = battle.challengerDeposit;

battle.creatorDeposit = 0;
battle.challengerDeposit = 0;

For claim(), use local totalPot and then clear both deposit fields.

8. Sponsorship IDs are cumulative, not unique, despite the comment

Severity: Medium / Low
Affected: SponsorshipPayments

The contract says:

// Track cumulative amount paid per sponsorshipId (prevents naive double-payment on same ID)

But the implementation does not prevent double payment:

totalPaidPerSponsorship[sponsorshipId] += amount;

This only tracks cumulative payment. It does not enforce uniqueness.

This may be fine if a sponsorship ID can receive multiple installments. But if off-chain logic treats sponsorshipId as a unique invoice/order ID, double payment is possible.

Recommended fix

Pick one explicit model.

For unique sponsorships:

mapping(bytes32 => bool) public sponsorshipPaid;

require(!sponsorshipPaid[sponsorshipId], "already paid");
sponsorshipPaid[sponsorshipId] = true;

For cumulative sponsorships, rename/comment accordingly and emit cumulative amount:

event SponsorshipPaid(
    bytes32 indexed sponsorshipId,
    address indexed payer,
    address indexed recipient,
    bytes32 poolId,
    uint256 amount,
    uint256 cumulativePaid
);
Low / Operational Findings
9. Important events are missing fields

Severity: Low
Affected: all three contracts

Examples:

BattleCreated does not emit:

stakeAmount
seasonalPoolId
resolutionDeadline

SponsorshipPaid does not emit:

msg.sender / payer
poolId
cumulative amount

BattleCutReceived does not emit:

sender/source contract

SponsorshipCutReceived emits sender but not poolId.

Impact

This does not directly break contract safety, but it weakens monitoring, analytics, and incident response.

Recommended fix

Expand events now, before deployment, because event schema changes are painful after launch.

10. Critical timelock proposal/execution events are incomplete

Severity: Low / Medium
Affected: all three contracts

The contracts added cancellation events, but proposal and execution paths often do not emit dedicated events.

For operational monitoring, every timelocked change should emit:

proposed value;
proposer;
execute-after timestamp;
executed value;
cancelled value.

Recommended fix

Add events like:

event ProtocolFeeReceiverProposed(address indexed newReceiver, uint256 executeAfter);
event ProtocolFeeReceiverExecuted(address indexed newReceiver);
event ResolverProposed(address indexed newResolver, uint256 executeAfter);
event ResolverExecuted(address indexed newResolver);
event DistributorChangeProposed(address indexed distributor, bool allowed, uint256 executeAfter);
event DistributorChangeExecuted(address indexed distributor, bool allowed);
11. Immediate owner controls remain part of the trust model

Severity: Low / Medium
Affected: all three contracts

Some immediate controls remain:

BattleTreasury.setAuthorizedCreator()
BattleTreasury.setPaused()
MajorLeagueTreasury.setPaused()
MajorLeagueTreasury.setMaxAllocationPerTx()
MajorLeagueTreasury.setDistributorDailyLimit()
SponsorshipPayments.setPaused()
SponsorshipPayments.setMinimumSponsorshipAmount()

Pausing is usually fine as an immediate emergency action. But allocation limit changes are more sensitive.

Recommendation

At minimum, document this explicitly in the trust model. For production, use multisig ownership. For distributor limits, I recommend timelocking.

Rechecked Earlier Critical Issues
Battle seasonal fee routing

Status: Fixed.

BattleTreasury.claim() calls:

receiveBattleCut(bytes32,bytes32)

with value, and MajorLeagueTreasury.receiveBattleCut() is payable. This addresses the earlier critical stuck seasonal fee path.

Sponsorship league cut routing

Status: Mostly fixed.

SponsorshipPayments.payForSponsorship() now calls:

receiveSponsorshipCut(bytes32,bytes32)

with value and passes poolId.

The remaining issue is only the failed-fee recovery model if that call fails.

EIP-712 digest

Status: Fixed based on source review.

The digest uses:

keccak256(abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash))

and does not add the incorrect toEthSignedMessageHash wrapper.

Resolved battle refund griefing

Status: Fixed.

refund() no longer allows generic refund of already-resolved battles.

Late resolution

Status: Fixed.

resolveWinner() rejects if block.timestamp > battle.resolutionDeadline.

Deployment Gate Checklist

Before deployment, I would require:

Add retryPendingFee(address receiver) or a timelocked fee-redirection recovery path to all three contracts.
Convert unresolved active-battle refunds to pull-based refunds.
Make distributor daily/tx limits nonzero by default and timelocked.
Reserve bytes32(0) as invalid for actual prize pools.
Add a maximum battle deposit window.
Restrict receiveBattleCut() and receiveSponsorshipCut() to known source contracts, or explicitly treat them as permissionless donations.
Clear battle deposit storage after claim/refund.
Expand events for battle creation, sponsorship payment, battle cuts, sponsorship cuts, and timelock proposal/execution.
Run full Hardhat/Foundry tests covering:
reverting fee receivers;
contract fee receivers;
active battle timeout refund where one participant rejects ETH;
distributor daily limit enforcement;
bytes32(0) pool rejection;
EIP-712 valid/invalid signatures;
direct ETH behavior.
Bottom line

This version is close, but I would not mark it production-ready yet. The remaining issues are less catastrophic than the earlier ones, but the failed-fee recovery pattern and active-battle refund griefing can still strand funds in realistic edge cases.