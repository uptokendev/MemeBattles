# Phase 3 Coordination — Operational Polish (Timelock Cancellations, BattleCutReceived Event, Compile Hygiene, Documentation)

**Phase**: 3 of 3 (from approved build-plan.md)
**Started**: 2026-05-31
**Status**: In Progress
**Dependencies**: Phases 1 and 2 must be complete (EIP-712 fix + non-blocking fees in SponsorshipPayments)

## Phase Scope (exact excerpt from approved build-plan.md)

**Goal**: Address the remaining low-severity operational findings from Pass 3 (no cancellation for pending timelock proposals, missing dedicated `BattleCutReceived` event, stale compile error in the deprecated stub, and documentation drift) so the contracts are easier to operate safely and the monorepo builds cleanly for verification/audit.

**Frontend Work**: None (pure contract security fixes — no UI or client changes required)

**Backend / Contract Work**:
- **Timelock cancellation (all three contracts)**:
  - Add near the existing events in each file:
    - `BattleTreasury.sol`: `event PendingProtocolFeeReceiverCancelled();`, `event PendingSeasonalTreasuryReceiverCancelled();`, `event PendingResolverCancelled();`
    - `MajorLeagueTreasury.sol`: `event PendingProtocolFeeReceiverCancelled();`, `event PendingSeasonalTreasuryReceiverCancelled();`, `event PendingDistributorChangeCancelled();`
    - `SponsorshipPayments.sol`: `event PendingProtocolFeeReceiverCancelled();`, `event PendingSeasonalTreasuryReceiverCancelled();`
  - Add the corresponding cancel functions (onlyOwner, after the matching execute* functions, following the same style):
    - `BattleTreasury.sol`: `cancelPendingProtocolFeeReceiver()`, `cancelPendingSeasonalTreasuryReceiver()`, `cancelPendingResolver()`
    - `MajorLeagueTreasury.sol`: the two receiver cancels + `cancelPendingDistributorChange()`
    - `SponsorshipPayments.sol`: the two receiver cancels
  - Implementation for each (example for Battle):
    ```solidity
    function cancelPendingProtocolFeeReceiver() external onlyOwner {
        delete pendingProtocolFeeReceiver;
        emit PendingProtocolFeeReceiverCancelled();
    }
    ```
    (Delete even if `exists` was false; emit unconditionally or only when a pending existed — either is acceptable; keep minimal.)
  - No changes to `TIMELOCK_DELAY` or propose/execute logic.
- **Dedicated Battle cut event (MajorLeagueTreasury.sol only)**:
  - Add event (near `SponsorshipCutReceived` around line 71):
    ```solidity
    event BattleCutReceived(bytes32 indexed battleId, bytes32 indexed poolId, uint256 amount);
    ```
  - In `receiveBattleCut` (lines 186-197): after the poolId / unallocated branching and the existing `PrizeFunded` emit (when applicable), always emit the new dedicated event:
    ```solidity
    emit BattleCutReceived(battleId, poolId, msg.value);
    ```
  - The generic `PrizeFunded` emit remains for backward compatibility where it already fires.
- **Compile stub hygiene (drive-by)**:
  - File: `contracts/LeagueTreasury.sol`
  - Remove all orphaned code after the closing `}` of the `LeagueTreasury` contract (everything from the current line 15 onward). Leave only the SPDX, pragma, NatSpec deprecation block, and the empty `contract LeagueTreasury { }` (or with a single revert-only constructor if desired). This makes the file a valid, compiling stub that still prevents accidental use while unblocking `npm run compile` for the entire monorepo.
- **Documentation updates** (only the files explicitly referenced in the idea + SECURITY_AUDIT_REPORT.md):
  - `contracts/SECURITY_AUDIT_REPORT.md`: Append a new section `## Pass 3 Remediation (phased-build-267caf05)` after the existing "Recommended Next Steps". List the two blocking issues as now Fixed, plus the Phase 3 polish items. Update the Executive Summary risk paragraph and the "Fixes Applied" bullets. Add a note that this remains an internal review.
  - `contracts/TRUST_MODEL.md`: In the "2. Battle Resolver" subsection, replace the outdated single-sentence description of the signed data with the accurate full struct description and explicit requirement to use standard EIP-712 `signTypedData` (not personal_sign). Update the "Last Updated" / version line.
  - `contracts/USER_INTERACTION_GUIDE.md`: Add a short subsection under "3. SponsorshipPayments" titled "Claiming Pending Fees (Protocol / League operators)" that documents the new `claimPendingFees()` surface and references the `FeeTransferFailed` event. Add one sentence under "For Frontend Developers" or "General Best Practices" noting the new `BattleCutReceived` event for league revenue tracking. Update any "Last Updated" if present.
  - `contracts/POSTGRAD_REVENUE_DECISION_TABLE.md` and `contracts/POSTGRAD_TREASURY_ARCHITECTURE.md`: Append a single-sentence note in the PostGrad / Sponsorships row or "New PostGrad Contracts" section: "As of the Pass 3 security remediation, fee transfers inside `SponsorshipPayments.payForSponsorship` are non-blocking (using the same `pendingFeeWithdrawals` + `claimPendingFees` pattern as BattleTreasury and MajorLeagueTreasury)."
  - No other documentation files are modified.

**Deliverables**:
- Cancel functions + matching cancellation events present and functional in all three treasury contracts.
- `BattleCutReceived` event declared and emitted from `MajorLeagueTreasury.receiveBattleCut`.
- `contracts/LeagueTreasury.sol` is now a clean, compiling empty stub (full monorepo `npm run compile` succeeds with no unrelated errors).
- The four (plus one) documentation files contain the precise updates listed above, with clear "Pass 3 remediation" or "security hardening" markers.
- No behavior change to any happy-path or existing event signatures for non-fee-failure flows.

**Local vs Production Impact** (from plan):
- N/A — only Solidity source and documentation updated. No effect on Vite/Netlify/Railway/API routing.
- After Phase 3 the monorepo `npm run compile` target becomes green.

**Verification Strategy** (per closeout-checklist.md):
- Grep + git diff for all new events and cancel functions across the three contracts.
- Hardhat test that owner can cancel and non-owner reverts.
- Manual test for `BattleCutReceived` emission (via direct call or BattleTreasury claim).
- Full `npm run compile` (or hardhat compile) succeeds with zero errors.
- Exact text matches for the five documentation updates (quote the added sections/paragraphs/sentences).
- Global `git diff --stat` + `--name-only` confirms only the allowed files were touched.

## Handoff Log

### Orchestrator → Backend Implementer (2026-05-31, start of Phase 3)
- You are responsible for **all** Backend/Contract items in Phase 3 (contracts + the five specific .md documentation files).
- Frontend has zero work (per plan).
- Phases 1 and 2 are verified complete — you are building on top of the hardened surfaces (EIP-712 fix + non-blocking fees + `pendingFeeWithdrawals` in SponsorshipPayments).
- Read the full approved `build-plan.md` (Phase 3 section) and the `closeout-checklist.md` (entire Phase 3 section) **before any edits**.
- Make the changes minimal and mechanical, following existing code style exactly.
- After changes:
  - Run `npx hardhat compile --force` (or `npm run compile`) at root and capture success.
  - Update this coordination file with detailed notes + the exact marker "**Backend Phase 3 Ready for Verification**".
  - Produce the required summary at `summaries/phase-3-backend.md`.
- Do **not** declare the phase done. Only the plan-verifier can close it.
- Global constraint: `git diff --name-only` at the end must touch only the three contracts + the five explicitly listed .md files.

### Backend Implementer Notes
(Implementer will append dated entries here)

---

**Current Phase Status**: Awaiting Backend Implementer execution + readiness marker. (Frontend side will be N/A.)

## Frontend → Backend (2026-05-31)
- Phase 3: Per approved build plan, Frontend Work = "None".
- No files in src/, components/, pages/, or any frontend directory were modified (and none were required).
- No API contract changes, no new calls through apiBase.ts.
- Frontend side of Phase 3 is complete by definition (N/A).
- Frontend Phase 3 Ready for Verification.

## Backend Implementer Notes (2026-05-31, Phase 3 execution)

All mandatory first reads completed before any edits (build-plan.md full Phase 3 + cross-cutting + out-of-scope; closeout-checklist.md entire Phase 3; coordination/phase-3.md; the three contracts; the five .md docs; LeagueTreasury.sol stub; frontend/AGENTS.md).

**Changes implemented (exact per approved plan, minimal/mechanical, "Pass 3 remediation" markers where specified):**
- BattleTreasury.sol: 3 cancellation events (PendingProtocolFeeReceiverCancelled etc.) added near events; 3 cancelPending*() onlyOwner functions added immediately after the matching execute* functions (delete + emit; no timelock changes).
- MajorLeagueTreasury.sol: 3 cancel events (incl. PendingDistributorChangeCancelled) + 3 cancel functions (distributor cancel after its execute early in file; receiver cancels after their executes at bottom); `event BattleCutReceived(bytes32 indexed battleId, bytes32 indexed poolId, uint256 amount);` added near SponsorshipCutReceived; emitted unconditionally at end of receiveBattleCut() (PrizeFunded retained).
- SponsorshipPayments.sol: 2 cancel events + 2 cancelPending*() after the execute* functions.
- LeagueTreasury.sol: All orphaned code after the closing `}` stripped (lines 15+ removed); now clean SPDX + pragma + deprecation block (adjusted @deprecated tag to plain text for valid NatSpec) + `contract LeagueTreasury {}`. (Drive-by compile hygiene only.)
- All 5 docs updated with precise text additions:
  - SECURITY_AUDIT_REPORT.md: new `## Pass 3 Remediation (phased-build-267caf05)` section after Recommended Next Steps (lists blockers fixed + polish items); Exec Summary risk + status bullets + Fixes Applied extended; internal review note.
  - TRUST_MODEL.md: "2. Battle Resolver" fully replaced with 8-field struct + strict `signTypedData` (not personal_sign) requirement + cross-ref to Pass 3 cancel; version/Last Updated updated.
  - USER_INTERACTION_GUIDE.md: new subsection "Claiming Pending Fees (Protocol / League operators) — Pass 3 remediation" under 3. SponsorshipPayments (docs claimPendingFees + FeeTransferFailed); sentence added in For Frontend Developers re BattleCutReceived for league revenue tracking; top Last Updated added.
  - POSTGRAD_REVENUE_DECISION_TABLE.md + POSTGRAD_TREASURY_ARCHITECTURE.md: exact one-sentence note appended in the Sponsorships / New PostGrad Contracts areas.
- No behavior changes to happy paths, no storage layout shifts, no fee BPS / TIMELOCK_DELAY / role changes, no out-of-scope contracts touched.
- Strictly followed frontend/AGENTS.md (pure root contract + docs work; no frontend/src, no api/, no netlify/vite changes, no direct fetches).
- Ran `npx hardhat compile --force` at root: **Compiled 51 Solidity files successfully** (0 errors; pre-existing minor warning on markActive unrelated). Full monorepo now green post-stub fix.

**Verification evidence prepared for plan-verifier**:
- git diff will show only the 3 contracts + 5 contracts/*.md (plus this coordination + required summary as process artifacts).
- All closeout checklist Phase 3 items addressed with exact matches (events, functions after executes, emit location, stub hygiene for zero-error compile, quoted doc additions).
- No deviations from build-plan.md Phase 3 description.

**Backend Phase 3 Ready for Verification**

(The verifier must now produce verifier-reports/phase-3-round-*.md with 100% PASS citations. Do not mark complete until then.)