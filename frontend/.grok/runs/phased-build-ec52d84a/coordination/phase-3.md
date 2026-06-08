# Phase 3 Coordination — Distributor Limit Binding, Cut-Receiver Restrictions, and Zero Pool ID Reservation (MajorLeagueTreasury)

**Phase**: 3 of 5 (from approved build-plan.md for contractaudits4.md remediation)
**Started**: 2026-05-31
**Status**: In Progress

## Phase Scope (exact excerpt from approved build-plan.md)

**Goal**: Bind per-distributor daily and per-tx limits into the existing timelock proposal so that enabling a distributor always carries enforceable nonzero caps; restrict `receiveBattleCut` and `receiveSponsorshipCut` to known source contracts (`BattleTreasury` and `SponsorshipPayments`) via timelocked source addresses + modifiers; reserve `bytes32(0)` as an invalid pool ID for all public allocation/funding paths while preserving its sentinel meaning inside the (now-restricted) receive functions.

**Frontend Work**: None.

**Backend / Contract Work** (MajorLeagueTreasury.sol only):

- Extend the existing `PendingDistributorChange` struct (currently lines 356-361):
  ```solidity
  struct PendingDistributorChange {
      address distributor;
      bool allowed;
      uint256 dailyLimit;
      uint256 maxPerTx;
      uint256 executeAfter;
      bool exists;
  }
  ```
- Change `proposeDistributorChange(address distributor, bool allowed)` signature and body (line 108 area) to:
  ```solidity
  function proposeDistributorChange(address distributor, bool allowed, uint256 dailyLimit, uint256 maxPerTx) external onlyOwner { ... }
  ```
  Inside: if `allowed` then `require(dailyLimit > 0, "daily limit required"); require(maxPerTx > 0, "tx limit required");` then store all four values in the pending struct.
- Update `executeDistributorChange()` (line 117) to also set:
  ```solidity
  distributorDailyLimit[change.distributor] = change.dailyLimit;
  distributorMaxPerTx[change.distributor] = change.maxPerTx;   // new mapping
  ```
  (Add the new mapping `mapping(address => uint256) public distributorMaxPerTx;` near the other daily* mappings at bottom.)
- Update the allocateReward limit checks (lines 222-234 area) to prefer the per-distributor max when set:
  ```solidity
  uint256 effMax = distributorMaxPerTx[msg.sender] > 0 ? distributorMaxPerTx[msg.sender] : maxAllocationPerTx;
  if (effMax > 0 && amount > effMax) revert InvalidAmount();
  ```
  (Keep the global `maxAllocationPerTx` for backward compatibility during transition; the immediate `setMaxAllocationPerTx` will be addressed in Phase 5.)
- Add source address state + timelock (append near other pending* at ~line 352):
  ```solidity
  address public battleTreasurySource;
  address public sponsorshipPaymentsSource;
  PendingChange public pendingBattleTreasurySource;
  PendingChange public pendingSponsorshipPaymentsSource;
  ```
- Add events (append):
  ```solidity
  event BattleTreasurySourceProposed(address indexed newSource, uint256 executeAfter);
  event BattleTreasurySourceExecuted(address indexed newSource);
  event SponsorshipPaymentsSourceProposed(address indexed newSource, uint256 executeAfter);
  event SponsorshipPaymentsSourceExecuted(address indexed newSource);
  ```
- Add the two propose/execute/cancel functions (modeled exactly on the existing fee-receiver ones) for the two source addresses.
- Add modifiers:
  ```solidity
  modifier onlyBattleTreasury() {
      require(msg.sender == battleTreasurySource, "not battle treasury");
      _;
  }
  modifier onlySponsorshipPayments() {
      require(msg.sender == sponsorshipPaymentsSource, "not sponsorship payments");
      _;
  }
  ```
- Wrap `receiveBattleCut` and `receiveSponsorshipCut` with the appropriate modifier (they remain payable and keep their internal `if (poolId == bytes32(0))` logic).
- Add:
  ```solidity
  error InvalidPoolId();
  modifier validPoolId(bytes32 poolId) {
      if (poolId == bytes32(0)) revert InvalidPoolId();
      _;
  }
  ```
- Apply `validPoolId` modifier to: `fundPrizePool`, `allocateUnallocatedToPool`, `allocateReward`.
- Update the two receive functions' NatSpec to document that they are now access-controlled.
- Update the distributor-related events (`DistributorUpdated`) to remain compatible.
- Update `TRUST_MODEL.md` section on Distributors with the new "limits are proposed atomically with the role" rule.

**Deliverables**:
- `MajorLeagueTreasury.sol` has the extended distributor pending struct and proposal that enforces nonzero limits, the per-distributor max mapping, restricted cut receivers with timelocked source addresses, and `validPoolId` protection on all public pool-mutating entrypoints except the (now-restricted) receive cut functions.
- Constructor or an initializer sets the initial source addresses (or owner proposes them post-deploy).
- All existing public function signatures for non-admin paths are unchanged.

**Dependencies**: None (independent of Phases 1-2).

**Local vs Production Impact** (per `frontend/AGENTS.md`): Pure contract + docs. Verification via root Hardhat.

**Verification Strategy** (per closeout-checklist.md):
- Git diff / grep for the extended struct, updated propose/execute, new mappings, modifiers, source addresses + their propose/execute, and `validPoolId` + modifier applications.
- Manual Hardhat test confirming:
  - Proposing a distributor without nonzero limits reverts.
  - Allocating over the per-distributor max reverts.
  - Random callers to the now-restricted receive*Cut revert; the real source contracts succeed.
  - `fundPrizePool(bytes32(0))` and similar now revert with `InvalidPoolId`.

## Handoff Log

### Orchestrator → Backend Implementer (2026-05-31, start of Phase 3)
- You are responsible for **all** Backend/Contract items in Phase 3 (MajorLeagueTreasury.sol + the one `TRUST_MODEL.md` update).
- Frontend has zero work.
- Read the full approved plan (Phase 3 section) + closeout checklist (Phase 3 section) before editing.
- Be careful with the access-control changes — the receive*Cut functions must remain payable and keep their internal logic.
- After changes: run compile, append detailed notes + exact "**Backend Phase 3 Ready for Verification**" marker, write `summaries/phase-3-backend.md`.
- Do not declare the phase done yourself.

### Backend Implementer Notes
(Implementer will append dated entries here)

#### Backend Implementer Log — 2026-05-31 (Phase 3 execution)
**All mandatory first reads completed before any edit**:
- Approved build-plan.md (full Phase 3 section, exact work items + deliverables + "Local vs Production Impact" answers).
- closeout-checklist.md (full Phase 3 section + Deployment Gate items referenced).
- coordination/phase-3.md (this file, including Orchestrator handoff and scope quotes).
- contracts/MajorLeagueTreasury.sol (full; focused on: PendingDistributorChange at bottom, propose/executeDistributorChange ~116, allocateReward ~228 and limit/daily logic, receiveSponsorshipCut ~177, receiveBattleCut ~208, fundPrizePool ~166, allocateUnallocatedToPool ~194, all Pending* and daily mappings at end, modifiers, NatSpec).
- contracts/TRUST_MODEL.md (Distributors section lines 56-67).

**Strict adherence**:
- Exactly the Backend/Contract items listed (MajorLeagueTreasury.sol + *one* small TRUST_MODEL.md update on Distributors). Zero additions, zero scope creep.
- No frontend files touched (per plan "Frontend Work: None", frontend/AGENTS.md Rule 1-7, and persona restrictions). No api/, server/, db/, netlify/, src/, deployments/, hardhat.config, tests (Phase 5), other .sol.
- All patterns respected: append-only storage (new fields/mappings/events at end of structs/sections), custom errors + events, nonReentrant where required, checks-effects-interactions, exact require strings for new modifiers ("not battle treasury", "not sponsorship payments"), exact require strings in propose for limits ("daily limit required", "tx limit required").
- receive*Cut remain `payable`, internal `if (poolId == bytes32(0))` sentinel logic **completely unchanged** (only the trusted path now uses it).
- Constructor signature unchanged (sources set post-deploy via timelock per "or owner proposes them post-deploy" clause).
- DistributorUpdated event + emit site untouched (remains compatible; comment added for clarity).
- validPoolId modifier applied *only* to the three listed public paths; **not** applied to the receive*Cut (per explicit plan).

**Changes made (quote-for-quote from plan where possible)**:
- Extended `PendingDistributorChange` struct with `dailyLimit` + `maxPerTx` (plus explanatory comment).
- `proposeDistributorChange` now accepts 4 params; body enforces nonzero requires *only* when `allowed`; stores all fields.
- `executeDistributorChange` now sets `distributorDailyLimit` + `distributorMaxPerTx` (new public mapping added near daily* mappings).
- `allocateReward` limit check updated to `effMax = distributorMaxPerTx[msg.sender] > 0 ? ... : maxAllocationPerTx` (global fallback preserved for transition).
- Added `battleTreasurySource` / `sponsorshipPaymentsSource` + two `PendingChange` publics (with comment) near other pendings.
- Added exactly 4 events: BattleTreasurySourceProposed/Executed + SponsorshipPaymentsSourceProposed/Executed (after Phase 1 events).
- Added exactly 6 functions (propose/execute/cancel x2) after seasonal cancel; modeled on fee-receiver timelocks (using PendingChange, require !=0, delete, emit the listed events from propose/execute; cancels silent as no Cancel events were listed for sources in Phase 3 plan).
- Added two modifiers `onlyBattleTreasury` / `onlySponsorshipPayments` (exact strings) after whenNotPaused.
- Wrapped the two receive*Cut with their modifiers + updated their NatSpec to document the new access control.
- Added `error InvalidPoolId();` (top with other errors) + `modifier validPoolId` (near other modifiers).
- Applied `validPoolId(poolId)` to exactly `fundPrizePool`, `allocateUnallocatedToPool`, `allocateReward`.
- Small update to TRUST_MODEL.md Distributors "Current Mitigations" (now documents atomic proposal + nonzero enforcement rule).
- Ran `npx hardhat compile --force` (success: "Compiled 51 Solidity files successfully"; pre-existing BattleTreasury warnings from Phase 2 only; zero errors for MajorLeagueTreasury.sol).

**AGENTS.md / persona / plan compliance verified**:
- Pure contract + 1-doc. No impact on Netlify/Railway proxy, local dev, apiBase, VITE_* etc. (plan explicitly answers "No" / "N/A" for all).
- Security first: new public surfaces (source setters, receive wrappers, poolId guards) validated via modifiers + requires + custom error. No new reentrancy (no external calls added in admin paths).
- "Push back on verifier findings only with direct quotes from the approved plan" observed internally.

**Evidence pointers (for verifier using closeout-checklist.md commands)**:
- `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 10 "struct PendingDistributorChange"` → extended struct.
- `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 20 "function proposeDistributorChange"` → new sig + requires + store.
- `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 15 "distributorMaxPerTx"` (and execute) → new mapping + sets.
- `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 5 "effMax = distributorMaxPerTx"` → allocateReward update.
- `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -E "(battleTreasurySource|sponsorshipPaymentsSource|pendingBattle|pendingSponsorship)"` → state + pendings.
- `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -E "(BattleTreasurySourceProposed|SponsorshipPaymentsSource)"` → 4 events.
- `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 30 "function proposeBattleTreasurySource"` (and the 5 others) → full 6 functions.
- `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 20 "modifier onlyBattleTreasury"` → modifiers + exact strings.
- `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -E "onlyBattleTreasury|onlySponsorshipPayments"` on receive sigs → wrappers.
- `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 10 "modifier validPoolId"` + applications on the 3 funcs → error/mod + 3 applications.
- `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 15 "@notice.*SponsorshipPaymentsSource\|@notice.*BattleTreasurySource"` → updated NatSpec.
- `git diff --no-color contracts/TRUST_MODEL.md | grep -A 10 "Phase 3 update"` → doc update.
- `npx hardhat compile --force 2>&1 | tail -10` → "Compiled 51 Solidity files successfully" (no errors).

**Backend Phase 3 Ready for Verification**

All Phase 3 Backend/Contract work (and the single TRUST_MODEL update) from the approved build-plan.md and closeout-checklist.md has been delivered exactly, with full auditability via git diff/grep. The three findings addressed by this phase (weak distributor limits High + two Mediums on cut receivers + bytes32(0)) now have the specified on-chain controls. Awaiting plan-verifier execution of the Phase 3 section of closeout-checklist.md (and the multi-scenario Hardhat manual transcript for edge cases).

**Current Phase Status**: Backend execution complete. "**Backend Phase 3 Ready for Verification**" marker placed (2026-05-31). Frontend side N/A (already noted). Do not run full verifier or declare global complete — Phase 2 verifier runs in parallel per assignment.

## Frontend → Backend (to be added by frontend implementer stub)

## Frontend → Backend (2026-05-31)
- Phase 3: Per approved build plan, Frontend Work = "None".
- No files in src/, components/, pages/, or any frontend directory were modified (and none were required).
- No API contract changes, no new calls through apiBase.ts.
- Frontend side of Phase 3 is complete by definition (N/A).
- Frontend Phase 3 Ready for Verification.