# Closeout Checklist: contractaudits5.md Remediation (PostGrad Treasury Security — Remaining Auditor Findings)

**Linked Build Plan**: `build-plan.md` (approved version)
**Run ID**: da26e79f
**Purpose**: This is the **immutable contract** for the plan-verifier. Every item must be independently verifiable by an agent possessing only a checkout of the repository, `git`, `npm`, Hardhat (at repository root), and a terminal. No reliance on the original implementer is permitted. All items are binary (pass / fail with concrete, reproducible evidence such as exact command + output fragment, git diff, or on-chain state reads).

**Verification Principles** (identical to ec52d84a precedent):
- Use `git diff --no-color -U0` (and `git show`) for exact textual evidence of every addition, removal, or edit.
- Use `grep -n` with exact strings for line-accurate confirmation of functions, structs, events, errors, comments, and NatSpec.
- Hardhat console or one-off Node/ethers scripts + transaction receipts for on-chain behavior, event logs, state reads (pending*, prizePools, settled, Battle struct fields, etc.), and reverting-mock tests. Always use the existing `RevertingReceiver` and `AcceptingReceiver` mocks from `contracts/mocks/`.
- `npx hardhat compile --force` (or `npm run compile`) output for compilation hygiene.
- Full `npx hardhat test test/PostGradTreasury.security.spec.ts` transcripts (must be re-executable and clean).
- Only mark an item complete when the exact evidence described (command + expected output fragment or file content) exists in the verifier's transcript or saved artifacts under `verifier-reports/` and `notes/`.
- The verifier must also produce (or confirm existence of) the coordination and summary notes expected from the implementer (`coordination/phase-N.md`, `summaries/phase-N-backend.md`).

**Combined Deployment Gate Checklist — must be fully evidenced by end of Phase 4**:

**Prior 11 items from contractaudits4.md (ec52d84a) — must be re-exercised with zero regressions**:
1. Add retryPendingFee or timelocked fee-redirection recovery path to all three contracts.
2. Convert unresolved active-battle refunds to pull-based refunds.
3. Make distributor daily/tx limits nonzero by default and timelocked (now includes the Phase 1 replacement of the immediate setter with proposeDistributorLimitUpdate).
4. Reserve bytes32(0) as invalid for actual prize pools.
5. Add a maximum battle deposit window.
6. Restrict receiveBattleCut() and receiveSponsorshipCut() to known source contracts.
7. Clear battle deposit storage after claim/refund.
8. Expand events for battle creation, sponsorship payment, battle cuts, sponsorship cuts, and timelock proposal/execution (already done; re-confirm no breakage).
9. Run full Hardhat tests covering: reverting fee receivers; contract fee receivers; active battle timeout refund where one participant rejects ETH; distributor daily limit enforcement; bytes32(0) pool rejection; EIP-712 valid/invalid signatures; direct ETH behavior; plus the new contractaudits5 scenarios below.
10. (Implicit from final-closeout) All happy-path flows (winner claim, one-sided deposit refund, sponsorship split + payForSponsorship, allocate + claimReward, resolveWinner) remain behaviorally unchanged except for the documented improvements.
11. (Implicit) No new immediate owner setters; only the three emergency pause functions remain immediate (with comments + TRUST_MODEL entry).

**6 new items from this contractaudits5.md (da26e79f) — must be evidenced**:
A. Immediate setDistributorDailyLimit removed (or fully replaced by timelocked proposeDistributorLimitUpdate with nonzero enforcement).
B. SponsorshipId frontrunning/DoS closed via minimal EIP-712 backend signature (or composite binding) when authorizer is set; valid signature path works, unsigned/bad-sig path reverts.
C. retryPendingFee for league cuts now has attribution-preserving specialized paths (retryBattleCut / retrySponsorshipCut + per-ID pendingFailed*Cut mappings) that deliver with metadata to the correct prize pool instead of plain ETH → unallocated.
D. One-sided battle refund path (AwaitingDeposits, single depositor) now sets `battle.settled = true`.
E. Winner claim in BattleTreasury no longer permanently locks funds when the winner address rejects ETH (signed payoutAddress in the existing EIP-712 ResolveWinner payload allows resolver to designate a safe recipient; 0-fallback preserves prior behavior).
F. battleTreasurySource and sponsorshipPaymentsSource can be initialized at MajorLeagueTreasury construction time (or via controlled deployment sequence documented in NatSpec / USER_INTERACTION_GUIDE); cuts succeed immediately from the ctor-supplied sources without waiting for a post-deploy timelock.

---

## Phase 1: Distributor Limit Control Integrity — Closeout Criteria

### Contract Deliverables — MajorLeagueTreasury.sol
- [ ] `setDistributorDailyLimit` function is completely absent (full removal, not a revert stub). Verifier command:
  ```
  git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -i "setDistributorDailyLimit" || echo "ABSENT (expected)"
  ```
  Expected: no matches for the old function name anywhere in the file.
- [ ] New `PendingDistributorLimitUpdate` struct + `pendingDistributorLimitUpdate` public storage variable present (append-only location after other Pending* around original line 573). Verifier:
  ```
  grep -n "PendingDistributorLimitUpdate\|pendingDistributorLimitUpdate" contracts/MajorLeagueTreasury.sol
  ```
  Shows the struct definition + public var.
- [ ] Three new functions (`proposeDistributorLimitUpdate`, `executeDistributorLimitUpdate`, `cancelPendingDistributorLimitUpdate`) + three new events (`DistributorLimitUpdateProposed`, `Executed`, `Pending...Cancelled`) + one new error (`InvalidDistributorLimitUpdate`) are present and follow the exact ec52d84a Phase 5 / distributor-change patterns (onlyOwner, 2-day TIMELOCK_DELAY, exists + timestamp checks, nonzero dailyLimit + maxPerTx required when updating, atomic set of both mappings on execute, delete on success/cancel, proper emits). Verifier greps + `git diff -U0` on the function bodies.
- [ ] Only timelocked paths can modify per-distributor limits post-enablement. `allocateReward` comments (around 307-320) and distributor section header reference the new proposeDistributorLimitUpdate path. Verifier:
  ```
  git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 5 -B 5 "proposeDistributorLimitUpdate\|Phase 1.*da26e79f"
  ```
- [ ] NatSpec / inline comments at the removal site and the two limit mappings contain "phased-build-da26e79f Phase 1" / "contractaudits5 High" markers.

### Documentation Deliverables
- [ ] `contracts/TRUST_MODEL.md` contains a paragraph (under owner controls or distributor subsection) stating that daily/maxPerTx limit changes for existing distributors are now exclusively timelocked via the new proposeDistributorLimitUpdate flow. `git diff` on the file shows the addition with date 2026-06-01.

### Compilation & Isolation
- [ ] `npx hardhat compile --force 2>&1 | tail -15` completes with "Compiled 51+ Solidity files successfully" and zero errors attributable to MajorLeagueTreasury (or the other two contracts).

### Manual / Spec Verification (to be completed in Phase 4 gate but evidence may be prepared here)
- [ ] (Placeholder — full evidence in Phase 4) The extended `test/PostGradTreasury.security.spec.ts` contains an it confirming `major.setDistributorDailyLimit` is undefined and that propose + 2d jump + execute successfully updates limits for an enabled distributor (0-limit proposal reverts).

### Verification Gate
- [ ] Plan Verifier has produced `verifier-reports/phase-1-round-1.md` (or equivalent) stating **100% PASS** on every checklist item above, with pasted `git diff` fragments, `grep -n` output, compile tail, and (if any manual script was run early) the transcript.
- [ ] Implementer has produced `coordination/phase-1.md` and `summaries/phase-1-backend.md` (following ec52d84a layout) describing the exact changes made.
- [ ] No open deviations from the Phase 1 description in the approved `build-plan.md`.

---

## Phase 2: SponsorshipPayments Authorization & League-Cut Attribution — Closeout Criteria

### Contract Deliverables — SponsorshipPayments.sol
- [ ] ECDSA import + `using ECDSA for bytes32;` present (exact style of BattleTreasury). Verifier:
  ```
  git diff -U0 --no-color contracts/SponsorshipPayments.sol | grep -A 5 "ECDSA"
  ```
- [ ] `SPONSORSHIP_AUTH_TYPEHASH` constant, `PendingAuthorizer` struct + `pendingSponsorshipAuthorizer` + `sponsorshipAuthorizer` public var, three new events, two new errors (`InvalidSponsorshipAuthorization`, `SponsorshipAuthorizationExpired`), and the three timelocked authorizer functions (`proposeSponsorshipAuthorizer` etc.) are present and follow the exact PendingMinimum + Phase 5 pattern. Verifier greps for the typehash string and function names.
- [ ] Internal `_domainSeparatorV4`, `_hashTypedDataV4`, and `_verifySponsorshipAuthorization` helpers present (modeled verbatim on BattleTreasury lines 465-517). Verifier `grep -n` + diff.
- [ ] `payForSponsorship` signature updated to `(bytes32 sponsorshipId, address recipient, bytes32 poolId, uint256 deadline, bytes calldata signature)`. The body contains the conditional verify gate `if (sponsorshipAuthorizer != address(0)) { _verify... }` immediately before the uniqueness guard. Full NatSpec updated with EIP-712 requirements (exact style of Battle resolveWinner NatSpec). Verifier:
  ```
  git diff -U0 --no-color contracts/SponsorshipPayments.sol | grep -A 30 "function payForSponsorship"
  ```
- [ ] `pendingFailedSponsorshipCut` mapping (bytes32 sponsorshipId => uint256) + `retrySponsorshipCut(bytes32 sponsorshipId, bytes32 poolId)` function + `SponsorshipCutRetriedWithMetadata` event present after the retryPendingFee block. The function follows zero-first + recredit-on-fail + metadata ABI call to seasonalTreasuryReceiver.receiveSponsorshipCut + emit on success. Verifier diff + grep.
- [ ] League-cut failure leg (inside payForSponsorship) populates `pendingFailedSponsorshipCut[sponsorshipId]`. Verifier source read + diff.
- [ ] NatSpec on `retryPendingFee` cross-references the specialized retrySponsorshipCut path and documents that plain retry lands in unallocated.

### Contract Deliverables — BattleTreasury.sol (symmetric attribution work)
- [ ] `pendingFailedBattleCut` mapping + `retryBattleCut(bytes32 battleId, bytes32 poolId)` + `BattleCutRetriedWithMetadata` event present after its retryPendingFee block. Identical zero-first + recredit + metadata call to receiveBattleCut. Verifier diff/grep.
- [ ] Seasonal fee failure leg inside `claim` populates `pendingFailedBattleCut[battleId]`. Verifier diff.
- [ ] NatSpec on claim() and retryPendingFee updated with Phase 2 / contractaudits5 cross-refs.

### Contract Deliverables — MajorLeagueTreasury.sol (minimal)
- [ ] NatSpec on `receiveBattleCut` and `receiveSponsorshipCut` contains a note referencing the new attribution-preserving retry*Cut functions on the source contracts (Phase 2, da26e79f). Verifier grep.

### Documentation Deliverables (all five files)
- [ ] `contracts/USER_INTERACTION_GUIDE.md` contains new subsections "Phase 2: Sponsored Payments now require EIP-712 Authorization..." (with exact ethers.signTypedData example) and "Phase 2: Attribution-Preserving League Cut Retries (retry*Cut)".
- [ ] `contracts/TRUST_MODEL.md` contains a new paragraph under Fee Receiver Failure Recovery (or a new "Sponsorship Authorizer" role subsection) describing the timelocked authorizer and the specialized retry*Cut paths.
- [ ] `SECURITY_AUDIT_REPORT.md`, `POSTGRAD_REVENUE_DECISION_TABLE.md`, and `POSTGRAD_TREASURY_ARCHITECTURE.md` each contain a dated 2026-06-01 "contractaudits5 / phased-build-da26e79f Phase 2" note block.
- All five show additions via `git diff` limited to documentation.

### Compilation, Spec Preparation & Manual Verification
- [ ] Clean compile (same command as Phase 1).
- [ ] (Evidence finalized in Phase 4) The extended security spec contains the required "Sponsorship EIP-712 authorization..." and "Specialized retry*Cut preserves..." its. Verifier will re-run the full spec in Phase 4 and capture:
  - Valid EIP-712 sponsorship pay succeeds and marks paid.
  - Bad/expired/wrong-payer sig reverts with the new custom errors.
  - Duplicate ID with invalid sig still hits SponsorshipAlreadyPaid.
  - Triggered league cut failure credits both pendingFeeWithdrawals and the per-ID pendingFailed*Cut.
  - Plain retryPendingFee(seasonal) succeeds but Major state shows increase in unallocatedBalance only.
  - Specialized retry*Cut succeeds, increases the specific prizePools[poolId], emits the *RetriedWithMetadata event, and clears the per-ID pending.

### Verification Gate
- [ ] Verifier report `verifier-reports/phase-2-round-1.md` states **100% PASS** with all required git/grep/compile/spec evidence pasted.
- [ ] Implementer coordination/summary notes present for Phase 2.
- [ ] No deviations from approved Phase 2 scope.

---

## Phase 3: BattleTreasury Settlement Robustness + Winner Payout Safety + Source Ctor Initialization — Closeout Criteria

### Contract Deliverables — BattleTreasury.sol
- [ ] `RESOLVE_WINNER_TYPEHASH` updated to the exact 9-field string containing `,address payoutAddress` at the end. Verifier:
  ```
  git diff -U0 --no-color contracts/BattleTreasury.sol | grep -A 3 "RESOLVE_WINNER_TYPEHASH"
  ```
- [ ] Battle struct (original 39-53) contains the append-only field `address winnerPayoutAddress;` (with NatSpec comment referencing Phase 3 / da26e79f). Verifier grep + struct read.
- [ ] `resolveWinner` function signature updated to accept `address payoutAddress` as third param (after winner). The structHash abi.encode now includes the 9th payoutAddress value. After setting winner, the code sets `battle.winnerPayoutAddress = payoutAddress;`. Full NatSpec updated. Verifier full diff of the function.
- [ ] `claim` uses the signed payout (with 0-fallback to winner) for the winnerAmount transfer. NatSpec updated to explain the lock-prevention behavior. Verifier diff of the payout block (around original 565-567).
- [ ] One-sided AwaitingDeposits refund branch (original 629-631) now contains `battle.settled = true;` immediately after setting state (plus the exact "Phase 3 remediation (contractaudits5 Low finding)" comment). Verifier:
  ```
  git diff -U0 --no-color contracts/BattleTreasury.sol | grep -A 5 -B 5 "settled = true"
  ```
- [ ] NatSpec on refund(), isClaimable, and isRefundable helpers updated with one-line consistency note.

### Contract Deliverables — MajorLeagueTreasury.sol
- [ ] Constructor signature updated to 6 parameters (two trailing source addresses after the original four). Body contains `if (_battleTreasurySource != address(0)) battleTreasurySource = ...;` (same for sponsorship). Full NatSpec on the constructor documents the new params + "controlled deployment sequence" alternative. Verifier:
  ```
  git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -A 15 "constructor("
  ```
- [ ] Existing source propose/execute/cancel paths and only* modifiers remain untouched (ctor init is additive convenience).

### Documentation Deliverables (five files)
- [ ] `contracts/USER_INTERACTION_GUIDE.md` contains new subsections for "Phase 3: Winner Payout Address in Signed Resolutions", "Phase 3: One-Sided Refund now Consistent (settled flag)", and "Phase 3: MajorLeagueTreasury Constructor Source Initialization".
- [ ] `contracts/TRUST_MODEL.md` contains a note under the resolver trust section that the resolver can now designate a safe payoutAddress at resolution time.
- [ ] The other three docs each contain a dated 2026-06-01 "contractaudits5 / phased-build-da26e79f Phase 3" note block.
- All five show clean documentation-only diffs.

### Compilation & Spec Preparation
- [ ] Clean compile (same command).
- [ ] (Evidence finalized in Phase 4) The extended security spec contains the required "Winner claim with signed payoutAddress...", "One-sided refund now sets settled...", and "MajorLeagueTreasury ctor source initialization..." its. Verifier will confirm in Phase 4:
  - Resolve with rejecting winner + safe payoutAddress → claim from winner succeeds and funds arrive at payout (not locked).
  - One-sided refund path now shows settled=true in struct read.
  - Major deployed with ctor sources → only those addresses succeed on receive*Cut (random callers revert with documented strings); no 2-day wait needed.

### Verification Gate
- [ ] Verifier report for Phase 3 states **100% PASS** with all git/grep/compile evidence.
- [ ] Implementer notes present for Phase 3.
- [ ] No deviations.

---

## Phase 4: Global / Deployment Gate — Closeout Criteria

### Documentation Sweep Deliverables
- [ ] All five documentation files (`TRUST_MODEL.md`, `SECURITY_AUDIT_REPORT.md`, `USER_INTERACTION_GUIDE.md`, `POSTGRAD_REVENUE_DECISION_TABLE.md`, `POSTGRAD_TREASURY_ARCHITECTURE.md`) contain dated 2026-06-01 "contractaudits5 / phased-build-da26e79f" notes or a new appended section in SECURITY_AUDIT_REPORT declaring that all 6 findings + the prior 11-item Gate are satisfied. Verifier runs `git diff --no-color` limited to each file and confirms the content + date.
- [ ] `SECURITY_AUDIT_REPORT.md` contains a side-by-side mapping of the 6 findings → fixes (exactly parallel to the ec52d84a final-report style) plus a link to this run directory.

### Extended Security Spec Deliverables
- [ ] `test/PostGradTreasury.security.spec.ts` (the ec52d84a gate harness) has been extended with at least 7 new `it` blocks (plus any helper updates) covering the 6 new findings + explicit re-execution of the prior 11 Gate scenarios. Top-level describe title includes "+ contractaudits5 / phased-build-da26e79f Phase 4". Total passing its >= 18. Verifier command:
  ```
  npx hardhat test test/PostGradTreasury.security.spec.ts 2>&1
  ```
  Expected: clean "18+ passing (Z ms)" with zero failures. Full output captured in `notes/phase-4-gate-evidence.md`.
- [ ] The spec uses only existing patterns (increaseTime, Reverting/AcceptingReceiver mocks, expect custom errors, state reads, signTypedData for both resolve and the new sponsorship auth).

### Gate Evidence Bundle Deliverables
- [ ] `notes/phase-4-gate-evidence.md` exists and collates:
  - Final compile tail ("Compiled 51+ ... successfully", zero errors on the three contracts).
  - Full security spec run output (18+ passing).
  - Key transcript excerpts / state reads / event logs for each of the 6 new findings (A-F) and confirmation that all 11 prior Gate items still pass with identical behavior (except the documented improvements).
  - `git diff --stat` and `git status --porcelain` for the entire workspace, showing **exactly** the 3 .sol + 5 .md + 1 test spec (plus run-dir planning artifacts) as the only new/changed files introduced by this run. Zero entries under frontend/src/, frontend/api/, netlify.toml, hardhat.config.*, package.json, or any deployment scripts.
- [ ] Verifier has executed (and captured output of) the mandatory hygiene commands:
  ```
  git diff --stat
  git status --porcelain -- frontend/src/ frontend/api/ netlify.toml hardhat.config.ts package.json contracts/test/
  ```

### Final Cross-Phase / Global Closeout Deliverables
- [ ] Every individual phase (1-4) has its own passing `verifier-reports/phase-N-*.md` (or round) declaring **100% PASS** on its section (with the exact evidence required in the earlier sections of this checklist).
- [ ] No regressions in any pre-existing function behavior (happy-path winner claim with payoutAddress=0 fallback, one-sided deposit refund, sponsorship split with valid sig, allocate + claimReward, resolveWinner EIP-712, direct ETH behavior on the three contracts, all prior retry/claimRefund/pending paths, etc.). Verified via the Phase 4 spec re-execution + any additional manual state reads in the gate evidence note.
- [ ] `git diff --stat` for the entire run shows only the three contracts + the five documentation files + the security spec (plus run-dir artifacts). No frontend, no backend, no other contracts, no config files.
- [ ] Final clean `npx hardhat compile --force` and `npx hardhat test test/PostGradTreasury.security.spec.ts` succeed with zero errors/failures on the three contracts.
- [ ] Plan Verifier has produced `verifier-reports/final-closeout.md` (modeled exactly on the ec52d84a precedent) containing:
  - Per-phase sign-off summary (all 100% PASS or READY TO CLOSE).
  - Full collated evidence for the combined 11 + 6 Gate items (pointing to specific its, diffs, transcripts, and state reads).
  - A "New Security Issues Review (Delta Audit)" section (reentrancy on the 2 new retry*Cut .call sites + winner payout .call — all protected by nonReentrant + CEI + zero-first + recredit; access control — onlyOwner + 2-day timelock + authorizer EIP-712 sig + only* modifiers + validPoolId; griefing/fund-stranding — no new push paths for user principal, signed payout prevents lock, per-ID retries are opt-in and recredit on failure; accounting — all new mappings/struct fields append-only, no uncleared storage, events carry IDs for reconciliation; EIP-712 soundness — separate domain per contract, no personal-sign, exact type strings, deadline checks, no replay across sponsorships because of the paid flag).
  - Explicit statement: "All 6 findings from contractaudits5.md + the full 11-item contractaudits4 Gate are satisfied. No new issues introduced in the remediation delta. READY TO CLOSE."
- [ ] Phase Sign-off: The Plan Verifier has confirmed **100% of all checklist items** (Phases 1-4 + Global Gate) pass with the required concrete evidence. The final-closeout.md is the authoritative sign-off artifact.

**Note to Verifier**: Only mark the Global / Final Closeout section complete after every phase 1-4 has already received an independent 100% PASS report, the extended security spec runs cleanly with >=18 passing its, the combined Gate evidence bundle (old 11 + new 6) exists in `notes/phase-4-gate-evidence.md`, and the delta security review in final-closeout.md has been reviewed and accepted. Any deviation, even low-severity, must be recorded and resolved before sign-off.

---

**End of Closeout Checklist**

This checklist is intentionally written at the same level of specificity as the ec52d84a precedent (and its Pass 3 predecessor) so that any competent verifier agent can execute it mechanically with only the repository and standard tooling (git + npm + Hardhat at root). All success criteria are observable from the filesystem, compiler/test output, or on-chain state after Hardhat transactions. The structure ensures the prior 11-item Gate is re-validated while the 6 new findings receive dedicated, reproducible evidence. When this document is 100% complete, the contracts are ready for external audit + deployment decision.