# Phase 3 Closeout Report — PostGrad Treasury Security Remediation (phased-build-ec52d84a)

**Phase**: 3 (Distributor Limit Binding, Cut-Receiver Restrictions, and Zero Pool ID Reservation — MajorLeagueTreasury)  
**Date of Verification**: 2026-05-31  
**Verifier**: Strict Plan-Verifier (impartial, evidence-only)  
**Linked Artifacts**:
- Approved `build-plan.md` (Phase 3 section + Cross-Cutting + Out of Scope + Local vs Production Impact + AGENTS.md compliance questions)
- `closeout-checklist.md` (full Phase 3 section — the immutable contract)
- `coordination/phase-3.md` (Backend detailed execution log + "**Backend Phase 3 Ready for Verification**" marker + Frontend N/A marker + explicit notes on placement, cancel events, and post-deploy source setup)
- `summaries/phase-3-frontend.md` (exists; documents N/A scope correctly)
- `summaries/phase-3-backend.md` (MISSING — see Deviations/Missing Work)
- Actual changed files: `contracts/MajorLeagueTreasury.sol`, `contracts/TRUST_MODEL.md` (small doc update only)
- Supporting: `frontend/AGENTS.md`, root `package.json`, `hardhat.config.ts` (all inspected for no unintended impact)
- Commands executed: `npx hardhat compile --force`, subset `npx hardhat test`, dedicated `grep` tool searches, file reads with line numbers, git status / add -N + diff attempts (contracts untracked in this workspace state)

---

## Verdict

**NOT READY TO CLOSE**

Phase 3 contract implementation is plan-literal and high-quality (all structural, modifier, error, event, and NatSpec changes match the approved build-plan.md exactly; compile clean; AGENTS.md respected with zero scope creep). However, two checklist items are PARTIAL and one required artifact is absent:
- Full manual edge-case verification transcript (with actual on-chain deploys, exact revert reasons, state reads for limits enforcement, restricted receive*Cut, bytes32(0) rejection, and sentinel preservation) was not produced (verifier could not create even a temporary exercising script per "Do not make any code changes" constraint in this task; static + compile + string evidence is strong but checklist literally requires "Verifier script demonstrates" + "Transcript ... attached").
- `summaries/phase-3-backend.md` was never written despite explicit instruction in coordination/phase-3.md handoff.
- Git baseline for contracts/ is untracked (all ??), so "git diff" produces full-file rather than clean patch (minor but affects exact evidence format expected in checklist).

No blocking bugs or behavior regressions found. With a runtime transcript + the missing summary file, this would reach 100% PASS. Current state: requires one follow-up round for the missing evidence items only.

---

## Per-Item Status + Evidence (Phase 3 Section of closeout-checklist.md)

### Contract Deliverables — MajorLeagueTreasury.sol

**Exact checklist text**:
> `PendingDistributorChange` struct now contains `dailyLimit` and `maxPerTx` fields (in addition to the original four). `git diff` shows the exact struct definition.

**Status**: PASS

**Evidence**:
- Dedicated `grep` tool (pattern: `struct PendingDistributorChange`):
  ```
  494:    struct PendingDistributorChange {
  495:        address distributor;
  496:        bool allowed;
  497:        uint256 dailyLimit;
  498:        uint256 maxPerTx;
  499:        uint256 executeAfter;
  500:        bool exists;
  501:    }
  ```
- File read confirms placement at lines 494-501 (after pending source PendingChange declarations, with Phase 3 comment at 492-493).
- Git staging attempt + diff (even as full-file new) + coordination evidence pointers match exactly. Append-only struct extension (pre-deployment, no layout risk).

**Exact checklist text**:
> `proposeDistributorChange` signature and body accept + require the two limit values and enforce `if (allowed) { require(dailyLimit > 0 ...); require(maxPerTx > 0 ...); }`. Diff + grep evidence.

**Status**: PASS

**Evidence**:
- Dedicated `grep` tool:
  ```
  127:    function proposeDistributorChange(address distributor, bool allowed, uint256 dailyLimit, uint256 maxPerTx) external onlyOwner {
  128:        if (allowed) {
  129:            require(dailyLimit > 0, "daily limit required");
  130:            require(maxPerTx > 0, "tx limit required");
  131:        }
  132:        pendingDistributorChange = PendingDistributorChange({
  ...
  ```
- Matches build-plan and coordination quote-for-quote (4-param sig, requires only on `allowed`, full struct population).
- Comment at 125-126 documents the Phase 3 binding intent.

**Exact checklist text**:
> `executeDistributorChange` sets both `distributorDailyLimit` and the new `distributorMaxPerTx` mapping from the pending struct.

**Status**: PASS

**Evidence**:
- `grep` + read (lines 142-154):
  ```
  149:        distributorDailyLimit[change.distributor] = change.dailyLimit;
  150:        distributorMaxPerTx[change.distributor] = change.maxPerTx;
  ```
- Exact per plan. Delete of pending at end. DistributorUpdated emit preserved for compatibility (per plan).

**Exact checklist text**:
> `distributorMaxPerTx` mapping is declared. allocateReward limit check now uses per-distributor max when present (falling back to global `maxAllocationPerTx`).

**Status**: PASS

**Evidence**:
- Mapping declaration (`grep`):
  ```
  522:    mapping(address => uint256) public distributorMaxPerTx;
  ```
- allocateReward usage (lines 256-259):
  ```
  258:        uint256 effMax = distributorMaxPerTx[msg.sender] > 0 ? distributorMaxPerTx[msg.sender] : maxAllocationPerTx;
  259:        if (effMax > 0 && amount > effMax) revert InvalidAmount();
  ```
- Daily limit enforcement logic also present and unchanged in spirit (lines 262-271: today reset + spent check using `distributorDailyLimit`).
- Global `maxAllocationPerTx` + immediate setter left in place (explicitly for Phase 5 per plan).

**Exact checklist text**:
> `battleTreasurySource` / `sponsorshipPaymentsSource` state variables + their three `PendingChange` + propose/execute/cancel functions + `Proposed`/`Executed` events are present.

**Status**: PASS

**Evidence**:
- State + Pending (lines 487-490):
  ```
  487:    address public battleTreasurySource;
  488:    address public sponsorshipPaymentsSource;
  489:    PendingChange public pendingBattleTreasurySource;
  490:    PendingChange public pendingSponsorshipPaymentsSource;
  ```
- 4 events (lines 92-95) appended after Phase 1 events.
- All 6 functions present (propose/execute/cancel ×2) at 575+ (Battle) and 599+ (Sponsorship), modeled on fee-receiver pattern using PendingChange, with emits from propose/execute only (cancels silent delete — see Deviations for documented rationale matching plan).
- NatSpec on receive*Cut updated to document access control (lines 193-199, 228-233).

**Exact checklist text**:
> `onlyBattleTreasury` and `onlySponsorshipPayments` modifiers exist and are applied to `receiveBattleCut` and `receiveSponsorshipCut` respectively. Random callers now revert with the exact strings "not battle treasury" / "not sponsorship payments".

**Status**: PASS

**Evidence**:
- Modifiers (lines 452-460):
  ```
  452:    modifier onlyBattleTreasury() {
  453:        require(msg.sender == battleTreasurySource, "not battle treasury");
  454:    ...
  457:    modifier onlySponsorshipPayments() {
  458:        require(msg.sender == sponsorshipPaymentsSource, "not sponsorship payments");
  ```
- Applied: `receiveSponsorshipCut(...) external payable onlySponsorshipPayments` (line 200); `receiveBattleCut(...) external payable onlyBattleTreasury` (line 234).
- Exact revert strings confirmed via dedicated grep. Modifiers placed after whenNotPaused per coordination.

**Exact checklist text**:
> `InvalidPoolId` error + `validPoolId` modifier exist and are applied to `fundPrizePool`, `allocateUnallocatedToPool`, and `allocateReward`. Calls with `bytes32(0)` now revert.

**Status**: PASS

**Evidence**:
- Error + modifier (lines 103, 464-467):
  ```
  103:    error InvalidPoolId();
  ...
  464:    modifier validPoolId(bytes32 poolId) {
  465:        if (poolId == bytes32(0)) revert InvalidPoolId();
  ```
- Applications (grep confirmed):
  - `fundPrizePool(bytes32 poolId) external payable validPoolId(poolId)` (186)
  - `allocateUnallocatedToPool(..., bytes32 poolId, ...) external validPoolId(poolId)` (217)
  - `allocateReward(..., bytes32 poolId, ...) ... validPoolId(poolId)` (254)
- Matches plan exactly (applied only to the three listed public paths).

**Exact checklist text**:
> The internal `if (poolId == bytes32(0))` sentinel logic inside the two (now-restricted) receive functions is unchanged.

**Status**: PASS

**Evidence**:
- Confirmed via grep (receiveSponsorshipCut lines 203-208; receiveBattleCut lines 237-242):
  ```
  203:        if (poolId != bytes32(0)) {
  ...
  237:        if (poolId == bytes32(0)) {
  ```
- Sentinel behavior for unallocated preserved exclusively inside the now-trusted (modifier-protected) paths. NatSpec explicitly calls this out (lines 198, 232). `validPoolId` correctly NOT applied to receives.

### Manual Edge-Case Verification

**Exact checklist text**:
> Verifier script demonstrates:
>   - Propose a distributor with daily=0 or max=0 → reverts.
>   - Propose + execute with positive limits → the distributor can allocate up to the limit but not over; daily spent resets correctly.
>   - After setting source addresses, a random EOA calling `receiveBattleCut` or `receiveSponsorshipCut` reverts with the precise modifier string.
>   - The real authorized source address succeeds.
>   - `fundPrizePool(bytes32(0))`, `allocateUnallocatedToPool(bytes32(0), 1)`, `allocateReward(bytes32(0), addr, 1)` all revert `InvalidPoolId`.
>   - `receive*Cut(..., bytes32(0))` still correctly routes to `unallocatedBalance` (sentinel preserved inside the trusted path).
> - Transcript with exact revert reasons and state reads attached.

**Status**: PARTIAL

**Evidence**:
- All enforcement strings and logic paths **personally confirmed** via dedicated grep tool + full file reads (see above items):
  - Zero-limit requires: exact `"daily limit required"` / `"tx limit required"` at 129-130.
  - Modifier reverts: exact `"not battle treasury"` / `"not sponsorship payments"` at 453/458.
  - PoolId error: `InvalidPoolId()` custom error + modifier at 103/465; applied to the three public funcs.
  - Sentinel preservation inside receives: exact `if (poolId == bytes32(0))` / `if (poolId != bytes32(0))` blocks at 237/203 (only reachable via modifiers).
  - Per-distributor max + daily reset logic present and active in `allocateReward` (258-271).
- `npx hardhat compile --force` (executed by verifier): "Compiled 51 Solidity files successfully (evm target: paris)." Exit 0. Zero errors on MajorLeagueTreasury.sol (pre-existing BattleTreasury warnings only from Phase 2).
- Subset existing Hardhat tests (`npx hardhat test --grep "TreasuryRouter|LaunchFactory|Phase1"`): 24 passing (2s). No regressions.
- Node + hre runtime load attempt confirmed factory for MajorLeagueTreasury loads post-compile (partial success before ESM/CJS config conflict).
- **Missing for full PASS**: No end-to-end EVM transcript with actual deploys, propose/execute, allocate over-limit reverts with exact reasons, source address tests (random vs authorized), bytes32(0) reverts on public paths, and unallocatedBalance reads after receive*Cut(0) from authorized caller. (Verifier adhered strictly to "Do not make any code changes" — no temp .cjs/.ts exercising script was written, unlike Phase 1 precedent which used a removable script. Static + compile evidence is 100% consistent with required behavior but does not substitute for the checklist's "script demonstrates" + "Transcript attached" requirement.)

### Documentation (Phase 3 scope)

**Exact checklist text**:
> `contracts/TRUST_MODEL.md` Distributor section updated to state that limits are now proposed atomically with the role and must be nonzero.

**Status**: PASS

**Evidence**:
- Dedicated `grep` tool:
  ```
  63:**Current Mitigations (Phase 3 update):**
  64:- Limits (daily + per-tx) are now **proposed atomically with the role** in the timelocked `proposeDistributorChange(address, bool allowed, uint256 dailyLimit, uint256 maxPerTx)`. Nonzero limits are enforced when enabling (`allowed == true`). This closes the prior "0 = unlimited" vector.
  ```
- File read (lines 63-67) confirms exact language. Placed under Distributors section. Only doc changed in Phase 3 scope (other contracts/*.md remain untouched by this phase's edits; their Phase 5 updates are out of scope here).
- Matches coordination log.

### Verification Gate

**Exact checklist text**:
> `verifier-reports/phase-3.md` — **100% PASS** with all diffs, greps, and the multi-scenario transcript.

**Status**: PARTIAL (this report at `phase-3-round-1.md` fulfills the production requirement; content is not 100% PASS)

**Evidence**: This report produced at the exact requested path. All possible static/grep/compile/test evidence collected and quoted. Multi-scenario runtime transcript absent (see Manual item).

**Exact checklist text**:
> No open deviations from approved Phase 3 scope. (Inferred from full Phase 3 gate language and "No deviations from approved Phase 3 scope" precedent in Phase 2 checklist.)

**Status**: PARTIAL (see Deviations section for documented items)

**Evidence**: See full Deviations below. Implementation follows plan literally on all deliverables; deviations are minor, pre-documented in coordination, or verifier-process artifacts (missing summary file, git baseline).

---

## Deviations

- **Documented in coordination/phase-3.md (reasonable, plan-compliant, non-blocking)**: 
  - `PendingDistributorChange` struct + new mapping grouped with other state (plan suggested "near the other daily* mappings at bottom" — done at 522); functions after claimPendingFees as required.
  - Source cancel functions perform silent `delete` (no `XXXCancelled` events emitted). Explicitly because "events limited to the 4 Proposed/Executed listed in plan".
  - Constructor does not initialize `battleTreasurySource` / `sponsorshipPaymentsSource` (remains address(0) until owner proposes post-deploy). Explicitly matches plan language: "Constructor or an initializer sets the initial source addresses (or owner proposes them post-deploy)".
  - `DistributorUpdated` event signature untouched (remains 2-arg for compatibility; richer data lives in proposal/pending per plan).
- **Missing required artifact (blocking for clean closeout)**: `summaries/phase-3-backend.md` was never created despite orchestrator handoff instruction in coordination/phase-3.md ("write `summaries/phase-3-backend.md`") and implementer readiness note. Only `phase-3-frontend.md` exists.
- **Git/workspace baseline (process artifact, not implementation)**: `contracts/MajorLeagueTreasury.sol` and all other contracts/*.sol + *.md appear as `??` (untracked) in `git status`. "git diff" therefore emits full-file content rather than a minimal patch. This affects the exact format of evidence the checklist envisions but does not change the fact that the on-disk content matches the plan 100%. (Other phases in this run exhibit the same.)
- **No other deviations**. No frontend, no other contracts, no config changes, no fee % or TIMELOCK_DELAY changes, no new public non-admin signatures. All per AGENTS.md and build-plan "Out of Scope".

## Missing Work

- Full runtime manual verification transcript for the 6 bullet scenarios in "Manual Edge-Case Verification" (exact reverts + state reads + authorized success paths). Code is ready and correct; only the exercising + capture step is absent.
- `summaries/phase-3-backend.md` (required deliverable per coordination handoff and precedent from prior phases).
- No other missing work within Phase 3 scope. All contract changes, the single doc update, compile hygiene, and AGENTS.md compliance are complete.

## Bugs/Blockers

- None found in implementation.
- The logic for nonzero limit enforcement, per-distributor caps (with global fallback), daily reset, source restriction (exact error strings), `validPoolId` on public paths only, and internal sentinel preservation in receives is all present, compiles cleanly, and is consistent with every quoted requirement in the plan and checklist.
- No storage layout changes (append-only mappings, extended struct on pre-deploy type, new state vars after existing Pending*).
- Existing test suite (24 passing) unaffected.
- Pre-existing BattleTreasury warnings from Phase 2 unchanged.
- The only "blockers" to closeout are the missing transcript artifact and missing summary file (process items, not code bugs).

## Summary

Phase 3 delivers exactly the three findings remediation scoped in the approved build-plan.md for MajorLeagueTreasury.sol: atomic nonzero distributor limits via extended timelocked proposal, timelocked source restriction on the two cut receivers (with modifiers and exact error strings), and `bytes32(0)` reservation on all public prize-pool mutation paths while preserving the sentinel inside the (now-trusted) receive functions. NatSpec, events (additive), and one TRUST_MODEL subsection were updated narrowly. 

All static, compile, and string-level evidence is 100% confirmatory. Runtime behavioral evidence for the manual scenarios is strong via code inspection but incomplete per the literal "verifier script demonstrates + transcript attached" bar because no temp script was created. AGENTS.md rules were respected (plan pre-answered all questions with N/A; zero impact on local dev, Netlify/Railway, apiBase, VITE_*, or any frontend/backend surface). One required summary file is absent.

The implementation itself is ready for the external audit path once the two process evidence gaps are closed in a follow-up round. Current verdict accounts for strict plan-literal compliance and the "evidence-only" mandate.

**Current overall: 80%+ PASS on substance; requires round 2 for 100% checklist closure.**

---

## Signed

**Plan Verifier**  
2026-05-31  
This report is the sole authority for Phase 3 closeout. Backend/Frontend "Ready for Verification" markers in coordination/phase-3.md are noted but were not used as evidence for any PASS decision — only direct inspection, grep, compile output, test runs, and file reads were. 

No code was modified during verification. Report written to the exact path specified in the task.

**End of Phase 3 Round 1 Closeout Report**
