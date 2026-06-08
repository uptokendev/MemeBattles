Audit Result
I reviewed the three uploaded contracts as scoped: 01-BattleTreasury.sol, 02-MajorLeagueTreasury.sol, and 03-SponsorshipPayments.sol. The current state is not production-safe. There are build blockers, a critical accounting flaw that can permanently trap league revenue, and several places where the advertised timelock/security model is bypassed by immediate owner setters.
I could not run a full Solidity build because the workspace has no Solidity compiler/project setup and fetching solcjs was blocked, but several compile failures are visible directly from the source.
Findings
1. Contracts likely do not compile
Severity: High
Affected: BattleTreasury, MajorLeagueTreasury 
BattleTreasury.Battle does not define settled, but the code reads and writes battle.settled in claim, getBattleParticipantInfo, and isClaimable around lines 360, 370, 471, and 492.
MajorLeagueTreasury reverts with InvalidAmount() around lines 171 and 181, but that error is never declared.
There is also an OpenZeppelin version mismatch. The code uses Ownable(msg.sender), which matches newer OpenZeppelin versions, but imports @openzeppelin/contracts/security/ReentrancyGuard.sol, which is the older path. In OpenZeppelin v5, ReentrancyGuard moved to utils, and ECDSA.toEthSignedMessageHash() is no longer used directly the same way.
Recommended remediation:
Add bool settled; to Battle, declare error InvalidAmount(); in MajorLeagueTreasury, and pin a specific OpenZeppelin version. If using OZ v5, update imports and signature hashing to MessageHashUtils.
2. Major League revenue is received but not allocatable, causing permanent fund lock
Severity: Critical
Affected: BattleTreasury.claim, SponsorshipPayments.payForSponsorship, MajorLeagueTreasury.receiveSponsorshipCut, MajorLeagueTreasury.receive 
This is the biggest architectural issue.
BattleTreasury.claim sends the seasonal fee with empty calldata to seasonalTreasuryReceiver around line 381. If that receiver is MajorLeagueTreasury, the payment lands in receive() at line 324, but receive() does not credit any prizePools.
SponsorshipPayments.payForSponsorship calls receiveSponsorshipCut(bytes32) around lines 160-162. That function in MajorLeagueTreasury only emits an event around lines 156-160 and does not increase any prize pool.
The only function that increases prizePools[poolId] is fundPrizePool around lines 146-149, and it requires new msg.value. There is no function to move already-held ETH into a prize pool. Therefore, battle seasonal fees and sponsorship league cuts can accumulate inside MajorLeagueTreasury while being impossible to distribute.
Exploit/failure scenario:
Users pay battles and sponsorships. The league cut is sent to MajorLeagueTreasury. Distributors later try to allocate prizes, but allocateReward checks prizePools[poolId] < amount around line 185. Since the received revenue never increased prizePools, allocation fails. The ETH remains trapped.
Recommended remediation:
Make every inbound revenue path credit an explicit pool, or add an owner/distributor-controlled accounting function that moves unallocated balance into a pool. For example:
receiveSponsorshipCut(bytes32 sponsorshipId, bytes32 poolId) and increment prizePools[poolId] 
receiveBattleCut(bytes32 battleId, bytes32 poolId) and increment prizePools[poolId] 
reject plain receive() unless intentional 
track unallocatedBalance and allow authorized allocation from it 
3. Battle deposits do not enforce the agreed stake amount
Severity: High
Affected: BattleTreasury.createBattle, BattleTreasury.deposit 
The comments say both players must deposit the agreed amount, but no agreed amount is stored on-chain. createBattle stores participants and deadline only. deposit accepts any msg.value, including zero, and marks the sender as deposited around lines 282-306.
Exploit/failure scenario:
A creator expects a 1 BNB battle. The challenger deposits 1 wei. The creator deposits 1 BNB. The battle becomes Active. If the challenger wins, they receive almost the entire creator-funded pot despite never matching the stake. Even if the creator wins, the creator pays protocol/seasonal fees on a pot that was not symmetrically funded.
This is not safely solved by frontend or backend enforcement. The smart contract is the escrow and must enforce escrow terms.
Recommended remediation:
Store stakeAmount in the Battle struct and require msg.value == battle.stakeAmount. Also require stakeAmount > 0 and creator != challenger during battle creation.
4. Timelocks are bypassed by immediate owner setters
Severity: High
Affected: all three contracts 
The contracts define timelocked admin changes, but also expose immediate setters:
BattleTreasury.setProtocolFeeReceiver, setSeasonalTreasuryReceiver, setResolver, setProtocolFeeBps, setSeasonalFeeBps 
MajorLeagueTreasury.setDistributor, setFeeReceivers, setFees 
SponsorshipPayments.setReceivers 
This makes the timelock largely cosmetic. An owner or compromised owner key can immediately redirect fee receivers, change the resolver, add distributors, or alter fee policy.
Exploit/failure scenario:
A compromised owner immediately changes resolver in BattleTreasury, signs outcomes favoring chosen participants, changes fee receivers, or redirects future sponsorship revenue. Users watching pending timelock events would receive no warning because the immediate setter path avoids the delay.
Recommended remediation:
Remove immediate setters after deployment, or restrict them to constructor-time initialization only. All critical changes should go through the timelock path and emit clear proposal/execution/cancel events.
5. Active battles have no timeout or escape hatch
Severity: High
Affected: BattleTreasury 
Once both users deposit, the battle becomes Active. Refunds only work while the state is AwaitingDeposits around line 397. If the resolver disappears, refuses to sign, loses its key, signs the wrong format, or is rotated before resolution, the pot can remain locked forever.
Recommended remediation:
Add a resolution deadline. After that deadline, allow a defined fallback: mutual refund, admin-cancel through timelock, or a dispute process. The refund path must cover Active battles that were never resolved.
6. Winner signatures lack domain separation
Severity: Medium
Affected: BattleTreasury.resolveWinner 
The signed message is only keccak256(abi.encodePacked(battleId, winner)) around line 333. It does not include address(this), block.chainid, participants, stake amount, deadline, or contract version.
Exploit/failure scenario:
A resolver signature from one deployment, chain, fork, test environment, or reused battleId context can be valid somewhere else if the same resolver key is used. This gets worse if an authorized creator can influence battleId.
Recommended remediation:
Use EIP-712 typed data and include at least chainId, verifyingContract, battleId, creator, challenger, winner, stakeAmount, and a nonce or battle-specific salt.
7. Fee receivers can deny claims and sponsorship payments
Severity: Medium
Affected: BattleTreasury.claim, MajorLeagueTreasury.claimReward, SponsorshipPayments.payForSponsorship 
All three contracts push ETH to external addresses and revert if any receiver fails. For example, BattleTreasury.claim pays protocol and seasonal receivers before the winner around lines 373-387. If either fee receiver reverts, the winner cannot claim.
Similarly, SponsorshipPayments requires recipient, protocol receiver, and league receiver calls to all succeed.
Recommended remediation:
Use pull-based accounting for protocol and seasonal fees, or isolate receiver failure so winner payouts cannot be blocked by fee receiver behavior. At minimum, ensure fee receivers are simple, audited, non-reverting contracts.
8. Pause authority can freeze league rewards
Severity: Medium
Affected: MajorLeagueTreasury.claimReward 
claimReward is gated by whenNotPaused around line 198. This means the owner can pause and prevent users from claiming already-allocated rewards. That may be intended as emergency control, but it is a strong custody/trust assumption.
Recommended remediation:
Consider allowing claims while paused and only pausing new funding/allocation. If claims must be pausable, document this as an explicit centralization risk.
9. Direct ETH transfers create stuck accounting
Severity: Low / Medium
Affected: all contracts 
Each contract has a receive() function. In BattleTreasury and SponsorshipPayments, direct ETH is not attributed to a battle or sponsorship and has no withdrawal path. In MajorLeagueTreasury, direct ETH is not credited to any prize pool and cannot be distributed.
Recommended remediation:
Reject direct ETH unless required. If required, track it as unallocatedBalance and provide a controlled way to allocate or recover it.
10. Sponsorship IDs are not unique or enforced
Severity: Low
Affected: SponsorshipPayments.payForSponsorship 
sponsorshipId is only emitted. The same ID can be paid multiple times for different recipients or amounts. That may be fine if IDs are purely off-chain labels, but it is unsafe if downstream systems treat one event as one canonical sponsorship purchase.
Recommended remediation:
If uniqueness matters, store paidSponsorships[sponsorshipId] or track cumulative paid amount per ID and recipient.
Overall Risk Summary
The system is not ready for deployment. The critical issue is that MajorLeagueTreasury does not account for the revenue it receives from battle and sponsorship flows, which can permanently lock the league funds the system is designed to distribute. The next highest-priority issue is that BattleTreasury does not enforce equal or agreed deposits on-chain, making the escrow economically unsafe.
Highest-priority fixes:
1. Fix compilation and pin the OpenZeppelin version. 
2. Redesign MajorLeagueTreasury inbound accounting before any funds touch it. 
3. Add on-chain stake amount enforcement to battles. 
4. Remove immediate admin setters that bypass timelocks. 
5. Add active-battle timeout/refund/dispute handling. 
6. Replace ad hoc signatures with EIP-712 domain-separated signatures. 
The main trust assumptions are currently heavy: owner, resolver, authorized creators, distributors, protocol receiver, and seasonal receiver can all materially affect user outcomes or fund availability. Those roles need multisigs, timelocks, monitoring events, and tighter on-chain constraints before this should hold real funds.
