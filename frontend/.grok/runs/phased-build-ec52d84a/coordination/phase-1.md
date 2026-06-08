# Phase 1 Coordination — Failed Fee Recovery Hardening Across All Three Contracts

**Phase**: 1 of 5 (from approved build-plan.md for contractaudits4.md remediation)
**Started**: 2026-05-31
**Status**: In Progress

## Phase Scope (exact excerpt from approved build-plan.md)

**Goal**: Eliminate the permanent-stranding risk for protocol and league fees when a receiver contract rejects plain ETH transfers by adding the exact `retryPendingFee(address receiver)` anyone-callable retry (with recredit-on-failure) plus a timelocked owner-only `redirectStuckFee`-style rescue path for fee-only funds, in every contract that uses the `pendingFeeWithdrawals` pattern.

**Frontend Work**: None (pure contract + docs remediation — no UI, no client state, no API client changes).

**Backend / Contract Work** (exact locations and patterns):

- `contracts/BattleTreasury.sol`
  - Add after the existing `claimPendingFees()` (around line 667, before the final `}`):
    - New error (if not already present): `error FeeRetryFailed();`
    - New events (append to events section near line 141):
      ```solidity
      event PendingFeeRedirectProposed(address indexed oldReceiver, address indexed newReceiver, uint256 amount, uint256 executeAfter);
      event PendingFeeRedirectExecuted(address indexed oldReceiver, address indexed newReceiver, uint256 amount);
      event PendingFeeRedirectCancelled();
      event FeeRetrySucceeded(address indexed receiver, uint256 amount);
      ```
    - New storage (append near other Pending* declarations, around line 117):
      ```solidity
      struct PendingFeeRedirect {
          address oldReceiver;
          address newReceiver;
          uint256 amount;
          uint256 executeAfter;
          bool exists;
      }
      PendingFeeRedirect public pendingFeeRedirect;
      ```
    - Implement the two new functions (following the auditor's pseudocode exactly, plus timelock + nonReentrant + events):
      - `function retryPendingFee(address receiver) external nonReentrant`
      - `function proposeFeeRedirect(address oldReceiver, address newReceiver, uint256 amount) external onlyOwner`
      - `function executeFeeRedirect() external onlyOwner`
      - `function cancelPendingFeeRedirect() external onlyOwner`
  - Update the NatSpec comment block for `claimPendingFees` (lines 657-658 area) and the top-level fee section to document the new retry + redirect paths.
  - Add a short comment at the `pendingFeeWithdrawals` declaration (line 93) referencing the new recovery functions.

- `contracts/MajorLeagueTreasury.sol` — identical treatment:
  - Add the same four functions + events + PendingFeeRedirect struct + storage (place after the existing `claimPendingFees` at lines 322-330 and near the other Pending* structs around line 363).
  - Update NatSpec for `claimPendingFees` (line 320) and the fee accounting comment (line 60).
  - The `receiveBattleCut` and `receiveSponsorshipCut` paths already credit `pendingFeeWithdrawals` on failure; the new retry will cover them.

- `contracts/SponsorshipPayments.sol` — identical treatment:
  - Add the same four functions + events + struct (after `claimPendingFees` at lines 264-272, near PendingChange structs at top).
  - Update NatSpec (line 262) and the fee credit comment block (lines 171-187 area).
  - Note: SponsorshipPayments already uses the non-blocking pattern for its two fee legs.

- `contracts/TRUST_MODEL.md` — add a short subsection under "Fee Receiver Failure Recovery" describing the new anyone-retry + owner-timelocked redirect (fee funds only, not user principal).

**Deliverables**:
- The three contracts each expose `retryPendingFee(address)` and the full timelocked `propose/execute/cancel` redirect trio with matching events.
- The retry function exactly matches the auditor's recommended body (zero the mapping, attempt `call{value}`, re-set on failure).
- The redirect path is restricted to fee amounts recorded in `pendingFeeWithdrawals` and is itself protected by the existing 2-day timelock + cancel pattern already used for receivers and distributors.
- Inline documentation updated so a reader knows when to use `retryPendingFee` vs the old `claimPendingFees`.
- One coordination note in `coordination/phase-1.md` (populated by implementer).

**Dependencies**: None (highest-priority, self-contained, touches all three files in parallel-friendly way).

**Local vs Production Impact** (per `frontend/AGENTS.md`):
- Pure on-chain Solidity + docs changes only.
- Verification via root `npm run compile` + targeted Hardhat scripts (no frontend involvement).

**Verification Strategy** (per closeout-checklist.md):
- Exact git diff / grep for the new functions, struct, events in all three contracts.
- Hardhat test that `retryPendingFee` works for both success and failure cases (recredit on failure).
- Test that the timelocked redirect works (owner can propose/execute/cancel, non-owner cannot).
- Evidence that the new paths cover failed fees from `receiveBattleCut`/`receiveSponsorshipCut` in MajorLeague and the fee legs in SponsorshipPayments.

## Handoff Log

### Orchestrator → Backend Implementer (2026-05-31, start of Phase 1)
- You are responsible for **all** Backend/Contract items in Phase 1 (the three contracts + the one small TRUST_MODEL.md update).
- Frontend has zero work — you do not need to wait for any frontend handoff.
- Read the full approved `build-plan.md` (Phase 1 section) and the `closeout-checklist.md` (Phase 1 section) **before touching any code**.
- Follow the auditor's exact pseudocode for `retryPendingFee`.
- Make the **smallest possible, pattern-consistent changes** that satisfy the checklist.
- After changes: run `npx hardhat compile --force`, append detailed notes + the exact "**Backend Phase 1 Ready for Verification**" marker to this coordination file, and write the required summary to `summaries/phase-1-backend.md`.
- Do **not** declare the phase done yourself. Only the plan-verifier can close it.

### Backend Implementer Notes
(Implementer will append dated entries here)

---

**Current Phase Status**: Awaiting Backend Implementer execution + readiness marker. (Frontend side will be N/A.)

## Frontend → Backend (to be added by frontend implementer stub)

## Frontend → Backend (2026-05-31)
- Phase 1: Per approved build plan, Frontend Work = "None".
- No files in src/, components/, pages/, or any frontend directory were modified (and none were required).
- No API contract changes, no new calls through apiBase.ts.
- Frontend side of Phase 1 is complete by definition (N/A).

### Backend Implementer Notes (2026-05-31)

**Pre-work (mandatory reads completed before first edit):**
- Read full approved `build-plan.md` (Phase 1 section + Cross-Cutting + Out of Scope) verbatim.
- Read entire `closeout-checklist.md` Phase 1 section (binary pass/fail criteria).
- Read current `coordination/phase-1.md`.
- Read the three contracts in full with focus on `pendingFeeWithdrawals` + `claimPendingFees` + timelock patterns (BattleTreasury.sol:669 lines, MajorLeagueTreasury.sol:422 lines, SponsorshipPayments.sol:274 lines).
- Read `frontend/AGENTS.md` in full — confirmed Phase 1 is 100% out of scope for any frontend/src/, api/, netlify/, etc. (zero impact, no proxy concerns).
- Read `idea.md` (contractaudits4.md content) for the exact auditor pseudocode on `retryPendingFee`.
- Read `TRUST_MODEL.md` and all other Phase 1 mandatory docs.
- Confirmed: strictly inside plan boundaries. No "nice to haves", no test files, no other contracts, no docs beyond the one specified TRUST_MODEL update.

**Changes implemented (exact match to build-plan.md Phase 1 "Backend / Contract Work" and coordination excerpt):**
- **BattleTreasury.sol**:
  - Added `error FeeRetryFailed();` in Errors section.
  - Appended 4 events to events section (after Pass 3 cancellations): `PendingFeeRedirectProposed`, `PendingFeeRedirectExecuted`, `PendingFeeRedirectCancelled`, `FeeRetrySucceeded`.
  - Added `PendingFeeRedirect` struct + `pendingFeeRedirect` storage after `pendingAuthorizedCreatorChange` (append-only, pre-deployment safe).
  - Added short comment at `pendingFeeWithdrawals` declaration referencing the new recovery functions.
  - Expanded top-level FEE CONFIG comments and `claimPendingFees` NatSpec (lines ~656 area) to document retry + redirect paths.
  - Added the 4 functions (`retryPendingFee`, `proposeFeeRedirect`, `executeFeeRedirect`, `cancelPendingFeeRedirect`) **after** `claimPendingFees()`, before final `}`. 
  - `retryPendingFee` body: exact auditor pseudocode (zero mapping first, `call{value}`, re-set + revert on fail) + `nonReentrant` + `FeeRetrySucceeded` emit on success + custom error.
  - Redirect path: owner-only, uses existing `TIMELOCK_DELAY` (2 days), `onlyOwner`, checks amount <= pendingFeeWithdrawals at propose/execute (fee-amounts-only), defensive re-check in execute.
  - All per "place after claimPendingFees", "follow auditor's recommended body", "timelocked + owner-only + fee-amounts-only", "Update NatSpec and add the requested short comments".

- **MajorLeagueTreasury.sol** (identical treatment):
  - Same error + 4 events + struct/storage (added near other `Pending*` after `pendingDistributorChange`).
  - Updated `pendingFeeWithdrawals` comment (fee accounting at original line 60) + `claimPendingFees` NatSpec (original line 320).
  - 4 functions placed after `claimPendingFees()` (original ~322-330 area). Same bodies and protections.
  - Note: `receiveBattleCut` / `receiveSponsorshipCut` already credit on failure; new retry covers them (per plan).

- **SponsorshipPayments.sol** (identical treatment):
  - Same error + 4 events + struct/storage (near top `PendingChange` structs).
  - Updated `claimPendingFees` NatSpec (original line 262) + fee credit comment block (lines 171-187 area, added Phase 1 note).
  - 4 functions after `claimPendingFees()` (original ~264-272). Same logic.
  - Note in plan: "already uses the non-blocking pattern for its two fee legs."

- **contracts/TRUST_MODEL.md**:
  - One small targeted update: added short subsection "Fee Receiver Failure Recovery (Phase 1 remediation — contractaudits4.md High finding)" under the recovery paths area (after "Bug in fee calculation" scenario, before "Off-Chain Dependencies"). Describes `retryPendingFee` (anyone) and the timelocked redirect (owner, fee funds exclusively). Matches closeout and plan exactly. No other changes to this or any other .md.

**Verification steps executed (before claiming readiness):**
- Ran `npx hardhat compile --force` (repo root) — exit 0, "Compiled 51 Solidity files successfully (evm target: paris)." No errors on the three contracts. (Pre-existing unrelated warning on markActive captured.)
- All changes are append-only for events/storage. Follow existing patterns (nonReentrant, require checks, delete pending, emit style from Pass 3, TIMELOCK_DELAY reuse).
- No frontend files touched (confirmed via directory inspection and explicit AGENTS.md compliance).
- No backend routes, no db/, no other contracts, no package/config changes.
- Scope strictly limited to the 3 .sol + 1 small TRUST_MODEL subsection listed in the approved plan.

**Handoff / Coordination**:
- Frontend side already marked N/A in this file (per their stub entry).
- This entry + the `summaries/phase-1-backend.md` constitute the required deliverables for Backend.
- Per persona and plan: "When your side of the phase is complete, write 'Backend Phase 1 Ready for Verification' into the coordination file and produce the required summary file."
- Do not declare phase complete — only the plan-verifier can after running the exact checklist (git diff, grep, compile tail, manual Hardhat retry transcript).

**Backend Phase 1 Ready for Verification**

(2026-05-31, Backend Implementer — all plan items for Phase 1 Backend/Contract work delivered exactly as specified, no deviations.)
- Frontend Phase 1 Ready for Verification.