**Security Audit Pass 2**
Scope reviewed: `01-MajorLeagueTreasury.sol`, `02-SponsorshipPayments.sol`, and `03-BattleTreasury.sol`.

The revisions fixed several first-pass issues: `Battle.settled` now exists, stake amounts are enforced, signatures now use an EIP-712 style domain, direct ETH is mostly handled, league claims are no longer paused, and some immediate fee/resolver setters were removed.

That said, the revised system still has serious issues. The most important one is new: battle seasonal fees are currently sent to a non-payable function, so the Major League cut will fail and remain stuck in `BattleTreasury`.

**Findings**

1. **Battle seasonal fees are never transferred and become stuck**
   Severity: Critical
   Affected: `BattleTreasury.claim`, `MajorLeagueTreasury.allocateUnallocatedToPool`

In `BattleTreasury.claim`, the seasonal fee is sent with value to:

```solidity
allocateUnallocatedToPool(bytes32,uint256)
```

But `MajorLeagueTreasury.allocateUnallocatedToPool` is not payable. A low-level call with nonzero value to a non-payable function reverts. Because `BattleTreasury.claim` intentionally does not revert on fee-transfer failure, the winner still gets paid, the battle is marked settled, and the seasonal fee remains inside `BattleTreasury`.

There is no recovery function in `BattleTreasury`, and direct ETH is rejected. So every successful battle claim with a nonzero seasonal fee can strand the league cut permanently.

Evidence:
`03-BattleTreasury.sol` lines 405-411 calls `allocateUnallocatedToPool` with `value: seasonalFee`.
`01-MajorLeagueTreasury.sol` lines 174-182 defines `allocateUnallocatedToPool` as non-payable and only moves existing `unallocatedBalance`.

Recommended remediation:
Add a payable function to `MajorLeagueTreasury`, for example:

```solidity
function receiveBattleCut(bytes32 battleId, bytes32 poolId) external payable {
    require(msg.value > 0, "No value sent");
    if (poolId == bytes32(0)) {
        unallocatedBalance += msg.value;
    } else {
        prizePools[poolId] += msg.value;
        emit PrizeFunded(poolId, msg.value, msg.sender);
    }
}
```

Then call that from `BattleTreasury.claim`. Do not call `allocateUnallocatedToPool` with value.

2. **Failed non-blocking fee transfers create unaccounted stuck balances**
   Severity: High
   Affected: `BattleTreasury.claim`, `MajorLeagueTreasury.claimReward`

The new “pay user first, do not block on fee receiver” pattern improves user payout reliability, but it creates a new accounting hole. If a fee transfer fails, the fee amount remains in the contract but is not recorded anywhere as recoverable or unallocated.

In `BattleTreasury`, failed protocol or seasonal fees stay in `BattleTreasury` with no withdrawal/retry path.

In `MajorLeagueTreasury`, failed protocol fee transfers stay in the treasury, but `pendingRewards` was already zeroed and `prizePools` was already reduced. The contract balance becomes larger than the tracked accounting.

Evidence:
`03-BattleTreasury.sol` lines 397-411 emits `FeeTransferFailed` but does not account for the retained fee.
`01-MajorLeagueTreasury.sol` lines 235-243 does the same after clearing the user reward.

Recommended remediation:
Track failed fees explicitly:

```solidity
mapping(address => uint256) public pendingFeeWithdrawals;
```

If a fee transfer fails, credit `pendingFeeWithdrawals[receiver] += amount`. Add a `claimFees()` or `retryFeeTransfer(receiver)` function. For league-side failed fees, consider crediting `unallocatedBalance` if the receiver is the treasury itself.

3. **Sponsorship receiver timelock is still bypassed**
   Severity: High
   Affected: `SponsorshipPayments.setReceivers`

`SponsorshipPayments` still has an immediate owner setter:

```solidity
function setReceivers(...) external onlyOwner
```

This bypasses the timelocked `propose/execute` receiver flow. A compromised owner can immediately redirect the protocol and league sponsorship cuts.

Evidence:
`02-SponsorshipPayments.sol` lines 73-78.

Recommended remediation:
Remove `setReceivers` after deployment. Keep `_setReceivers` internal for constructor use only, and require all post-deploy receiver changes to use the timelock.

4. **Distributor role changes are still immediately executable**
   Severity: High
   Affected: `MajorLeagueTreasury.setDistributor`

`MajorLeagueTreasury` still exposes `setDistributor(address,bool)` as an immediate owner function. A compromised owner can instantly authorize a distributor, allocate prize pools to arbitrary recipients, and drain all allocatable prize pool balances through claims.

Evidence:
`01-MajorLeagueTreasury.sol` lines 89-92.

Recommended remediation:
Remove the immediate setter and use only a timelocked distributor-change path. Also make distributor additions subject to daily limits by default.

5. **Resolved battles can be refunded after the resolution deadline**
   Severity: Medium / High
   Affected: `BattleTreasury.refund`

The refund safety hatch applies to both `Active` and `Resolved` battles after `resolutionDeadline`, as long as the winner has not claimed. This means a valid resolver decision can be nullified later by anyone calling `refund`.

Exploit/failure scenario:
A battle is resolved correctly. The winner delays claiming. After the resolution deadline, the losing participant calls `refund`. Both parties get deposits back, and the winner loses their awarded profit. This is not theft of principal, but it defeats the game outcome and creates a griefing path against winners.

Evidence:
`03-BattleTreasury.sol` lines 454-473.

Recommended remediation:
Do not allow generic refunds once `state == Resolved`. Options:

1. Let resolved winners claim indefinitely.

2. Add a separate claim deadline after resolution, not based on the original deposit deadline.

3. After that claim deadline, only allow the winner’s net payout plus fee routing, not a full refund to both parties.

4. **Late resolution is allowed after the resolution deadline**
   Severity: Medium
   Affected: `BattleTreasury.resolveWinner`

`resolutionDeadline` exists, but `resolveWinner` does not check it. The resolver can submit a winner after the deadline. At that point, claim and refund become a race: the winner can claim, while anyone else can call the refund safety hatch.

Evidence:
`03-BattleTreasury.sol` lines 334-363 has no `block.timestamp <= battle.resolutionDeadline` check.

Recommended remediation:
Add:

```solidity
if (block.timestamp > battle.resolutionDeadline) revert DeadlinePassed();
```

Then keep the post-deadline refund path only for unresolved `Active` battles.

7. **EIP-712 struct omits creator, challenger, and seasonal pool**
   Severity: Medium
   Affected: `BattleTreasury.resolveWinner`

The new signature is much better than the previous raw hash, but it signs only `battleId`, `winner`, `stakeAmount`, and `resolutionDeadline`. It does not include `creator`, `challenger`, `seasonalPoolId`, or `depositDeadline`.

If `battleId` generation is ever weak, reused across environments before deployment, or controlled by an authorized creator, the signature has less contextual binding than it should. `address(this)` and `chainid` prevent cross-contract and cross-chain replay, but stronger battle-context binding is still warranted.

Evidence:
`03-BattleTreasury.sol` lines 313-316 and 343-354.

Recommended remediation:
Use:

```solidity
ResolveWinner(
    bytes32 battleId,
    address creator,
    address challenger,
    address winner,
    uint256 stakeAmount,
    uint256 depositDeadline,
    uint256 resolutionDeadline,
    bytes32 seasonalPoolId
)
```

8. **Sponsorship pool routing is not actually caller-controlled**
   Severity: Medium
   Affected: `SponsorshipPayments.payForSponsorship`

The comment says `poolId can be passed by caller if needed`, but the function hardcodes `bytes32(0)` when sending the league cut. This means every sponsorship league cut goes to `unallocatedBalance` and requires later manual allocation. That is not directly exploitable, but it creates operational custody risk and delays allocatability.

Evidence:
`02-SponsorshipPayments.sol` lines 159-162.

Recommended remediation:
Add a `bytes32 poolId` parameter to `payForSponsorship`, or add a separate function for sponsorships that should route directly to a known league pool.

9. **Timelocked distributor proposal does not bind the intended action**
   Severity: Low / Medium
   Affected: `MajorLeagueTreasury.proposeDistributorChange`, `executeDistributorChange`

`proposeDistributorChange(address distributor, bool add)` accepts `add`, but does not store it. The executor supplies `add` later. This means off-chain watchers cannot rely on the proposal function call to know whether the address will be added or removed.

Evidence:
`01-MajorLeagueTreasury.sol` lines 99-120.

Recommended remediation:
Use a dedicated struct:

```solidity
struct PendingDistributorChange {
    address distributor;
    bool allowed;
    uint256 executeAfter;
    bool exists;
}
```

Emit proposal and execution events.

10. **Build compatibility still needs confirmation**
    Severity: Informational / Potential High if unaddressed
    Affected: all contracts

The source still imports:

```solidity
@openzeppelin/contracts/security/ReentrancyGuard.sol
```

and constructors use:

```solidity
Ownable(msg.sender)
```

Those are not compatible across all OpenZeppelin major versions. `Ownable(msg.sender)` is OZ v5 style, while the `security/ReentrancyGuard.sol` path is OZ v4 style. If the project pins OZ v4, the constructors fail. If it pins OZ v5, the import path fails.

Recommended remediation:
Pin the OpenZeppelin version and update imports accordingly. For OZ v5, use:

```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
```

**Previously Flagged Items Rechecked**

Fixed or materially improved:

* `Battle.settled` now exists.
* Battle deposits now enforce exact `stakeAmount`.
* `creator == challenger` is rejected.
* Winner signatures now include chain/domain separation.
* Direct sponsorship and battle ETH transfers are rejected.
* League direct ETH is tracked as `unallocatedBalance`.
* League claims are allowed while paused.
* Battle fee receiver/resolver immediate setters were removed.

Still not fully fixed:

* Sponsorship receiver changes still bypass timelock.
* Major League distributor changes still bypass timelock.
* League revenue accounting is still broken for battle seasonal fees.
* Failed fee transfers still create stranded/unaccounted balances.

**Overall Risk Summary**
The revised contracts are closer, but I would still block deployment. The critical blocker is the battle-to-league fee path: the seasonal fee transfer will fail by construction and strand funds in `BattleTreasury`. The next highest priority is eliminating remaining immediate privileged setters and adding explicit accounting for failed fee transfers.

Highest-priority fixes:

1. Replace the `BattleTreasury` seasonal fee call with a payable `receiveBattleCut` or equivalent.
2. Track failed protocol/seasonal fee transfers as claimable balances.
3. Remove `SponsorshipPayments.setReceivers`.
4. Remove or timelock `MajorLeagueTreasury.setDistributor`.
5. Prevent refunds of already resolved battles, or define a separate winner-claim expiry policy.
6. Add a deadline check to `resolveWinner`.
7. Pin OpenZeppelin and confirm compilation in the actual project.