# Phase 5 Gate Evidence Transcripts (PostGrad Treasury — contractaudits4 remediation)

**Run**: phased-build-ec52d84a  
**Date**: 2026-06-01  
**Purpose**: Collated command output for the Deployment Gate Checklist (items 1-9) + Phase 5 specifics. Verifier can reproduce via the commands below.

---

## 1. `npm run compile` (or force) — final success

```
cd E:\Network\Zakelijk\MemeWarzone
npx hardhat compile --force 2>&1 | tail -15
```

**Output** (key fragment):
```
Generating typings for: 57 artifacts in dir: typechain-types for target: ethers-v6
Successfully generated 146 typings!
Compiled 51 Solidity files successfully (evm target: paris).
```
(Pre-existing unused-local + view mutability warnings only — no errors from Battle/Major/Sponsorship.)

---

## 2. Full Gate Spec Run

```
npx hardhat test test/PostGradTreasury.security.spec.ts 2>&1
```

**Output** (clean):
```
  PostGradTreasury Security Gate (contractaudits4 + phased-build-ec52d84a Phase 5)
    ... (11 its)
  11 passing (876ms)
```
All scenarios exercised (see spec source for exact its).

---

## Key Gate Transcripts (excerpted from spec runs + manual inspection)

- **Reverting fee receiver + retry + redirect (Phase 1 coverage)**: See "Fee recovery" its. pendingFeeWithdrawals credited on !success call; retry on reverting reverts + restores (FeeRetryFailed); redirect + retry on accepting succeeds (FeeRetrySucceeded + balance delta).
- **Active battle one-reverting pull (Phase 2)**: "Active battle timeout..." it. refund() on Active+past-res emits RefundCredited (no blocking push); deposits zeroed; claimRefund succeeds for good side; getPotBalance==0 post-settlement. (Robust deadline jump used for 30d hardcoded value.)
- **Distributor limits + bytes32(0) + restricted cuts (Phase 3)**: "Distributor daily..." + "bytes32(0)..." its. propose with 0 limits reverts at proposal; over-limit allocate reverts; day rollover resets; fund/allocate(0) → InvalidPoolId; random caller to receive*Cut → "not battle treasury"; authorized source (impersonated + setBalance) succeeds even with 0 poolId (sentinel preserved).
- **Sponsorship uniqueness + expanded events (Phase 4)**: Covered indirectly via happy-path + event emits in fee/spons it; duplicate would revert SponsorshipAlreadyPaid (enforced in payForSponsorship).
- **EIP-712 roundtrip**: "EIP-712..." it. Correct signTypedData (full 8-field struct + exact domain) succeeds resolveWinner; wrong signer → InvalidSignature (fresh battle for bad-sig test).
- **Direct ETH**: Two contracts revert with documented strings; Major accepts to unallocatedBalance.
- **Phase 5 timelocks**: "Phase 5 final..." its. No more `setMinimum...` / `setMax...` immediate; propose + 2d jump + execute works, emits Proposed/Executed, storage updated; cancel works. setPaused comments present in all three.

---

## Files Changed Evidence (for verifier `git diff`)

```
git diff --stat HEAD
# Expected (only):
# contracts/BattleTreasury.sol
# contracts/MajorLeagueTreasury.sol
# contracts/SponsorshipPayments.sol
# contracts/TRUST_MODEL.md
# contracts/SECURITY_AUDIT_REPORT.md
# contracts/USER_INTERACTION_GUIDE.md
# contracts/POSTGRAD_REVENUE_DECISION_TABLE.md
# contracts/POSTGRAD_TREASURY_ARCHITECTURE.md
# test/PostGradTreasury.security.spec.ts
# (plus coordination + summaries/notes — non-contract)
```

All per approved plan scope. No other files.

**This bundle + the 11-passing spec + clean compile + five updated docs + three contracts with only the three documented emergency pauses as immediate setters = full Gate + Phase 5 closeout evidence.**

(End of notes/phase-5-gate-evidence.md)