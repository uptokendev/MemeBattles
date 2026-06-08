# Closeout Checklist: PostGrad Treasury Security Remediation (contractaudits4.md Findings)

**Linked Build Plan**: `build-plan.md` (approved version)
**Purpose**: This is the **immutable contract** for the plan-verifier. Every item must be independently verifiable by an agent possessing only a checkout of the repository, `git`, `npm`, Hardhat, and a terminal. No reliance on the original implementer is permitted. All items are binary (pass / fail with concrete evidence).

**Verification Principles** (identical to prior Pass 3 remediation):
- Use `git diff --no-color -U0` (and `git show`) for exact textual evidence of every addition.
- Use `grep -n` with exact strings for line-accurate confirmation.
- Hardhat console or one-off Node/ethers scripts + transaction receipts for on-chain behavior, event logs, and reverting-mock tests.
- `npm run compile` output (or targeted `hardhat compile --force`) for compilation hygiene.
- Only mark an item complete when the exact evidence described (command + expected output fragment) exists in the verifier's transcript.

**Deployment Gate Checklist (from idea.md) — must be fully evidenced by end of Phase 5**:
1. Add retryPendingFee or timelocked fee-redirection recovery path to all three contracts.
2. Convert unresolved active-battle refunds to pull-based refunds.
3. Make distributor daily/tx limits nonzero by default and timelocked.
4. Reserve bytes32(0) as invalid for actual prize pools.
5. Add a maximum battle deposit window.
6. Restrict receiveBattleCut() and receiveSponsorshipCut() to known source contracts (or explicitly treat as donations — here we restrict).
7. Clear battle deposit storage after claim/refund.
8. Expand events for battle creation, sponsorship payment, battle cuts, sponsorship cuts, and timelock proposal/execution.
9. Run full Hardhat tests covering: reverting fee receivers; contract fee receivers; active battle timeout refund where one participant rejects ETH; distributor daily limit enforcement; bytes32(0) pool rejection; EIP-712 valid/invalid signatures; direct ETH behavior.

---

## Phase 1: Failed Fee Recovery Hardening Across All Three Contracts — Closeout Criteria

### Contract Deliverables — BattleTreasury.sol
- [ ] `contracts/BattleTreasury.sol` contains the exact `retryPendingFee(address receiver)` function with the auditor-recommended body (zero mapping first, `call{value}`, re-set amount + revert on failure). Verifier command:
  ```
  git diff -U0 --no-color contracts/BattleTreasury.sol | grep -A 20 "function retryPendingFee"
  ```
  Expected: the function body matches the pseudocode in the idea.md with `nonReentrant` and a `FeeRetrySucceeded` (or equivalent) event on success.
- [ ] The timelocked `proposeFeeRedirect` / `executeFeeRedirect` / `cancelPendingFeeRedirect` trio + `PendingFeeRedirect` struct + four supporting events (`PendingFeeRedirectProposed`, `Executed`, `Cancelled`, `FeeRetrySucceeded`) are present. Verifier:
  ```
  grep -n "PendingFeeRedirect\|proposeFeeRedirect\|executeFeeRedirect\|retryPendingFee" contracts/BattleTreasury.sol
  ```
  shows all four functions + struct + the four events, all added in this phase only.
- [ ] `claimPendingFees` NatSpec (around original line 657) and the `pendingFeeWithdrawals` declaration comment now reference the new retry + redirect paths. `git diff` on that region contains the explanatory text.

### Contract Deliverables — MajorLeagueTreasury.sol
- [ ] Identical `retryPendingFee`, `propose/execute/cancel FeeRedirect`, struct, and events present after the existing `claimPendingFees` (original lines 322-330 area). Same grep + diff commands as above, targeting this file only.
- [ ] NatSpec for `claimPendingFees` (original line 320) and the fee accounting comment (line 60) updated.

### Contract Deliverables — SponsorshipPayments.sol
- [ ] Identical four functions + struct + events present after `claimPendingFees` (original lines 264-272). Same verification commands.

### Compilation & Isolation
- [ ] `npm run compile` (or `npx hardhat compile --force`) at repository root completes with zero errors attributable to any of the three contracts. Verifier captures the tail of the output:
  ```
  npm run compile 2>&1 | tail -30
  ```
  "Compiled X Solidity files successfully" with no "Error" lines for BattleTreasury/MajorLeagueTreasury/SponsorshipPayments.

### Manual Edge-Case Verification (Reverting + Accepting Receivers)
- [ ] Verifier runs (or inspects a saved transcript of) a Hardhat console / Node script that:
  1. Deploys the three contracts with a known protocol/seasonal receiver that is a mock contract whose `receive()` always reverts.
  2. Triggers a fee path in each contract (e.g. `claim` on BattleTreasury with a battle that produces fees, `claimReward` on MajorLeague, `payForSponsorship` on SponsorshipPayments) so that `pendingFeeWithdrawals[receiver] > 0`.
  3. Calls `retryPendingFee(receiver)` from any EOA → confirms it reverts and the pending amount is re-credited (no loss).
  4. Deploys a second mock whose `receive()` accepts ETH, sets it as the receiver via timelock execute (or constructor), re-triggers a fee failure to a different amount, then calls `retryPendingFee` → confirms the funds leave the treasury and `pendingFeeWithdrawals` is now 0 for that receiver.
  5. Exercises the timelocked `proposeFeeRedirect` + wait + `executeFeeRedirect` path moving a pending amount from one recorded receiver to another.
- Evidence: full command transcript + final on-chain state reads (`pendingFeeWithdrawals` values + ETH balance deltas) showing the exact behavior described in the build plan.

### Documentation (Phase 1 scope only)
- [ ] `contracts/TRUST_MODEL.md` contains a new or expanded subsection under fee recovery describing `retryPendingFee` (anyone) and the timelocked `redirectStuckFee`-style path (owner only, fee funds exclusively). `git diff` on that file shows the addition.

### Verification Gate
- [ ] Plan Verifier has produced `verifier-reports/phase-1.md` (or equivalent) stating **100% PASS** on every checklist item above, with pasted `git diff` fragments, `grep -n` output, compile tail, and the full manual retry transcript.
- [ ] No open deviations from the Phase 1 description in the approved `build-plan.md`.

---

## Phase 2: Active-Battle Timeout Refunds — Pull Model, Deposit Zeroing, and Deposit Window Upper Bound — Closeout Criteria

### Contract Deliverables — BattleTreasury.sol
- [ ] `MAX_DEPOSIT_WINDOW` constant (value 7 days) is declared and enforced inside `createBattle` immediately after the existing 1-hour minimum check. Verifier:
  ```
  git diff -U0 --no-color contracts/BattleTreasury.sol | grep -A 5 -B 5 "MAX_DEPOSIT_WINDOW"
  ```
  shows the constant + the `if (depositWindowSeconds > MAX_DEPOSIT_WINDOW) revert InvalidAmount();` line.
- [ ] `mapping(address => uint256) public pendingRefunds;` exists (added in this phase). `git diff` confirms location.
- [ ] The active + past-resolutionDeadline branch inside `refund()` (original lines 536-554) now:
  - Zeros both `creatorDeposit` and `challengerDeposit` before any external interaction.
  - Credits `pendingRefunds` for both parties.
  - Sets `settled = true` and `state = Settled`.
  - Emits `RefundCredited` (no longer performs the two direct `call`s that could revert the tx).
  Exact diff evidence required.
- [ ] `claim()` (original lines 453-494) now zeros both deposit fields immediately after setting `settled` / `Settled` and before the winner + fee transfers. Diff evidence.
- [ ] New `claimRefund()` function exists with the pull logic (zero pending, attempt send, recredit + revert on failure, emit `RefundClaimed`). Verifier greps for the function and confirms the body.
- [ ] One-sided incomplete-deposit refund path (original 506-530) remains push-based and still zeros deposits (documented in a comment added this phase).
- [ ] All view helpers (`getPotBalance`, `getCurrentPot`, `getBattleParticipantInfo`, `isRefundable` etc.) contain an added comment explaining that post-settlement the deposit fields are now 0. Diff shows the comments.

### Documentation
- [ ] `contracts/USER_INTERACTION_GUIDE.md` contains a new subsection describing the `claimRefund()` flow for post-`resolutionDeadline` active battles and the fact that `getPotBalance` will report 0 after settlement. `git diff` on the file shows the addition.

### Manual Edge-Case Verification (Blocking Participant Scenario)
- [ ] Verifier executes a Hardhat script that:
  1. Deploys BattleTreasury.
  2. Creates a battle, has both sides deposit (Active state).
  3. Advances time past `resolutionDeadline`.
  4. Deploys a mock challenger contract whose `receive()` reverts on any ETH.
  5. Calls `refund(battleId)` — confirms it succeeds (no longer reverts on the bad receiver).
  6. Reads `pendingRefunds[goodCreator]` > 0 and `pendingRefunds[badChallenger]` > 0.
  7. Calls `claimRefund()` from the good creator — confirms success and that `getPotBalance(battleId)` now returns 0.
  8. Attempts `claimRefund()` from the bad challenger — shows it can be called but the internal send would fail (or recredit behavior).
- Full transcript + balance/state assertions attached to the verifier report.

### Verification Gate
- [ ] `verifier-reports/phase-2.md` declares **100% PASS** with all git-diff, grep, compile, and the blocking-participant transcript attached.
- No deviations from approved Phase 2 scope.

---

## Phase 3: Distributor Limit Binding, Cut-Receiver Restrictions, and Zero Pool ID Reservation — Closeout Criteria

### Contract Deliverables — MajorLeagueTreasury.sol
- [ ] `PendingDistributorChange` struct now contains `dailyLimit` and `maxPerTx` fields (in addition to the original four). `git diff` shows the exact struct definition.
- [ ] `proposeDistributorChange` signature and body accept + require the two limit values and enforce `if (allowed) { require(dailyLimit > 0 ...); require(maxPerTx > 0 ...); }`. Diff + grep evidence.
- [ ] `executeDistributorChange` sets both `distributorDailyLimit` and the new `distributorMaxPerTx` mapping from the pending struct.
- [ ] `distributorMaxPerTx` mapping is declared. allocateReward limit check now uses per-distributor max when present (falling back to global `maxAllocationPerTx`).
- [ ] `battleTreasurySource` / `sponsorshipPaymentsSource` state variables + their three `PendingChange` + propose/execute/cancel functions + `Proposed`/`Executed` events are present.
- [ ] `onlyBattleTreasury` and `onlySponsorshipPayments` modifiers exist and are applied to `receiveBattleCut` and `receiveSponsorshipCut` respectively. Random callers now revert with the exact strings "not battle treasury" / "not sponsorship payments".
- [ ] `InvalidPoolId` error + `validPoolId` modifier exist and are applied to `fundPrizePool`, `allocateUnallocatedToPool`, and `allocateReward`. Calls with `bytes32(0)` now revert.
- [ ] The internal `if (poolId == bytes32(0))` sentinel logic inside the two (now-restricted) receive functions is unchanged.

### Manual Edge-Case Verification
- [ ] Verifier script demonstrates:
  - Propose a distributor with daily=0 or max=0 → reverts.
  - Propose + execute with positive limits → the distributor can allocate up to the limit but not over; daily spent resets correctly.
  - After setting source addresses, a random EOA calling `receiveBattleCut` or `receiveSponsorshipCut` reverts with the precise modifier string.
  - The real authorized source address succeeds.
  - `fundPrizePool(bytes32(0))`, `allocateUnallocatedToPool(bytes32(0), 1)`, `allocateReward(bytes32(0), addr, 1)` all revert `InvalidPoolId`.
  - `receive*Cut(..., bytes32(0))` still correctly routes to `unallocatedBalance` (sentinel preserved inside the trusted path).
- Transcript with exact revert reasons and state reads attached.

### Documentation (Phase 3 scope)
- [ ] `contracts/TRUST_MODEL.md` Distributor section updated to state that limits are now proposed atomically with the role and must be nonzero.

### Verification Gate
- [ ] `verifier-reports/phase-3.md` — **100% PASS** with all diffs, greps, and the multi-scenario transcript.

---

## Phase 4: Sponsorship ID Uniqueness + Event Schema Completion + Timelock Observability — Closeout Criteria

### Contract Deliverables — All Three Contracts
- [ ] `SponsorshipPayments.sol`:
  - `mapping(bytes32 => bool) public sponsorshipPaid;` declared.
  - Guard `if (sponsorshipPaid[sponsorshipId]) revert ...; sponsorshipPaid[...] = true;` present inside `payForSponsorship` before any state changes or transfers.
  - `SponsorshipPaid` event definition now includes `payer`, `poolId`, and `cumulativePaid`.
  - The emit site passes `msg.sender`, `poolId`, and the cumulative value.
- [ ] `BattleTreasury.sol`:
  - `BattleCreated` event now includes `stakeAmount`, `resolutionDeadline`, `seasonalPoolId`.
  - Emit site updated.
  - Full set of `*Proposed` / `*Executed` events (and emits) exist for protocolFeeReceiver, seasonalTreasuryReceiver, resolver, and authorizedCreator.
- [ ] `MajorLeagueTreasury.sol`:
  - `SponsorshipCutReceived` now includes `poolId` in its definition and emit.
  - `BattleCutReceived` (already good from Pass 3) + new `*Proposed` / `*Executed` events for the two source addresses and the richer distributor change (including limit values in the event).
- [ ] Every timelock category across all three contracts now has matching proposal + execution events emitted from the propose/execute functions. `git diff --stat` + targeted greps on each file confirm the additions.

### Manual Verification
- [ ] Hardhat script (or console transcript) that calls `createBattle`, `payForSponsorship` (twice on same ID — second must revert), and every timelock propose/execute path, then prints the full event logs. Verifier confirms each required field is present and non-zero where expected, and that duplicate sponsorshipId is rejected.

### Verification Gate
- [ ] `verifier-reports/phase-4.md` — **100% PASS** with event log excerpts and the duplicate-ID revert proof.

---

## Phase 5: Documentation Alignment, Remaining Immediate Setters, Gate Test Coverage, and Deployment Readiness — Closeout Criteria

### Contract Deliverables (Final Immediate-Setter Hardening)
- [ ] `SponsorshipPayments.setMinimumSponsorshipAmount` is now behind a timelocked propose/execute (or documented deliberate exception with justification).
- [ ] `MajorLeagueTreasury.setMaxAllocationPerTx` is now behind a timelocked propose/execute (global limit).
- [ ] The three `setPaused` functions remain immediate (emergency only) with an added comment in each contract and a corresponding entry in TRUST_MODEL.md.
- [ ] Corresponding proposal/execution events added for the newly-timelocked setters.
- [ ] `git diff --stat contracts/*.sol` shows only the three contracts were touched in the entire run (plus the five .md docs).

### Documentation Deliverables
- [ ] `contracts/TRUST_MODEL.md` contains a clear "Remaining Immediate Controls (Post Remediation — phased-build-ec52d84a)" section listing exactly the three pause functions + any other deliberate exceptions, with multisig recommendation.
- [ ] `contracts/SECURITY_AUDIT_REPORT.md` contains an appended section "contractaudits4 Remediation (Run ec52d84a) — Status" stating that all 11 findings and the full Deployment Gate Checklist are satisfied.
- [ ] `contracts/USER_INTERACTION_GUIDE.md`, `POSTGRAD_REVENUE_DECISION_TABLE.md`, and `POSTGRAD_TREASURY_ARCHITECTURE.md` each contain a dated "Post-audit4 / phased-build-ec52d84a" note summarizing the new recovery paths, restricted receivers, and pull-refund model.
- All five files show additions via `git diff` limited to documentation.

### Test Coverage & Gate Checklist Execution
- [ ] `test/PostGradTreasury.security.spec.ts` (or equivalent location) exists, follows existing Hardhat + ethers + expect patterns from other specs in `test/`, and contains describe/it blocks that cover every scenario in the Deployment Gate Checklist (reverting + accepting fee receivers via mocks, one-sided rejecting refund participant via pull model, daily limit enforcement + reset, bytes32(0) rejection on public paths, direct ETH rejection on the three treasuries, EIP-712 round-trip, plus exercise of retryPendingFee, claimRefund, restricted receive*Cut, etc.).
- [ ] The spec runs cleanly:
  ```
  npx hardhat test test/PostGradTreasury.security.spec.ts
  ```
  produces "X passing" with zero failures. Full output captured.
- [ ] `npm run compile` (final run after all phases) succeeds with zero errors.

### Full Deployment Gate Checklist Evidence Bundle
- [ ] Verifier can point to specific transcripts / test output / git diffs that satisfy every numbered item 1-9 in the Gate Checklist printed at the top of this file (and in the original idea.md).
- [ ] A short `notes/phase-5-gate-evidence.md` (or entries in the verifier report) collates the commands and key output fragments for all nine gate items.

### Final Cross-Phase / Global Closeout
- [ ] Every individual phase (1-5) has its own passing `verifier-reports/phase-N.md` (or round) declaring 100% PASS on its section.
- [ ] No regressions in any pre-existing function behavior (happy-path winner claim, one-sided deposit refund, sponsorship split, allocate + claimReward, etc.) — verified via the Phase 5 spec or additional manual calls.
- [ ] `git diff --stat` for the entire run shows only the three contracts + the five documentation files listed in the build plan (no frontend, no backend, no other contracts, no config files).
- [ ] Final clean `npm run compile && npm run build` (if frontend build is incidentally run) succeeds with no new errors.
- [ ] Plan Verifier has produced a final closeout report (e.g. `verifier-reports/final-closeout.md`) stating that the entire run satisfies the approved plan and that the contracts now pass the Deployment Gate Checklist in full.

**Note to Verifier**: Only mark the Global / Final Closeout section complete after every phase 1-5 has already received an independent 100% PASS report and the collated Gate Checklist evidence bundle exists.

---

**End of Closeout Checklist**

This checklist is intentionally written at the same level of specificity as the Pass 3 precedent so that any competent verifier agent can execute it mechanically with only the repository and standard tooling. All success criteria are observable from the filesystem, compiler output, or on-chain state after Hardhat transactions.