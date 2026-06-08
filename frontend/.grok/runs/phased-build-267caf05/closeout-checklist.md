# Closeout Checklist: PostGrad Treasury Security Remediation (Pass 3 Audit Findings)

**Linked Build Plan**: `build-plan.md` (approved version)
**Purpose**: This is the **immutable contract** for the plan-verifier. Every item must be independently verifiable by an agent with only git, the source files, Hardhat, and a terminal (no reliance on the original implementer). All items are binary (pass/fail).

**Verification Principles**:
- Use `git diff --no-color -U0` (or `git show`) for exact textual evidence.
- Use Hardhat console or a one-off Node script + `ethers` for signature reconstruction and on-chain static calls.
- Read files with `cat` / `head` / `tail` / `grep -n` for line-accurate confirmation.
- Transaction receipt event logs (via Hardhat) for emission checks.
- Only mark an item complete when the exact evidence described exists.

---

## Phase 1: Fix EIP-712 Digest Construction Bug in BattleTreasury.resolveWinner — Closeout Criteria

### Contract Deliverables (BattleTreasury.sol only)
- [ ] `contracts/BattleTreasury.sol` line 6 no longer contains the `MessageHashUtils` import (verifier runs `grep -n "MessageHashUtils" contracts/BattleTreasury.sol` and confirms zero matches or the line is removed).
- [ ] The digest construction inside `resolveWinner` is exactly the canonical EIP-712 form with **no** outer `toEthSignedMessageHash` wrapper. Verifier command:
  ```
  git diff -U0 --no-color contracts/BattleTreasury.sol | grep -A 12 -E "(bytes32 digest|toEthSignedMessageHash|keccak256\(abi.encodePacked)"
  ```
  Expected output shows only:
  ```
  +        bytes32 digest = keccak256(
  +            abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash)
  +        );
  ```
  (or equivalent post-format whitespace) and zero occurrences of the old double-wrapped version in the diff or file.
- [ ] The `RESOLVE_WINNER_TYPEHASH` (lines ~318-320) and the struct encoding inside `resolveWinner` (the 8-field `abi.encode`) are **identical** to the pre-phase state (verifier confirms via `git diff` that only the digest wrapper + import + comments changed).
- [ ] NatSpec / comments immediately preceding or inside `resolveWinner` (around lines 334-375) now contain explicit text stating that standard EIP-712 signing (`signTypedData`) is required and that personal_sign / wrapped hashes will fail. Verifier greps:
  ```
  grep -n -i "signTypedData\|standard EIP-712\|personal_sign\|off-chain.*resolver\|off-chain signing" contracts/BattleTreasury.sol
  ```
  and confirms at least one clear explanatory sentence or paragraph exists that was not present before the phase.
- [ ] No other functions, events, errors, storage variables, or modifiers in `BattleTreasury.sol` were modified (verifier confirms via `git diff --stat` and spot `git diff -U0` on non-resolveWinner sections that they are clean).

### Compilation & Isolation Verification
- [ ] The file `contracts/BattleTreasury.sol` itself has no syntax errors. Verifier can compile it in isolation (e.g. via direct `solc` invocation on the single file with the project's OZ 5.0.2 remappings, or by running Hardhat after temporarily moving the known-broken `LeagueTreasury.sol` aside) and receives zero errors attributable to BattleTreasury.
- [ ] Full monorepo compile status is **not** required to pass in Phase 1 (the pre-existing LeagueTreasury stub error is expected and documented in the build plan); this item is satisfied once the scoped file is clean.

### Manual EIP-712 Signature Verification (Positive + Negative Cases)
- [ ] Verifier successfully performs an end-to-end manual reconstruction test (evidence: terminal transcript or saved one-off script output):
  1. Deploy (or use an existing) BattleTreasury instance on Hardhat local network with a known `resolver` address (EOA whose private key is available in the test environment).
  2. Create a battle via `createBattle`, have two participants call `deposit` so it reaches Active state, and note the exact `battleId`, `creator`, `challenger`, `stakeAmount`, deadlines, and `seasonalPoolId`.
  3. In Node/ethers (or Hardhat console) compute:
     - `structHash` exactly as the contract does (using the same `RESOLVE_WINNER_TYPEHASH` and `abi.encode` of the 8 values).
     - `domainSeparator` by calling the public `_domainSeparatorV4()` (or reconstructing it).
     - `digest = keccak256( abi.encodePacked( "0x19", "0x01", domainSeparator, structHash ) )`.
  4. Produce a valid signature for that digest using the resolver's private key via **standard EIP-712** (ethers `signTypedData` with the matching domain + `ResolveWinner` type definition — **not** `personal_sign` of the digest).
  5. Call `resolveWinner(battleId, winner, signature)` (or `.staticCall`) and confirm it does **not** revert with `InvalidSignature()`.
  6. Repeat with a signature produced for a different winner or a tampered field → confirm `InvalidSignature()` revert.
  7. (Optional but recommended) Show that a signature produced the old "personal_sign of the inner EIP hash" way now fails (post-fix behavior).
- [ ] The test above uses only the corrected on-chain logic (no reliance on any pre-fix wrapper). Verifier records the exact commands and the final "success / revert as expected" results.

### Cross-Team / Integration (N/A for pure contract phase)
- [ ] N/A — no frontend or backend API deliverables in this phase per build plan. No coordination file entries required beyond noting "Phase 1 contract-only".

### Documentation & Observability (Phase 1 scope)
- [ ] The only documentation changes in Phase 1 are the inline NatSpec/comments inside `contracts/BattleTreasury.sol` (already covered above). No other `.md` files are modified in this phase.

### Verification Gate
- [ ] Plan Verifier has produced `verifier-reports/phase-1-round-*.md` (or equivalent) stating **100% PASS** on every checklist item in this Phase 1 section, with explicit citations of the git diff output, compile result, and manual signature test transcript.
- [ ] No open deviations from the approved `build-plan.md` description of Phase 1 work.

---

## Phase 2: Apply Non-Blocking Fee Pattern to SponsorshipPayments.payForSponsorship — Closeout Criteria

### Contract Deliverables (SponsorshipPayments.sol only)
- [ ] `contracts/SponsorshipPayments.sol` now declares `mapping(address => uint256) public pendingFeeWithdrawals;` at the top-level state area (immediately after the `PendingChange` structs, before the first event). Verifier:
  ```
  git diff -U0 --no-color contracts/SponsorshipPayments.sol | grep -A2 -B2 "pendingFeeWithdrawals"
  ```
  confirms the addition with the exact type and visibility.
- [ ] The event `FeeTransferFailed(address indexed receiver, uint256 amount, bytes32 indexed sponsorshipId);` has been added (verifier greps the file and sees it in the events section; `git diff` shows the addition).
- [ ] Inside `payForSponsorship`, the recipient (70%) leg still uses a hard `require(rSuccess, "Recipient transfer failed")`. The protocol and league legs have been converted to the non-blocking pattern:
  - `if (amount > 0 && receiver != address(0)) { (bool success, ) = receiver.call... ; if (!success) { pending[...] += ; emit FeeTransferFailed(..., sponsorshipId); } }`
  - Verifier runs a targeted diff/grep on the function body (lines ~148-172 area) and confirms:
    - Recipient leg still has `require`.
    - The two fee legs no longer have `require(..., "X transfer failed")`.
    - The `pendingFeeWithdrawals` writes and `FeeTransferFailed` emits exist for both protocol and league (using `sponsorshipId` as the indexed context id).
    - The call to `receiveSponsorshipCut` is still performed inside the league leg attempt.
- [ ] The function `claimPendingFees() external nonReentrant` exists at the bottom of the contract (before the final `}`). Its body is a near-verbatim copy of the implementation in `BattleTreasury.sol:593-601` (or MajorLeague equivalent):
  - `uint256 amount = pendingFeeWithdrawals[msg.sender];`
  - `require(amount > 0, "Nothing to claim");`
  - `pendingFeeWithdrawals[msg.sender] = 0;`
  - `call` + `require(success, "Fee claim failed");`
  - Verifier confirms via `git diff` and by reading the function that it has **no** `whenNotPaused` modifier (matching the other two treasuries).
- [ ] `totalPaidPerSponsorship` increment and the `SponsorshipPaid` emit still occur for every successful (recipient leg) payment. Verifier confirms via diff that this logic was not removed or gated behind the fee attempts.
- [ ] No other changes: BPS constants, `getSplit`, `setMinimumSponsorshipAmount`, `receive()` revert, pausability of `payForSponsorship`, timelock propose/execute functions, etc. remain byte-for-byte identical outside the fee-handling block (verifier spot-checks via `git diff --stat` and targeted reads).

### Compilation
- [ ] `contracts/SponsorshipPayments.sol` compiles cleanly in isolation (same method as Phase 1). The only possible monorepo compile error at this stage remains the pre-existing LeagueTreasury stub.

### Manual Fee-Failure Path Verification
- [ ] Verifier performs (and records transcript of) the following test on a freshly deployed SponsorshipPayments (with a reverting mock or a contract that reverts on receive for one of the fee receivers):
  1. Call `payForSponsorship(sponsorshipId, recipient, poolId)` with value, where one fee receiver will revert.
  2. Confirm the entire transaction succeeds (no revert).
  3. Confirm `recipient` received the 70% (or adjusted dust) amount.
  4. Confirm `pendingFeeWithdrawals[theFailingReceiver]` increased by the expected fee slice.
  5. Confirm a `FeeTransferFailed` event was emitted with the correct `receiver`, `amount`, and `sponsorshipId`.
  6. Call `claimPendingFees()` from the failing receiver and confirm the funds are transferred and the mapping is cleared.
- [ ] The same test with all receivers healthy shows zero pending entries and normal split behavior (evidence recorded).

### Cross-Team / Integration (N/A)
- [ ] N/A — pure contract phase. No coordination file entries required for FE/BE handoff.

### Documentation & Observability (Phase 2 scope)
- [ ] No `.md` files are modified in Phase 2 (documentation updates are explicitly scoped to Phase 3 per build plan).

### Verification Gate
- [ ] Plan Verifier report for Phase 2 states **100% PASS** with direct copies of the git diff hunks for the mapping, event, payForSponsorship body, and claimPendingFees function, plus the manual fee-failure test transcript.
- [ ] No deviations from the Phase 2 description in the approved build plan.

---

## Phase 3: Operational Polish — Timelock Cancellations, Dedicated Event, Documentation, and Compile Hygiene — Closeout Criteria

### Contract Deliverables — Timelock Cancellations (All Three Contracts)
- [ ] `BattleTreasury.sol` contains three new events (verifier greps for the names):
  - `PendingProtocolFeeReceiverCancelled`
  - `PendingSeasonalTreasuryReceiverCancelled`
  - `PendingResolverCancelled`
  And the three corresponding `cancelPending*` functions (onlyOwner) that `delete` the matching `PendingChange` struct and emit the cancellation event. `git diff` shows the additions after the matching `execute*` functions.
- [ ] `MajorLeagueTreasury.sol` contains the two receiver cancellation events + `PendingDistributorChangeCancelled`, plus the three `cancelPending*` functions (including for the `PendingDistributorChange` struct). Evidence via `git diff` and grep.
- [ ] `SponsorshipPayments.sol` contains the two receiver cancellation events + the two `cancelPending*` functions. Evidence via `git diff`.
- [ ] Each cancel function is callable only by owner and does not require the timelock to have expired (verifier confirms via code read + a quick Hardhat test that owner can cancel an unexpired proposal and a non-owner reverts).
- [ ] Existing propose/execute logic and storage layout for the pending structs are untouched (only additions).

### Contract Deliverables — Dedicated BattleCutReceived Event (MajorLeagueTreasury.sol)
- [ ] The event `BattleCutReceived(bytes32 indexed battleId, bytes32 indexed poolId, uint256 amount);` is declared (near `SponsorshipCutReceived`).
- [ ] `receiveBattleCut` emits `BattleCutReceived(battleId, poolId, msg.value)` on every call (in addition to any existing `PrizeFunded` when applicable). Verifier evidence:
  - `git diff` shows the emit addition.
  - Manual test: call `receiveBattleCut` (or trigger via BattleTreasury claim that sends the cut) and inspect the transaction receipt logs; the new event is present with correct indexed topics and data.

### Contract Deliverables — Compile Stub Hygiene (LeagueTreasury.sol)
- [ ] `contracts/LeagueTreasury.sol` now contains only the SPDX, pragma, the full deprecation NatSpec block, and a valid empty `contract LeagueTreasury { ... }` with nothing after the closing brace. Verifier:
  ```
  git diff -U0 contracts/LeagueTreasury.sol
  ```
  shows removal of the orphaned state declarations / code that previously caused "Expected identifier but got 'public'".
- [ ] `npm run compile` (or `npx hardhat compile`) at the repository root now succeeds with **zero** compilation errors (verifier runs the command and pastes the final "Compiled X contracts" success line; the only output is warnings or info, never errors).

### Documentation Deliverables (Exact Files and Content)
- [ ] `contracts/SECURITY_AUDIT_REPORT.md` contains a new top-level section `## Pass 3 Remediation (phased-build-267caf05)` (or equivalent clearly titled heading) after "Recommended Next Steps". The section lists the EIP-712 fix, the Sponsorship non-blocking change, and the Phase 3 polish items as completed. Executive Summary risk language is updated. Verifier reads the file and confirms the new section + updated bullets exist.
- [ ] `contracts/TRUST_MODEL.md` "2. Battle Resolver" subsection (or equivalent) now accurately describes the signed payload as the full 8-field `ResolveWinner` EIP-712 struct and explicitly requires standard typed-data signing. "Last Updated" or version line reflects the remediation date. Verifier quotes the exact updated paragraph.
- [ ] `contracts/USER_INTERACTION_GUIDE.md` contains a new subsection under SponsorshipPayments for "Claiming Pending Fees (Protocol / League operators)" documenting `claimPendingFees()` and the `FeeTransferFailed` event. A sentence references the new `BattleCutReceived` event. Verifier confirms the added text.
- [ ] `contracts/POSTGRAD_REVENUE_DECISION_TABLE.md` and `contracts/POSTGRAD_TREASURY_ARCHITECTURE.md` each contain (at minimum) a one-sentence note in the PostGrad/Sponsorships or "New PostGrad Contracts" section stating that SponsorshipPayments fee transfers are now non-blocking using the same pattern. Verifier quotes the sentence from each file.
- [ ] No other files anywhere in the repository were modified except the three contracts + the documentation files explicitly listed in the build plan (verifier runs `git status --porcelain` and `git diff --stat` at the end of the effort and confirms the exact allowed set).

### Cross-Team / Integration & Global Constraints
- [ ] All changes respect the non-blocking + pendingFeeWithdrawals pattern exactly (already verified in Phase 2; spot re-check in final diff shows no invention of new patterns).
- [ ] No fee percentages, `TIMELOCK_DELAY`, trust model roles (`authorizedCreators`, `distributors`, `resolver`), or out-of-scope contracts were altered (verifier global `git diff` + grep for "500" / "1000" / "1500" / "2 days" etc. in the changed files confirms no modifications).
- [ ] No frontend, API route, DB, or AGENTS.md-violating changes exist (verifier confirms `git diff --name-only` touches zero paths under `frontend/src/`, `frontend/api/`, `db/`, `netlify*`, etc.).

### Verification Gate
- [ ] Plan Verifier has produced a final Phase 3 report (and a full-effort closeout report) stating **100% PASS** on every item in this section, with pasted evidence for compile success, new events/functions, and the exact documentation paragraphs added.
- [ ] All prior phase verifier reports (Phase 1 and Phase 2) are also on record as clean.
- [ ] No open deviations from the approved build plan across the entire effort.

---

## Global / Final Closeout (Only After All Phases)

- [ ] Every individual phase has an independent passing verifier report (Phase 1, 2, and 3) stored in the run's `verifier-reports/` directory.
- [ ] Full end-to-end money flows that exercise the changed paths still work for the happy path:
  - Battle deposit → resolveWinner (with correct EIP-712 sig) → claim (with fee splits, including pending path if a receiver reverts).
  - Sponsorship payment with a healthy receiver and with a reverting fee receiver.
  - Timelock propose → cancel (before execute) works on all three contracts.
  - `claimPendingFees` works on all three contracts (including the newly added one in SponsorshipPayments).
- [ ] No regressions in pre-existing public behavior (verifier spot-checks via code review + targeted Hardhat calls): `refund` still works only for the documented cases, `allocateReward` / `claimReward` in MajorLeague still respect distributor limits and pay user first, `getSplit` / view helpers are unchanged, pause still does not freeze claims, direct ETH is still rejected where it was before, etc.
- [ ] `npm run compile` at root succeeds with zero errors (post-Phase 3 stub hygiene).
- [ ] All temporary scaffolding, debug comments, or "TODO" markers introduced during implementation have been removed (verifier greps the three contracts for any such remnants).
- [ ] The final git diff for the entire effort is minimal and only touches the paths and change types explicitly authorized in the build plan.
- [ ] The run directory contains the approved `build-plan.md`, this `closeout-checklist.md`, the three verifier reports (one per phase + optional final), and the `architect-summary.md`.

**Note to Verifier**: Only mark the Global / Final Closeout section complete after every individual phase has already received a clean 100% PASS verifier sign-off. Any single failing item in any phase blocks the overall effort.

**This checklist is intentionally strict and evidence-based.** A passing verifier report means an independent party can look at the git history, re-run the manual tests, re-read the docs, and re-compile with zero additional context from the implementer.
