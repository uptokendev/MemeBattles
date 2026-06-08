# Phase 4 Closeout Report — Sponsorship ID Uniqueness + Event Schema Completion + Timelock Observability

**Phase**: 4 (Sponsorship ID Uniqueness + Event Schema Completion + Timelock Observability — PostGrad Treasury Security Remediation, phased-build-ec52d84a)  
**Date of Verification**: 2026-06-01  
**Verifier**: Strict Plan-Verifier (impartial, evidence-only)  
**Linked Artifacts**:
- Approved `build-plan.md` (Phase 4 section + Cross-Cutting + Out of Scope + Local vs Production Impact + AGENTS.md compliance questions)
- `closeout-checklist.md` (full Phase 4 section — the immutable contract)
- `coordination/phase-4.md` (Frontend N/A marker + detailed Backend execution log + "**Backend Phase 4 Ready for Verification**" + "**Frontend Phase 4 Ready for Verification**" markers + explicit scope note limiting backend work to SponsorshipPayments.sol + BattleTreasury.sol only)
- `summaries/phase-4-backend.md` (complete; documents exact scope, changes, compile evidence, verification pointers, and push-back rule adherence)
- `summaries/phase-4-frontend.md` (exists; documents N/A scope correctly)
- Actual changed files: `contracts/SponsorshipPayments.sol`, `contracts/BattleTreasury.sol` (MajorLeagueTreasury.sol untouched per coordination handoff)
- Supporting: `frontend/AGENTS.md`, root `package.json`, `hardhat.config.ts` (all inspected)
- Commands executed: `npx hardhat compile --force` (clean), dedicated `grep` tool searches + full file reads (with line numbers), manual runtime verification via temporary exercising script (run + full event transcript captured + cleaned), git status checks
- Runtime evidence: Full transcript of duplicate sponsorshipId revert (exact `SponsorshipAlreadyPaid`), expanded `SponsorshipPaid` + `BattleCreated` events, and all 12 Proposed/Executed events (6 categories × propose + execute) firing with correct indexed args and values from the two in-scope contracts

---

## Verdict

**NEEDS WORK (NOT READY TO CLOSE)**

Phase 4 implementation on the two in-scope contracts (`SponsorshipPayments.sol` and `BattleTreasury.sol`) is plan-literal, append-only, and passes every static, compile, AGENTS.md, and runtime behavioral check for the items that were actually implemented. The sponsorshipId uniqueness guard + error, the two expanded events with all required fields (payer/poolId/cumulative and stake/resolution/seasonalPoolId), and the complete set of Proposed/Executed events for all timelock categories in those two contracts (plus correct emits from every propose/execute function) have been **personally confirmed** via code inspection + a full end-to-end Hardhat runtime transcript that exercised createBattle, duplicate payForSponsorship (revert proof), payForSponsorship (event proof), and every timelock path with time-warps.

However, the Phase 4 section of `closeout-checklist.md` explicitly lists deliverables for **all three contracts**, including:
- `SponsorshipCutReceived` expansion (add `poolId`) and richer distributor + source Proposed/Executed events in `MajorLeagueTreasury.sol`.

These were never performed. The coordination/phase-4.md handoff (which both implementers followed) explicitly scoped backend work to "SponsorshipPayments.sol + BattleTreasury.sol" only and documented "MajorLeagueTreasury changes explicitly deferred / out of this phase's backend deliverables". The build-plan.md Phase 4 text does list MajorLeague items. This creates an irreconcilable mismatch between the immutable checklist and the executed scoped plan.

`verifier-reports/phase-4.md` (vs. the round-1.md path used here) is also a minor naming mismatch with the checklist gate text.

Result: multiple checklist items are FAIL (or would be PARTIAL if "scoped out" were accepted, but checklist is the contract). No blocking code bugs or regressions; the substance for the two contracts is ready. Requires either (a) a coordination-approved scope adjustment + updated checklist or (b) a follow-up round that completes the MajorLeague items before 100% PASS can be declared.

AGENTS.md fully respected (all questions N/A; zero surface impact outside root Hardhat verification of pure contract changes).

---

## Per-Item Status + Evidence (Phase 4 Section of closeout-checklist.md)

### Contract Deliverables — All Three Contracts

**Exact checklist text**:
> `SponsorshipPayments.sol`:
>   - `mapping(bytes32 => bool) public sponsorshipPaid;` declared.
>   - Guard `if (sponsorshipPaid[sponsorshipId]) revert ...; sponsorshipPaid[...] = true;` present inside `payForSponsorship` before any state changes or transfers.
>   - `SponsorshipPaid` event definition now includes `payer`, `poolId`, and `cumulativePaid`.
>   - The emit site passes `msg.sender`, `poolId`, and the cumulative value.

**Status**: PASS

**Evidence**:
- Dedicated `grep` tool (pattern: `sponsorshipPaid|SponsorshipAlreadyPaid|SponsorshipPaid\(`):
  ```
  106:    error SponsorshipAlreadyPaid();
  ...
  201:        if (sponsorshipPaid[sponsorshipId]) revert SponsorshipAlreadyPaid();
  202:        sponsorshipPaid[sponsorshipId] = true;
  ...
  270:    mapping(bytes32 => bool) public sponsorshipPaid;
  ```
- Expanded event definition (full read, lines 64-74):
  ```
  event SponsorshipPaid(
      bytes32 indexed sponsorshipId,
      address indexed payer,
      address indexed recipient,
      bytes32 poolId,
      ...
      uint256 cumulativePaid
  );
  ```
- Emit site (lines 241-252) passes exactly `msg.sender`, `poolId`, `totalPaidPerSponsorship[sponsorshipId]` (post-increment) as the 9th arg.
- NatSpec on `payForSponsorship` (lines 188-193) updated with "Enforced unique on-chain in Phase 4".
- Runtime confirmation (see Manual section transcript): first `payForSponsorship` emitted the full 9-field event with correct payer + poolId + cumulative; second identical ID reverted with `SponsorshipAlreadyPaid` before any effects/transfers.
- Placement: mapping appended after `totalPaidPerSponsorship` declaration (append-only, pre-deployment safe). Guard after min/recipient checks, before splits/transfers (exact per plan + coordination).

**Exact checklist text**:
> `BattleTreasury.sol`:
>   - `BattleCreated` event now includes `stakeAmount`, `resolutionDeadline`, `seasonalPoolId`.
>   - Emit site updated.
>   - Full set of `*Proposed` / `*Executed` events (and emits) exist for protocolFeeReceiver, seasonalTreasuryReceiver, resolver, and authorizedCreator.

**Status**: PASS

**Evidence**:
- Dedicated `grep` tool (pattern: `BattleCreated\(|\.BattleCreated|ProtocolFeeReceiverProposed|...`):
  ```
  155:    event BattleCreated(
  156:        ...
  159:        uint256 stakeAmount,
  160:        uint256 depositDeadline,
  161:        uint256 resolutionDeadline,
  162:        bytes32 seasonalPoolId
  ```
- Emit site (line 413): `emit BattleCreated(battleId, creator, challenger, stakeAmount, depositDeadline, resolutionDeadline, seasonalPoolId);`
- 8 Phase 4 events declared (lines 187-194):
  - `ProtocolFeeReceiverProposed/Executed`, `SeasonalTreasuryReceiverProposed/Executed`, `ResolverProposed/Executed`, `AuthorizedCreatorProposed(..., bool allowed, ...)/Executed(..., bool allowed)`
- All 8 emit sites present in the corresponding 8 timelock functions (grep confirmed at 265, 275, 286, 296, 307, 317, 347, 358). `AuthorizedCreatorUpdated` preserved on execute for compatibility.
- NatSpec on `createBattle` (lines 374-377) updated with Phase 4 schema note.
- Runtime confirmation (see Manual): `createBattle` emitted the full 7-field `BattleCreated` with non-zero stakeAmount, deadlines, and seasonalPoolId. All 8 Proposed/Executed events (4 categories) fired with correct indexed args during the verification script.

**Exact checklist text**:
> `MajorLeagueTreasury.sol`:
>   - `SponsorshipCutReceived` now includes `poolId` in its definition and emit.
>   - `BattleCutReceived` (already good from Pass 3) + new `*Proposed` / `*Executed` events for the two source addresses and the richer distributor change (including limit values in the event).

**Status**: FAIL

**Evidence**:
- File read + grep on `contracts/MajorLeagueTreasury.sol` (lines 74, 78, 210, 245):
  ```
  event SponsorshipCutReceived(bytes32 indexed sponsorshipId, uint256 amount, address indexed from);
  event BattleCutReceived(bytes32 indexed battleId, bytes32 indexed poolId, uint256 amount);
  ```
  - `SponsorshipCutReceived` has **no** `poolId` field and the emit at 210 does not pass one. (This is the exact item the auditor flagged and Phase 4 plan required to expand.)
- For distributor/source Proposed/Executed: Phase 3 events exist (e.g. `BattleTreasurySourceProposed` etc. at 92-95), but the richer distributor change event with limit values is not present in the scope of this phase (no edits to MajorLeagueTreasury.sol occurred). Older protocol/seasonal receiver propose/execute paths still silent (per file comment at ~572: "older protocol/seasonal proposes do not emit yet — Phase 4 scope").
- No git diff / coordination entry shows any Phase 4 edit to this file (status ?? but content inspection + coordination log confirm untouched in this phase).
- Runtime: not exercised (out of explicit coordination scope).

**Exact checklist text**:
> Every timelock category across all three contracts now has matching proposal + execution events emitted from the propose/execute functions. `git diff --stat` + targeted greps on each file confirm the additions.

**Status**: FAIL (for "all three contracts"; PASS for the two in-scope contracts)

**Evidence**:
- For SponsorshipPayments + BattleTreasury: 100% confirmed (see prior items + 12 events in runtime transcript: 6 Proposed + 6 Executed, all with correct args including `executeAfter` on Proposed and values on Executed; richer shape for AuthorizedCreator).
- For MajorLeagueTreasury: older receiver timelocks lack the dedicated Proposed/Executed (only source + Phase 3 distributor events present). The "every timelock category" requirement is not met across all three.
- `git diff --stat` equivalent (via reads + coordination): only the two .sol touched for source in Phase 4 (plus run-dir artifacts). No additions in MajorLeagueTreasury.sol for the Phase 4 observability items.
- Coordination/phase-4.md explicitly records the scope limit: "Only SponsorshipPayments.sol + BattleTreasury.sol touched for source (per ... MajorLeagueTreasury changes explicitly deferred / out of this phase's backend items)."

### Manual Verification

**Exact checklist text**:
> Hardhat script (or console transcript) that calls `createBattle`, `payForSponsorship` (twice on same ID — second must revert), and every timelock propose/execute path, then prints the full event logs. Verifier confirms each required field is present and non-zero where expected, and that duplicate sponsorshipId is rejected.

**Status**: PASS (for the two in-scope contracts; the "every" paths scoped to them)

**Evidence**:
- Verifier executed a dedicated temporary verification script (`verify-phase4.js`, created only for evidence capture, run via `npx hardhat run ... --network hardhat`, then deleted). Full captured transcript (key excerpts):
  ```
  First payForSponsorship succeeded. ...
  SponsorshipPaid emitted (first): {
    sponsorshipId: '0xfc56f8b03cb4ea20a009779a1e957cf446ef6518ebd47288b8acff7cb5891e7e',
    payer: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    recipient: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    poolId: '0x2db0150d8f11d8b0cb4613c299f5d885cd9ccd8192a57985ac97fe2266069404',
    totalAmount: '100000000000000000',
    cumulativePaid: '100000000000000000'
  }
  Second payForSponsorship (duplicate ID) reverted? true reason: SponsorshipAlreadyPaid
  PASS: Duplicate sponsorshipId correctly rejected before any transfer.
  ...
  BattleCreated emitted with full fields: {
    battleId: ...,
    stakeAmount: '50000000000000000',
    depositDeadline: '1780506776',
    resolutionDeadline: '1783098776',
    seasonalPoolId: ...
  }
  PASS: Expanded BattleCreated fired with all required args.
  ...
  === TIMLOCK EVENT RESULTS ===
  PASS SP ProtocolFeeReceiverProposed: { newReceiver: ..., executeAfter: '1780675977' }
  PASS SP ProtocolFeeReceiverExecuted: { newReceiver: ... }
  PASS SP SeasonalTreasuryReceiverProposed: ...
  PASS SP SeasonalTreasuryReceiverExecuted: ...
  PASS BT ProtocolFeeReceiverProposed: ...
  ... (all 8 BT + 4 SP events confirmed with correct richer args for AuthorizedCreator)
  === PHASE 4 VERIFICATION COMPLETE: ALL CHECKS PASSED ===
  ```
- Time-warps (`evm_increaseTime` + `evm_mine`) used to satisfy 2-day TIMELOCK_DELAY for every propose/execute pair.
- All fields non-zero / present as expected. Duplicate path exercised first success then exact revert. No other files left behind.
- This satisfies the literal "Hardhat script ... prints the full event logs" + "duplicate sponsorshipId is rejected" + "confirms each required field" requirement for the scoped contracts.

### Verification Gate

**Exact checklist text**:
> `verifier-reports/phase-4.md` — **100% PASS** with event log excerpts and the duplicate-ID revert proof.

**Status**: PARTIAL (report produced at the task-specified `phase-4-round-1.md`; content reflects actual scoped reality)

**Evidence**:
- This report exists at `frontend/.grok/runs/phased-build-ec52d84a/verifier-reports/phase-4-round-1.md` (matching naming precedent of prior round-1 reports in this run).
- The checklist text literally says `phase-4.md`; minor naming deviation noted.
- Full event log excerpts + duplicate-ID revert proof are attached above (runtime transcript + greps + reads).
- Not "100% PASS" overall due to the three-contract vs. two-contract scope mismatch (see Deviations).

**Exact checklist text**:
> No open deviations from approved Phase 4 scope.

**Status**: FAIL (see Deviations section)

**Evidence**:
- Documented, reasonable scope adjustment in coordination/phase-4.md that implementers followed, but it conflicts with the literal "all three contracts" and "MajorLeagueTreasury.sol" bullets in the closeout checklist (which is the immutable contract per persona rules).
- No other deviations in the implemented work.

---

## Deviations from Plan (if any)

- **Major documented scope deviation (coordination-driven, explicitly recorded, but creates checklist mismatch)**: Coordination/phase-4.md (orchestrator handoff + backend notes + summary) limited all backend/contract edits to `SponsorshipPayments.sol` + `BattleTreasury.sol` only. "MajorLeagueTreasury changes explicitly deferred / out of this phase's backend deliverables." "Push-back rule observed." The approved build-plan.md Phase 4 text and the closeout-checklist.md Phase 4 section both list specific MajorLeague items (SponsorshipCutReceived + poolId, richer distributor/source events). Implementers correctly followed the coordination handoff rather than the original plan text. This is the root cause of the FAIL items above. Reasonable operational decision (to keep phase small) but violates the "plan-bound" + "checklist is immutable contract" rule for the verifier.
- **No doc updates performed**: Plan allowed "one small doc update if needed"; coordination recorded "none required". Acceptable (not a deviation).
- **Report filename**: Produced at `phase-4-round-1.md` per task instruction rather than the `phase-4.md` named in the checklist gate. Minor.
- **Git baseline**: Same as prior phases (`contracts/*.sol` appear `??` untracked). "git diff" not usable for minimal patches; relied on read_file + dedicated grep tool + runtime (consistent with Phase 3 precedent).
- **No other deviations**. Implementation on the two files is 100% additive, follows every quoted bullet in the coordination "Exact scope followed", uses specific custom error (allowed by plan "or new error"), preserves all prior behavior, passes compile, and respects AGENTS.md (N/A answers pre-stated in plan; zero frontend/API/Netlify/Railway/vite/hardhat.config changes of any kind).

---

## Missing or Incomplete Work

- The MajorLeagueTreasury.sol Phase 4 deliverables listed in the closeout checklist (SponsorshipCutReceived expansion + full Proposed/Executed coverage for its timelock categories) are absent because they were explicitly scoped out.
- No other missing work within the executed (scoped) Phase 4. All items for the two contracts, the manual runtime transcript (with duplicate revert + every in-scope timelock event), compile, and AGENTS.md checks are complete and evidenced.
- The `verifier-reports/phase-4.md` path referenced in the checklist gate text was not used (task directed round-1.md).

---

## Bugs or Blockers Found During Verification

- **None in the code**. 
  - No behavior regressions in happy-path payForSponsorship, createBattle + lifecycle, prior timelocks, fee recovery (Phase 1), pull refunds (Phase 2), etc.
  - All new guards/events are additive and early (checks-effects).
  - Compile clean ("Compiled 51 Solidity files successfully").
  - Existing test suite unaffected (prior run: 24 passing on broad grep).
  - Pre-existing BattleTreasury warnings (Phase 2 zeroing locals + markActive) unchanged.
- **Blocker to closeout**: The scope mismatch between executed coordination handoff and the literal three-contract requirements in the Phase 4 closeout checklist. This is a process/plan-consistency blocker, not a code bug. The implemented work for SponsorshipPayments + BattleTreasury has zero blockers and would be 100% PASS in isolation.
- No storage layout risk (new mapping appended; events only; pre-deployment contracts).

---

## Summary

- Total checklist items evaluated (broken out per the structure in phase-3-round-1 precedent): 9 distinct quoted requirements.
- Passed: 5 (all items that apply to the two in-scope contracts, including the full manual runtime verification with duplicate-ID revert proof and 12 event firings).
- Failed/Partial: 4 (the three-contract "all" items + MajorLeague-specific bullets + the exact gate filename + "no open deviations").
- Recommendation: The two-contract implementation is complete, correct, and ready. To reach "READY TO CLOSE", either update the closeout-checklist.md to match the coordination-scoped Phase 4 or complete the deferred MajorLeague items in a Phase 4 follow-up before moving to Phase 5. The verifier transcript requirement was fully satisfied for the actual delivered surface (unlike the Phase 3 round-1 situation).

**Signed**: Plan Verifier Agent  
2026-06-01  
This report is the sole authority for Phase 4 closeout. "Ready for Verification" markers in coordination/phase-4.md were noted but used only as context — all PASS/FAIL decisions rest exclusively on direct file reads, dedicated grep output, `npx hardhat compile --force` output, the captured runtime transcript (duplicate revert + event args), and strict comparison to the approved build-plan.md + closeout-checklist.md. No code was modified during verification. Report written to the exact path specified in the task. No claims of overall phase completion are made here; only the evidence and per-item statuses above.

