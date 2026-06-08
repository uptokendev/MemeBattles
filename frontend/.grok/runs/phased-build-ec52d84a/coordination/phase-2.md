# Phase 2 Coordination — Active-Battle Timeout Refunds — Pull Model, Deposit Zeroing, and Deposit Window Upper Bound

**Phase**: 2 of 5 (from approved build-plan.md for contractaudits4.md remediation)
**Started**: 2026-05-31
**Status**: In Progress

## Phase Scope (exact excerpt from approved build-plan.md)

**Goal**: Remove the griefing vector in which a single participant with a reverting `receive()` can permanently block the other participant's refund after `resolutionDeadline`, convert that path to pull-based credits, zero `creatorDeposit`/`challengerDeposit` after all claim and active-timeout paths (so view helpers and invariants become correct post-settlement), and add a hard maximum on `depositWindowSeconds` in `createBattle()`.

**Frontend Work**: None.

**Backend / Contract Work**:

- `contracts/BattleTreasury.sol` (primary file):
  - Add new storage near the top-level mappings (around line 55-93 area):
    ```solidity
    mapping(address => uint256) public pendingRefunds;
    ```
  - Add new events (append to events section ~line 148):
    ```solidity
    event RefundCredited(bytes32 indexed battleId, address indexed to, uint256 amount);
    event RefundClaimed(address indexed to, uint256 amount);
    ```
  - Add new error: `error NoPendingRefund();`
  - In `createBattle` (lines 298-332): after the existing `if (depositWindowSeconds < 1 hours) revert InvalidAmount();` add:
    ```solidity
    uint256 public constant MAX_DEPOSIT_WINDOW = 7 days;
    if (depositWindowSeconds > MAX_DEPOSIT_WINDOW) revert InvalidAmount();
    ```
    (Place the constant at the top with other constants near line 96.)
  - Refactor the active-battle timeout branch inside `refund()` (currently lines 536-554):
    - Capture amounts into locals.
    - Zero both `creatorDeposit` and `challengerDeposit`.
    - Set `settled = true; state = Settled;`.
    - Credit `pendingRefunds[battle.creator] += creatorAmount;` and same for challenger.
    - Emit `RefundCredited` for each (or a single batch event).
    - Remove the two direct `call` transfers and the `require` that could revert the whole tx.
  - In `claim()` (lines 453-494): after calculating `totalPot`, `winnerAmount`, fees, and immediately after `battle.settled = true; battle.state = Settled;` (before any external calls), zero the deposits:
    ```solidity
    uint256 creatorDep = battle.creatorDeposit;
    uint256 challengerDep = battle.challengerDeposit;
    battle.creatorDeposit = 0;
    battle.challengerDeposit = 0;
    ```
    (Use the locals for the pot math if needed; the rest of the function is unchanged.)
  - In the one-sided deposit refund path (already zeros at 522-523) — add a comment noting it remains push-based because only one party can be affected by their own receiver.
  - Add the pull function after `refund()`:
    ```solidity
    function claimRefund() external nonReentrant {
        uint256 amount = pendingRefunds[msg.sender];
        if (amount == 0) revert NoPendingRefund();
        pendingRefunds[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) {
            pendingRefunds[msg.sender] = amount; // recredit on failure
            revert("Refund claim failed");
        }
        emit RefundClaimed(msg.sender, amount);
    }
    ```
  - Update all affected view helpers (`getPotBalance`, `getCurrentPot`, `getBattleParticipantInfo`, `isClaimable`, `isRefundable`) — they already read the deposit fields, so after zeroing they will correctly report 0 for settled battles. Add a comment in each explaining post-settlement zeroing.
  - Update NatSpec for `refund()`, `claim()`, and the new `claimRefund()` (including the one-sided vs two-party distinction).

- `contracts/USER_INTERACTION_GUIDE.md`: add a new subsection under Battle refunds explaining the `claimRefund()` flow for post-deadline active battles and the fact that deposits are now cleared on settlement.

**Deliverables**:
- `BattleTreasury.sol` contains `MAX_DEPOSIT_WINDOW`, the `pendingRefunds` mapping, `claimRefund()`, the refactored active-timeout branch that never performs a direct transfer, and zeroing of both deposit fields in `claim()` and the active path.
- The one-sided incomplete-deposit refund path remains push (documented).
- All view helpers and the `Battle` struct itself are unchanged in layout.
- Documentation updated for the new user recovery path.

**Dependencies**: None (independent of Phase 1 fee retry).

**Local vs Production Impact** (per `frontend/AGENTS.md`): Pure contract + docs. Verification via root Hardhat.

**Verification Strategy** (per closeout-checklist.md):
- Exact git diff / grep for the new mapping, events, `claimRefund()`, `MAX_DEPOSIT_WINDOW`, zeroing logic, and updated views.
- Manual Hardhat test: create battle → both deposit → let it go past resolutionDeadline → call refund() → confirm no direct transfers happen, deposits are zeroed, pendingRefunds are credited, events emitted.
- Call `claimRefund()` from each participant and confirm funds arrive (with recredit-on-failure behavior).
- Confirm the one-sided deposit refund path is unchanged (push-based, documented).
- Confirm `MAX_DEPOSIT_WINDOW` enforcement in createBattle.

## Handoff Log

### Orchestrator → Backend Implementer (2026-05-31, start of Phase 2)
- You are responsible for **all** Backend/Contract items in Phase 2 (BattleTreasury.sol primary + one small USER_INTERACTION_GUIDE.md subsection).
- Frontend has zero work.
- Read the full approved `build-plan.md` (Phase 2 section) and `closeout-checklist.md` (Phase 2 section) before touching code.
- Refactor carefully — the active timeout refund path must no longer perform any direct ETH transfers that can revert the whole tx.
- After changes: run `npx hardhat compile --force`, append detailed notes + the exact "**Backend Phase 2 Ready for Verification**" marker, and write `summaries/phase-2-backend.md`.
- Do not declare the phase done yourself.

### Backend Implementer Notes
(Implementer will append dated entries here)

**Backend Implementer Notes (2026-05-31)**

**Pre-work (mandatory reads completed before first edit):**
- Read full approved `build-plan.md` (Phase 2 section + Overview + Out of Scope + Local vs Production Impact + Success Criteria) verbatim, including the exact code shapes for pendingRefunds, events, MAX_DEPOSIT_WINDOW, the claim zeroing snippet, the active-timeout refactor description, claimRefund body, view helper comments, and NatSpec updates.
- Read entire `closeout-checklist.md` Phase 2 section (the immutable binary pass/fail contract for verifier, including the exact git/grep commands and the blocking-participant Hardhat script requirements).
- Read current `coordination/phase-2.md` (including the "exact work" list).
- Read `contracts/BattleTreasury.sol` in full (767 lines pre-edit) with focused re-reads on: createBattle (min check), the Battle struct (deposits + settled + state), refund() entire (one-sided push at ~558 and active push at ~588), claim() (settled set + transfers), all view helpers (getPot*, getBattleParticipantInfo, is*, getCurrentPot), claimPendingFees, NatSpec blocks, and Phase 1 additions (for append-only placement).
- Read `contracts/USER_INTERACTION_GUIDE.md` (Battle refunds / Getting a Refund section) and the top contract NatSpec.
- Read `frontend/AGENTS.md` in full — confirmed Phase 2 is pure contracts + 1-doc (no API routes, no frontend/src/ or netlify/ or Railway changes, no proxy impact, answers to all 5 mandatory questions are N/A per the plan's own "Local vs Production Impact" section).
- Read `frontend/.grok/runs/phased-build-ec52d84a/idea.md` (contractaudits4 content) for the High finding #2 context on push refunds and the auditor's pull recommendation (used only as background; approved plan shapes took precedence).
- Read prior phase-1 artifacts (verifier phase-1-round-1.md, summaries/phase-1-backend.md, coordination/phase-1.md) for exact evidence style and marker format.
- Confirmed: strictly inside Phase 2 boundaries only. Zero "nice to haves", no other docs, no tests (Phase 5), no other contracts, no storage layout changes, no changes to fee %, TIMELOCK, or happy paths beyond the documented refactor + zeroing. One-sided push path untouched except comment.

**Changes implemented (exact match to build-plan.md Phase 2 "Backend / Contract Work" + coordination excerpt + closeout Phase 2 criteria):**
- `contracts/BattleTreasury.sol` (primary/only .sol):
  - Added `mapping(address => uint256) public pendingRefunds;` near other pending* (after pendingFeeWithdrawals) with full Phase 2 comment explaining the griefing closure + one-sided distinction.
  - Appended two events after Phase 1 events (before Errors): exact `RefundCredited(bytes32 indexed battleId, address indexed to, uint256 amount);` and `RefundClaimed(address indexed to, uint256 amount);` with explanatory comment.
  - Added `error NoPendingRefund();` in Errors section.
  - Placed `uint256 public constant MAX_DEPOSIT_WINDOW = 7 days;` at top with other constants (after TIMELOCK_DELAY) + comment.
  - Enforcement in createBattle(): `if (depositWindowSeconds > MAX_DEPOSIT_WINDOW) revert InvalidAmount();` immediately after the existing 1h min check.
  - Refactored the active-battle timeout branch (the if Active && pastResolutionDeadline inside refund()): 
    - Capture to locals (creatorAmount, challengerAmount, total).
    - Zero BOTH deposit fields (checks-effects before state change + external).
    - Set settled=true and state=Settled.
    - Credit `pendingRefunds[creator] +=` and same for challenger.
    - Emit `RefundCredited` once per party (per "for each").
    - **Removed every direct .call and require** — no longer can revert the tx on a bad receiver. (The one-sided AwaitingDeposits path untouched in logic.)
  - Added the one-sided comment inside the AwaitingDeposits block: "One-sided refund path remains push-based per Phase 2 design (only self can be impacted by a reverting receiver on this path)."
  - In `claim()`: immediately after `battle.settled = true; battle.state = ...` (before winner/fee calls), inserted the exact zeroing block from plan using the two local uints (creatorDep / challengerDep). Added surrounding comment referencing the High finding + view helper correctness. (Pot math locals already above as required.)
  - Added the full `claimRefund()` pull function (with nonReentrant, the exact body from plan using NoPendingRefund + recredit-on-failure + string revert + RefundClaimed emit) placed directly after refund()'s closing }.
  - Updated NatSpec on `refund()` (full rewrite documenting one-sided push vs two-party pull distinction + safety), on `claim()` (added zeroing explanation), and added detailed NatSpec on the new `claimRefund()`.
  - Updated **all 5 listed view helpers** with explanatory Phase 2 comments on post-settlement zeroing (getPotBalance, getCurrentPot, getBattleParticipantInfo (NatSpec + inline), isClaimable, isRefundable). getBattle also benefits implicitly.
- `contracts/USER_INTERACTION_GUIDE.md`:
  - Added new subsection "**Phase 2: Active-Battle Timeout Refunds (Pull Model) and Deposit Zeroing**" directly under the existing "Getting a Refund" bullets (before Helpful View Functions). Covers claimRefund flow, the griefing closure, deposit zeroing effect on views, and one-sided vs two-party distinction.
  - Updated the file's "Last Updated" header to reference the Phase 2 addition.

**Verification steps executed (before claiming readiness):**
- All edits used precise search_replace after fresh reads; changes are append-only for storage/events (pre-deployment safe, no layout corruption).
- Followed existing patterns exactly: nonReentrant on new external, checks-effects-interactions (zero before sets/calls), recredit-on-fail in claimRefund mirroring the Phase 1 retryPendingFee pattern, custom error + events style, 2-day timelock reuse (not touched here), NatSpec conventions.
- Ran `npx hardhat compile --force` (repo root) — exit 0, "Compiled 51 Solidity files successfully (evm target: paris)." (See full output in summaries/phase-2-backend.md. Minor unused-var warnings on the two locals we added per the plan's literal zeroing snippet; pre-existing markActive warning unchanged. Zero errors on BattleTreasury.sol.)
- Confirmed via reads: no other files touched (no frontend, no api/, no db/, no other .sol, no deployments, no config, no tests).
- AGENTS.md compliance: zero impact on Netlify/Railway proxy, local dev, apiBase, etc. (pure on-chain; verification is root Hardhat only).
- The active-timeout refund path **never** performs a direct transfer that can revert the whole tx (the key requirement stated in the user query and plan).
- Scope: exactly the items listed; the second High finding (push active refunds) is directly closed by the pull refactor + claimRefund + zeroing.

**Handoff / Coordination**:
- This entry + the required `summaries/phase-2-backend.md` (with compile output, git-diff pointers, per-file details) fulfill the Backend deliverables.
- Per persona: "When your side of the phase is complete, write 'Backend Phase 2 Ready for Verification' into the coordination file and produce the required summary file."
- Frontend side already marked N/A + "Frontend Phase 2 Ready for Verification" (per their summary and the stub note above).
- Do not declare phase complete — only the plan-verifier can after running the exact Phase 2 section of closeout-checklist.md (git diff -U0 for MAX/pendingRefunds/claimRefund/zeroing, greps, compile tail, and the full manual Hardhat blocking-participant transcript with reverting mock + claimRefund success for good side + pending reads + getPotBalance==0).

**Backend Phase 2 Ready for Verification**

(2026-05-31, Backend/Contract Implementer — all Phase 2 Backend/Contract items from approved build-plan.md and coordination/phase-2.md delivered exactly, cleanly, and with full auditability. The active timeout refund is now pull-only; deposit zeroing and MAX_DEPOSIT_WINDOW enforcement are in; docs updated. Verifier: use the closeout commands and the blocking scenario script.)

---

**Current Phase Status**: Backend execution complete. Marker written. Awaiting plan-verifier (Frontend side N/A).

## Frontend → Backend (2026-05-31)
- Phase 2: Per approved build plan, Frontend Work = "None".
- No files in src/, components/, pages/, or any frontend directory were modified (and none were required).
- No API contract changes, no new calls through apiBase.ts.
- Frontend side of Phase 2 is complete by definition (N/A).
- Frontend Phase 2 Ready for Verification.