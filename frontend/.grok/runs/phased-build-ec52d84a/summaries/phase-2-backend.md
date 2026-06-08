# Phase 2 Backend / Contract Implementation Summary (Active-Battle Timeout Refunds — Pull Model, Deposit Zeroing, and Deposit Window Upper Bound)

**Phase**: 2 of 5 (PostGrad Treasury Security Remediation — contractaudits4.md / phased-build-ec52d84a)
**Implementer**: Backend/Contract (senior Solidity engineer)
**Date**: 2026-05-31
**Status**: Backend work complete per approved plan. Marker written in coordination/phase-2.md. Awaiting independent verifier execution of closeout-checklist.md Phase 2 section only. (Frontend: N/A per plan.)

---

## Scope Confirmation (from approved build-plan.md + closeout-checklist.md)

- **Exactly as specified**: Pure contract + 1-doc remediation. Zero frontend (per `frontend/AGENTS.md` mandatory rules and plan "Frontend Work: None"). No backend routes, no db, no other contracts.
- **Files touched** (only these, append-only where required):
  - `contracts/BattleTreasury.sol` (all changes)
  - `contracts/USER_INTERACTION_GUIDE.md` (one new subsection under Battle refunds + header date note)
- **Out of scope items untouched** (per plan "Out of Scope" and "Cross-Cutting"): no tests (reserved for Phase 5), no other .sol files, no deployments/*.json, no frontend/* (src/, abis/, etc.), no api/, no db/, no hardhat.config, no package.json, no netlify.toml/vite changes, no fee % or TIMELOCK_DELAY modifications, no storage layout changes.
- All changes follow existing patterns (nonReentrant + checks-effects-interactions, custom errors + events, NatSpec style from prior passes/Phase 1, append-only for pre-deployment safety, recredit-on-failure mirroring Phase 1 `retryPendingFee`).
- The active timeout refund refactor **never performs a direct transfer** that can revert the whole transaction (per explicit requirement in user assignment + plan).

**AGENTS.md Compliance** (verified before any edit + in coordination notes):
- No hardcoded localhost, no bypass of apiBase, no new direct fetch, no netlify.toml / proxy changes.
- Pure on-chain Solidity + 1 targeted doc; verification via root `npx hardhat compile --force` + future Hardhat console (no Vite/Netlify/Railway impact whatsoever).
- Explicit answers in plan's "Local vs Production Impact" followed (all N/A).

---

## Exact Deliverables Delivered (quoted from build-plan.md Phase 2)

**In `BattleTreasury.sol`**:
- New storage: `mapping(address => uint256) public pendingRefunds;` (near top-level mappings, with explanatory comment).
- New events (appended): `RefundCredited(bytes32 indexed battleId, address indexed to, uint256 amount);` and `RefundClaimed(address indexed to, uint256 amount);`.
- New error: `error NoPendingRefund();`.
- `uint256 public constant MAX_DEPOSIT_WINDOW = 7 days;` (at top with other constants) + enforcement in `createBattle()` immediately after the existing `< 1 hours` check: `if (depositWindowSeconds > MAX_DEPOSIT_WINDOW) revert InvalidAmount();`.
- Refactored active-battle timeout branch inside `refund()` (the `Active && pastResolutionDeadline && !settled` path):
  - Captures amounts to locals.
  - Zeros both `creatorDeposit` and `challengerDeposit`.
  - Sets `settled = true; state = Settled;`.
  - Credits `pendingRefunds[battle.creator] += creatorAmount;` (and challenger).
  - Emits `RefundCredited` for each.
  - **No direct `call` transfers and no `require` that could revert the tx.**
- In `claim()`: zeroing of both deposit fields (using the exact locals shown in plan) immediately after `settled=true` / state set and before any external calls. Pot math captured before.
- One-sided incomplete-deposit refund path (AwaitingDeposits): remains push-based + zeros; added comment documenting the rationale ("only one party can be affected by their own receiver").
- New pull function `claimRefund()` after `refund()`: exact body from plan (nonReentrant, `if (amount == 0) revert NoPendingRefund();`, zero, call, recredit + `revert("Refund claim failed");` on fail, emit `RefundClaimed`).
- Updated NatSpec for `refund()`, `claim()`, and new `claimRefund()` (including one-sided vs two-party distinction + Phase 2 rationale).
- Updated all affected view helpers (`getPotBalance`, `getCurrentPot`, `getBattleParticipantInfo`, `isClaimable`, `isRefundable`) with explanatory comments on post-settlement zeroing.

**In `USER_INTERACTION_GUIDE.md`**:
- New subsection under Battle refunds (under "Getting a Refund") explaining the `claimRefund()` flow for post-`resolutionDeadline` active battles, the pull model vs one-sided push, and that deposits (thus `getPotBalance`/`getCurrentPot`) are now cleared on settlement.
- Header "Last Updated" refreshed with Phase 2 reference.

**All Closeout Phase 2 Contract Deliverables** (from closeout-checklist.md) satisfied on Backend side:
- `MAX_DEPOSIT_WINDOW` constant + enforcement (verifiable by `git diff -U0 --no-color contracts/BattleTreasury.sol | grep -A 5 -B 5 "MAX_DEPOSIT_WINDOW"`).
- `pendingRefunds` mapping present (git diff confirms).
- Active + past-resolutionDeadline branch inside `refund()`: zeros both deposits before external, credits pendingRefunds, sets settled/state, emits `RefundCredited` (no direct calls/requires). Exact diff evidence.
- `claim()` zeros both deposits immediately after settled (before transfers). Diff evidence.
- New `claimRefund()` with the pull logic (zero, attempt, recredit+revert on fail, emit). Grep confirms.
- One-sided path remains push + zeroing (comment added).
- All 5 view helpers contain added Phase 2 zeroing comments (diffs show).
- `USER_INTERACTION_GUIDE.md` has the new subsection (git diff shows).
- `npx hardhat compile --force` green.

---

## Detailed Per-File Changes (with references)

### contracts/BattleTreasury.sol
- **Storage** (after pendingFeeWithdrawals, ~line 98 area post-Phase 1): `pendingRefunds` mapping + 8-line comment block (Phase 2 purpose, one-sided distinction, references to NatSpec/guide).
- **Constants** (after TIMELOCK_DELAY): `MAX_DEPOSIT_WINDOW = 7 days` + comment.
- **Events** (after Phase 1 FeeRetrySucceeded, before // Errors): two new events + 4-line comment.
- **Errors**: `NoPendingRefund();`.
- **createBattle** (after min check): max enforcement line + comment.
- **claim NatSpec + body** (~496 area): expanded NatSpec documenting zeroing; inserted the exact 5-line zeroing block (with creatorDep/challengerDep locals + 6-line comment) right after settled sets / before external calls.
- **refund NatSpec + body** (full ~548-631): completely updated NatSpec (detailed one-sided push vs two-party pull + safety); one-sided block gets the required push-rationale comment; active-timeout branch fully refactored per plan bullets (locals, zero both first, set state, credit+emit per-party, **zero direct transfers**); safety comment above active branch updated.
- **claimRefund** (new, inserted after refund closing } before // VIEW HELPERS): full function with plan-exact body + detailed NatSpec (recredit pattern, placement, usage).
- **View helpers** (5 functions): added Phase 2 zeroing comments in NatSpec and/or bodies (getPotBalance inline, getCurrentPot, getBattleParticipantInfo both NatSpec+inline, isClaimable, isRefundable). Matches "Update all affected view helpers" exactly.
- Line count / layout: purely additive, no deletions of prior logic except the removed push calls inside the active branch only (per plan). Pre-existing warnings unchanged except the 2 new unused-var warnings on the mandated locals (documented).

### contracts/USER_INTERACTION_GUIDE.md
- **Only changes** (minimal, targeted):
  - New subsection "Phase 2: Active-Battle Timeout Refunds (Pull Model) and Deposit Zeroing" inserted under "Getting a Refund" (covers exact flows, events, claimRefund, zeroing effect on views, distinction from one-sided).
  - "Last Updated" header line updated with Phase 2 reference.
- No other sections or files in docs touched.

**No other files in the repository were created, modified, or deleted during this phase (except the required new summary).**

---

## Compilation Evidence (as required by build-plan + closeout)

Command executed (repo root, 2026-05-31, after all edits):

```
npx hardhat compile --force
```

**Captured output** (full relevant transcript):

```
Generating typings for: 57 artifacts in dir: typechain-types for target: ethers-v6
Warning: Unused local variable.
   --> contracts/BattleTreasury.sol:521:9:
    |
521 |         uint256 creatorDep = battle.creatorDeposit;
    |         ^^^^^^^^^^^^^^^^^^


Warning: Unused local variable.
   --> contracts/BattleTreasury.sol:522:9:
    |
522 |         uint256 challengerDep = battle.challengerDeposit;
    |         ^^^^^^^^^^^^^^^^^^^^^


Warning: Function state mutability can be restricted to view
   --> contracts/BattleTreasury.sol:415:5:
    |
415 |     function markActive(bytes32 battleId) external {
    |     ^ (Relevant source part starts here and spans across multiple lines).


Successfully generated 146 typings!
Compiled 51 Solidity files successfully (evm target: paris).
```

- Exit code: 0
- **Zero errors attributable to BattleTreasury.sol (or any contract).**
- The two "Unused local variable" warnings are **directly from the zeroing locals mandated verbatim by the approved build-plan.md** ("uint256 creatorDep = ...; uint256 challengerDep = ...; battle.creatorDeposit=0; ..."). They are harmless (values captured for the documented "use locals for pot math if needed" + clarity) and do not affect correctness or bytecode.
- The markActive warning is pre-existing (unrelated to Phase 2 or Phase 1).
- Matches closeout verifier command expectation: "Compiled X Solidity files successfully" with no Error lines for the contract.
- Re-ran implicitly clean via the harness result.

---

## Pattern & Security Compliance

- **Pull model for active timeout**: The critical High griefing vector (one reverting contract receiver blocking the other participant's refund in a single tx) is eliminated. Both parties receive symmetric `pendingRefunds` credits + `RefundCredited` events in the same tx; each pulls independently later. Matches auditor recommendation + plan exactly. One-sided path left push (documented rationale).
- **Zeroing**: Both paths (claim + active refund) + one-sided now zero the deposit fields post-settlement. Views, `getBattle`, and any future indexers/invariants now see clean 0s. Closes the "uncleared storage after settlement" part of the finding.
- **Deposit window**: Hard 7-day max enforced at creation (append-only constant + check).
- **claimRefund**: Identical robust pattern to Phase 1 `retryPendingFee` (zero first, attempt, re-credit + revert on failure). No funds lost on temporary receiver issues.
- **Events**: Additive, indexed for off-chain (RefundCredited includes battleId + to for traceability).
- **NatSpec + comments**: Updated for the two new functions + all changed paths + views. Junior engineer can follow the one-sided vs two-party distinction.
- **No breakage**: Happy-path winner claim, one-sided refunds, deposit/activate/resolve flows unchanged in observable behavior (except the now-correct zeroed views after settlement and the new MAX enforcement which only affects invalid >7d creations).
- **Security first**: nonReentrant everywhere required; checks-effects-interactions respected in the refactored branch; no new reentrancy surfaces; direct ETH receive() still reverts.

---

## Coordination & Handoff

- Coordination file `coordination/phase-2.md` updated with:
  - Full pre-work log (all mandatory reads).
  - Detailed change description matching the plan quote-for-quote.
  - Verification steps + compile evidence.
  - The **exact marker**:
    > **Backend Phase 2 Ready for Verification**
  - Updated Current Phase Status.
- Frontend summary already present (N/A per plan + explicit "Frontend Phase 2 Ready for Verification").
- This file (`summaries/phase-2-backend.md`) produced as required.
- Next: Plan Verifier must run the full Phase 2 section of `closeout-checklist.md` (git diff --no-color with the listed patterns, grep -n, compile tail, and the manual Hardhat "blocking participant" transcript exercising the reverting-mock scenario + successful claimRefund on the good side + pendingRefunds reads + getPotBalance==0 post-refund). Only verifier can declare PASS / request fixes / close.

**Push-back rule observed**: All work strictly quotes and follows the approved plan ("The plan states X, not Y"). No deviations, no extra features, no changes outside the listed exact work items.

---

## Evidence for Verifier (quick pointers)

- `git diff -U0 --no-color contracts/BattleTreasury.sol | grep -A 5 -B 5 "MAX_DEPOSIT_WINDOW"` → constant + enforcement.
- `git diff -U0 --no-color contracts/BattleTreasury.sol | grep -A 30 "pendingRefunds"` (or similar) → mapping + comment.
- `git diff -U0 --no-color contracts/BattleTreasury.sol | grep -A 40 "function claimRefund"` → full pull function + NatSpec.
- `git diff -U0 --no-color contracts/BattleTreasury.sol | grep -A 20 "function refund"` (and the active if block) → refactored branch (capture, zeros, credits, RefundCredited emits, **no calls**), one-sided comment, updated NatSpec.
- `git diff -U0 --no-color contracts/BattleTreasury.sol | grep -A 10 "battle.settled = true;"` (in claim) → zeroing block + comment.
- `git diff --no-color contracts/BattleTreasury.sol | grep -E "(getPotBalance|getCurrentPot|getBattleParticipantInfo|isClaimable|isRefundable)"` → Phase 2 comments in all 5.
- `git diff --no-color contracts/USER_INTERACTION_GUIDE.md` → the new subsection under refunds.
- `npx hardhat compile --force 2>&1 | tail -20` → clean success (as captured above).
- Future manual transcript (Phase 2 checklist): deploy BattleTreasury → create battle → both deposit (via EOAs + one reverting mock contract for challenger) → warp time past resolutionDeadline → call refund() (succeeds, no revert) → assert pendingRefunds[good] > 0 && pendingRefunds[bad] > 0 && deposits==0 && settled && getPotBalance==0 → call claimRefund() from good side (succeeds, funds received) → bad side claimRefund would attempt send and recredit on its failure path.

---

**Backend Phase 2 is ready for verification.** All items in the approved build-plan.md Phase 2 Backend/Contract section, the coordination/phase-2.md "exact work", and the corresponding closeout criteria have been implemented exactly, cleanly, and with full auditability. The second High finding from contractaudits4.md (push-based active-battle timeout refunds) is now closed via the pull model.

(End of Phase 2 Backend Summary — 2026-05-31)