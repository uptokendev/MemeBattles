# Phase 3 Backend / Contract Implementation Summary (Distributor Limit Binding, Cut-Receiver Restrictions, and Zero Pool ID Reservation — MajorLeagueTreasury)

**Phase**: 3 of 5 (PostGrad Treasury Security Remediation — contractaudits4.md / phased-build-ec52d84a)
**Implementer**: Backend/Contract (senior Solidity engineer)
**Date**: 2026-05-31
**Status**: Backend work complete per approved plan. Exact "**Backend Phase 3 Ready for Verification**" marker written in coordination/phase-3.md. Awaiting independent verifier execution of closeout-checklist.md Phase 3 section only. (Frontend: N/A per plan — zero files touched.)

---

## Scope Confirmation (from approved build-plan.md + closeout-checklist.md)

- **Exactly as specified**: Pure contract + 1-doc remediation on `contracts/MajorLeagueTreasury.sol` + one small update to `contracts/TRUST_MODEL.md` (Distributors section). Zero frontend (per `frontend/AGENTS.md` mandatory rules, plan "Frontend Work: None", and persona "Never touch frontend-only files"). No backend routes, no db migrations, no other contracts, no tests (reserved for Phase 5), no deployments, no config changes.
- **Files touched** (only these):
  - `contracts/MajorLeagueTreasury.sol` (all listed changes — append-only for pre-deployment storage safety).
  - `contracts/TRUST_MODEL.md` (one targeted paragraph update in Distributors mitigations).
- **Out of scope items untouched** (per plan "Out of Scope", "Cross-Cutting", and "Deliverables"): no changes to BattleTreasury.sol / SponsorshipPayments.sol, no ctor sig changes, no removal of `setDistributorDailyLimit` or `setMaxAllocationPerTx` (Phase 5), no cancel events for sources (Phase 4), no richer DistributorUpdated event (Phase 4), no Hardhat spec (Phase 5), no other .md files.
- All changes follow existing patterns (nonReentrant + checks-effects-interactions where applicable, custom errors, NatSpec style, 2-day TIMELOCK_DELAY + PendingChange reuse, recredit patterns from prior phases not applicable here, append-only storage/events).
- Careful access-control: receive*Cut wrappers preserve payable + exact internal sentinel logic; sources default to address(0) until owner proposes post-deploy (per explicit "or" clause); validPoolId excludes the restricted receive paths.

**AGENTS.md Compliance** (verified before edits + in coordination notes):
- No hardcoded localhost, no bypass of apiBase.ts, no new direct fetch, no netlify.toml / proxy / vite changes whatsoever.
- Pure on-chain Solidity + 1 targeted doc; verification exclusively via root `npx hardhat compile --force` + future Hardhat console (no Vite/Netlify/Railway impact).
- Explicit answers in plan's "Local vs Production Impact" section followed verbatim (all "No" / "N/A").
- New public surfaces (6 admin functions, 2 modifiers, 1 modifier-applied error) are owner-only or source-restricted + validated.

---

## Exact Deliverables Delivered (quoted / paraphrased from build-plan.md Phase 3)

**In `MajorLeagueTreasury.sol`** (all items):
- Extended the existing `PendingDistributorChange` struct (was lines ~438) with `dailyLimit` + `maxPerTx` fields (plus comment).
- Changed `proposeDistributorChange(address distributor, bool allowed)` signature and body to accept + require the two limit values; `if (allowed) { require(dailyLimit > 0, "daily limit required"); require(maxPerTx > 0, "tx limit required"); }` then store all six values.
- Updated `executeDistributorChange()` to also set `distributorDailyLimit[change.distributor] = change.dailyLimit;` and `distributorMaxPerTx[...] = change.maxPerTx;`.
- Added the new mapping `mapping(address => uint256) public distributorMaxPerTx;` (near the other daily* mappings, with updated comment).
- Updated the allocateReward limit checks (the maxAllocationPerTx line) to the exact effMax preference logic shown in plan (global kept for transition compatibility).
- Added source address state + timelock (near other pending*):
  ```solidity
  address public battleTreasurySource;
  address public sponsorshipPaymentsSource;
  PendingChange public pendingBattleTreasurySource;
  PendingChange public pendingSponsorshipPaymentsSource;
  ```
  (with explanatory comment referencing the Medium finding).
- Added exactly the four events (appended after Phase 1 events):
  `event BattleTreasurySourceProposed...`, `Executed...`, `SponsorshipPaymentsSourceProposed...`, `Executed...`.
- Added the six propose/execute/cancel functions for the two sources (placed before receive(); modeled exactly on fee-receiver timelocks using PendingChange + require !=0 + delete; emit the listed events from propose/execute; cancels perform delete only — no extra Cancel events because none were listed in the Phase 3 "Add events" instruction).
- Added the two modifiers (after whenNotPaused, with exact require strings from plan):
  ```solidity
  modifier onlyBattleTreasury() { require(msg.sender == battleTreasurySource, "not battle treasury"); _; }
  modifier onlySponsorshipPayments() { require(msg.sender == sponsorshipPaymentsSource, "not sponsorship payments"); _; }
  ```
- Wrapped `receiveBattleCut` with `onlyBattleTreasury` and `receiveSponsorshipCut` with `onlySponsorshipPayments` (both remain payable; internal `if (poolId == bytes32(0))` logic + all other behavior **unchanged**).
- Added:
  ```solidity
  error InvalidPoolId();
  modifier validPoolId(bytes32 poolId) {
      if (poolId == bytes32(0)) revert InvalidPoolId();
      _;
  }
  ```
  (error at top with peers; modifier near other modifiers with comment).
- Applied `validPoolId` modifier to exactly: `fundPrizePool`, `allocateUnallocatedToPool`, `allocateReward`.
- Updated NatSpec on the two receive*Cut functions to document they are now access-controlled (plus note that sentinel logic is preserved for trusted callers).
- `DistributorUpdated` event + emit site left unchanged (remains fully compatible; added clarifying comment per "Update distributor-related events ... to remain compatible").
- (Constructor left as-is per plan's "or owner proposes them post-deploy" allowance; initial sources are address(0) until timelocked config.)

**In `contracts/TRUST_MODEL.md`**:
- Distributors section "Current Mitigations" updated with one small paragraph documenting the new "limits are proposed atomically with the role" rule (nonzero enforcement on enable).

**Compilation & Isolation**:
- `npx hardhat compile --force` (run after all edits) completes with zero errors attributable to MajorLeagueTreasury.sol (or any of the three contracts). Pre-existing harmless warnings from BattleTreasury Phase 2 changes only. Verifier command output captured below.

**Manual Edge-Case Verification (deferred to verifier per plan/closeout)**:
- Verifier will run Hardhat console / script demonstrating:
  - propose with daily=0 or max=0 (when allowed) → reverts with the exact require strings.
  - propose + execute with positive limits → distributor allocates up to limit but not over; daily reset works.
  - After setting sources: random EOA calling receive*Cut reverts with precise "not battle treasury" / "not sponsorship payments".
  - Authorized source addresses succeed.
  - `fundPrizePool(bytes32(0))`, `allocateUnallocatedToPool(bytes32(0), 1)`, `allocateReward(bytes32(0), addr, 1)` all revert `InvalidPoolId`.
  - `receive*Cut(..., bytes32(0))` from authorized source still routes to unallocatedBalance (sentinel preserved).
- Evidence via transcript + state reads (to be produced by verifier using closeout-checklist.md procedure).

---

## Compilation Evidence (exact command + output)

```powershell
cd "E:\Network\Zakelijk\MemeWarzone"; npx hardhat compile --force 2>&1 | Select-Object -Last 30
```

**Captured output (success + known pre-existing warnings only)**:

```
Generating typings for: 57 artifacts in dir: typechain-types for target: ethers-v6
Successfully generated 146 typings!
Compiled 51 Solidity files successfully (evm target: paris).
```

(Repeated runs with full output also showed the three pre-existing BattleTreasury warnings from Phase 2 zeroing locals + one view mutability — identical to phase-2-backend.md notes. Zero "Error" lines for MajorLeagueTreasury.sol or new Phase 3 constructs. Exit code 0.)

Matches closeout expectation: clean "Compiled X Solidity files successfully" with no Error lines for the contract.

---

## Pattern & Security Compliance

- **Distributor limits binding (High finding closure)**: Nonzero daily + maxPerTx are now mandatory at proposal time when enabling a distributor; carried through the 2-day timelock and written atomically in executeDistributorChange alongside the `distributors[addr] = true`. Per-distributor max now preferred in allocateReward (with global fallback). Immediate `setDistributorDailyLimit` left in place (per plan; addressed Phase 5).
- **Cut-receiver restrictions (Medium finding closure)**: `receiveBattleCut` / `receiveSponsorshipCut` now guarded by `onlyBattleTreasury` / `onlySponsorshipPayments`. Sources configured via the exact same PendingChange + propose/execute/cancel pattern already proven for fee receivers. Initially unusable (address(0)) until owner configures post-deploy — intentional and documented.
- **bytes32(0) reservation (Medium finding closure)**: `InvalidPoolId` + `validPoolId` modifier applied to all three public allocation/funding entrypoints. The sentinel retains its unallocated meaning *exclusively* inside the two now-restricted receive functions (explicitly preserved and NatSpec-documented).
- **Events / observability**: Four new source events are additive and emitted from the new admin paths. Distributor event untouched for compatibility.
- **NatSpec + comments**: Updated for receives + new modifiers + state + allocateReward + struct/funcs. Junior engineer can understand the trusted-caller vs public paths and why 0 is still valid in one narrow place.
- **No breakage**: All happy-path flows (fund → allocate → claim, sponsorship/battle cuts from their real callers once sources set, direct ETH receive, owner timelocks for fees/resolver/etc.) unchanged except for the new guards on the intended surfaces. Existing distributor daily enforcement logic untouched.
- **Security first**: All new surfaces use require + custom error; owner-only for config; nonReentrant retained on allocateReward; checks-effects-interactions respected; no new external calls in hot paths; storage append-only (no layout shift risk for pre-deploy contract).

---

## Coordination & Handoff

- Coordination file `coordination/phase-3.md` updated with:
  - Full pre-work mandatory reads log.
  - Detailed change description (quote-for-quote references to plan language for every item).
  - Full list of git-diff / grep evidence pointers matching closeout-checklist.md verifier commands.
  - The **exact marker** (in bold):
    > **Backend Phase 3 Ready for Verification**
  - Updated Current Phase Status + explicit instruction to verifier (run Phase 3 section only; Phase 2 verifier parallel).
- This file (`summaries/phase-3-backend.md`) produced as required.
- Frontend coordination note already present (N/A).
- Next: Plan Verifier must independently execute the Phase 3 section of `closeout-checklist.md` (the listed git diff/grep patterns for struct/sig/mapping/modifier/wrappers/validPoolId/applications/events/functions/NatSpec/doc + the manual multi-scenario Hardhat transcript exercising the 0-limit revert, over-limit revert, random-caller reverts on receives, authorized success, bytes32(0) reverts on public paths, and sentinel preservation on receives). Only verifier declares PASS / requests fixes.

**Push-back rule observed**: All work strictly quotes and follows the approved plan ("The plan states X, not Y"). No deviations (e.g. did not add cancel events for sources, did not change ctor, did not touch set* immediate setters, did not update any other docs, did not add tests).

---

## Evidence for Verifier (quick pointers — use with `git diff --no-color -U0`)

- Struct + propose/execute: `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 30 -E "(PendingDistributorChange|proposeDistributorChange|executeDistributorChange)"`
- New mapping + allocate effMax: `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 8 -B 2 "distributorMaxPerTx\|effMax = distributorMaxPerTx"`
- Source state + events: `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -E "(battleTreasurySource|sponsorshipPaymentsSource|BattleTreasurySourceProposed|SponsorshipPaymentsSource)"`
- 6 source functions: `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 60 "PHASE 3: TIMELOCKED CUT RECEIVER SOURCES"`
- Modifiers + wrappers: `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 30 -E "(onlyBattleTreasury|onlySponsorshipPayments|function receive.*Cut.*only)"`
- validPoolId + applications + error: `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 15 -E "(InvalidPoolId|validPoolId|function fundPrizePool|function allocateUnallocatedToPool|function allocateReward.*validPoolId)"`
- NatSpec updates: `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 10 "@notice.*(SponsorshipPaymentsSource|BattleTreasurySource)"`
- Distributor compat comment + TRUST_MODEL: `git diff --no-color contracts/MajorLeagueTreasury.sol | grep -A 3 "DistributorUpdated remains unchanged"; git diff --no-color contracts/TRUST_MODEL.md`
- Compile: `npx hardhat compile --force 2>&1 | tail -15` (success line + absence of MajorLeague errors).
- Full manual transcript (per closeout): deploy MajorLeagueTreasury → (owner) propose+execute distributor with limits → attempt over-limit allocateReward → revert; set sources → random call receive*Cut → revert with exact strings; real source call succeeds; bytes32(0) calls on 3 public funcs → InvalidPoolId; bytes32(0) from source on receive*Cut → unallocatedBalance credited (no revert).

---

**Backend Phase 3 Ready for Verification**

All items in the approved build-plan.md Phase 3 Backend/Contract section, the coordination/phase-3.md "exact work", and the corresponding closeout criteria have been implemented exactly, cleanly, and with full auditability (git-diff + grep + compile evidence). This phase closes the third High finding (weak distributor limits) + the two Medium findings (permissionless cut receivers + bytes32(0) ambiguity) from contractaudits4.md, using only the controls and patterns the plan specified. The plan-verifier is the sole judge of PASS.

(End of Phase 3 Backend Summary — 2026-05-31)