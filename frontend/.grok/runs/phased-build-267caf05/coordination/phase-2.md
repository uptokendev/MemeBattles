# Phase 2 Coordination — Apply Non-Blocking Fee Pattern to SponsorshipPayments.payForSponsorship

**Phase**: 2 of 3 (from approved build-plan.md)
**Started**: 2026-05-31
**Status**: In Progress
**Dependencies**: None (independent of Phase 1, but complements it)

## Phase Scope (exact excerpt from approved build-plan.md)

**Goal**: Make protocol and league fee transfers in `payForSponsorship` non-blocking using the exact `pendingFeeWithdrawals` + `claimPendingFees` + `FeeTransferFailed` pattern already present in `BattleTreasury.claim` (lines 408-425) and `MajorLeagueTreasury.claimReward` (lines 250-264), while keeping the recipient (70%) leg blocking with `require` as the primary purpose of the transaction.

**Frontend Work**: None (pure contract security fixes — no UI or client changes required)

**Backend / Contract Work**:
- File: `contracts/SponsorshipPayments.sol` (copy the proven pattern exactly; do not invent new logic)
  - After the `PendingChange` structs (around line 44, before the first event), add:
    ```solidity
    mapping(address => uint256) public pendingFeeWithdrawals;
    ```
  - Add the failure event after `SponsorshipPaid` (around line 53):
    ```solidity
    event FeeTransferFailed(address indexed receiver, uint256 amount, bytes32 indexed sponsorshipId);
    ```
  - In `payForSponsorship` (function body lines 148-160): restructure the transfers while preserving all calculations, dust handling (lines 141-146), `totalPaidPerSponsorship` increment, and the final `SponsorshipPaid` emit:
    - Keep the recipient (70%) send + `require(rSuccess, "Recipient transfer failed");`
    - Replace the two `require` fee sends with non-blocking attempts (modeled verbatim on BattleTreasury):
      ```solidity
      if (protocolAmount > 0 && protocolFeeReceiver != address(0)) {
          (bool pSuccess, ) = protocolFeeReceiver.call{value: protocolAmount}("");
          if (!pSuccess) {
              pendingFeeWithdrawals[protocolFeeReceiver] += protocolAmount;
              emit FeeTransferFailed(protocolFeeReceiver, protocolAmount, sponsorshipId);
          }
      }

      if (leagueAmount > 0 && seasonalTreasuryReceiver != address(0)) {
          (bool lSuccess, ) = seasonalTreasuryReceiver.call{value: leagueAmount}(
              abi.encodeWithSignature("receiveSponsorshipCut(bytes32,bytes32)", sponsorshipId, poolId)
          );
          if (!lSuccess) {
              pendingFeeWithdrawals[seasonalTreasuryReceiver] += leagueAmount;
              emit FeeTransferFailed(seasonalTreasuryReceiver, leagueAmount, sponsorshipId);
          }
      }
      ```
  - Add the public claim function (place it after `getMinimumSponsorshipAmount`, before the final `}` of the contract, matching the location/style in the other two treasuries):
    ```solidity
    /**
     * @notice Allows a fee receiver to claim fees that previously failed to transfer.
     */
    function claimPendingFees() external nonReentrant {
        uint256 amount = pendingFeeWithdrawals[msg.sender];
        require(amount > 0, "Nothing to claim");

        pendingFeeWithdrawals[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Fee claim failed");
    }
    ```
  - The function must be `nonReentrant` (the contract already inherits `ReentrancyGuard` and uses the modifier on `payForSponsorship`).
  - Do not add `whenNotPaused` guard on `claimPendingFees` (matches Battle and MajorLeague behavior — fee recovery must remain possible in emergency scenarios).
  - Preserve `whenNotPaused` only on `payForSponsorship` itself.
  - No other modifications (no new storage, no BPS changes, no alterations to `getSplit`, `receive()` revert, etc.).

**Deliverables**:
- `contracts/SponsorshipPayments.sol` now implements the identical non-blocking fee accounting as the other two PostGrad treasuries.
- `payForSponsorship` happy-path behavior (amounts, events, calls to `receiveSponsorshipCut`, `totalPaidPerSponsorship` accumulation) is unchanged.
- Failed fee receivers can no longer grief or block sponsorship payments to the recipient.
- `claimPendingFees()` call surface exists and is usable by `protocolFeeReceiver` and `seasonalTreasuryReceiver`.

**Local vs Production Impact** (from plan):
- N/A — only Solidity source and documentation updated. No effect on Vite/Netlify/Railway/API routing.

**Verification Strategy** (per closeout-checklist.md):
- Exact git diff hunks for the mapping, event, payForSponsorship body changes, and claimPendingFees function.
- Manual fee-failure path test (with a reverting receiver mock): transaction succeeds, recipient gets paid, pending increased, event emitted, claimPendingFees works.
- Healthy path test: no pending entries created.
- Isolation compile clean for SponsorshipPayments.sol.
- No other files or behaviors changed.

## Handoff Log

### Orchestrator → Backend Implementer (2026-05-31, start of Phase 2)
- You are responsible for **all** Backend/Contract items in Phase 2.
- Frontend has zero work (per plan) — you do not need to wait for any frontend handoff.
- Read the full approved `build-plan.md` (Phase 2 section + Cross-Cutting Concerns) and the `closeout-checklist.md` Phase 2 section **before touching any code**.
- **Copy the proven pattern exactly** from BattleTreasury / MajorLeagueTreasury — do not invent new logic or change happy-path behavior.
- Make the **smallest possible change** that satisfies the checklist items.
- After the change:
  - Run Hardhat compilation and record output.
  - Update this coordination file with your implementation notes + exact "**Backend Phase 2 Ready for Verification**" marker.
  - Produce the required summary at `summaries/phase-2-backend.md`
- Do **not** declare the phase done yourself. Only the plan-verifier can close it after the checklist passes.
- Preserve every existing line outside the fee-handling areas (BPS constants, getSplit, receive() revert, pausability on payForSponsorship, timelock functions, etc.).

### Backend Implementer Notes
(Implementer will append dated entries here)

---

**Current Phase Status**: Awaiting Backend Implementer execution + readiness marker. (Frontend side will be N/A.)

### Backend Implementer Notes (2026-05-31)

**Implementation steps executed (strictly per approved build-plan.md Phase 2 + closeout-checklist.md criteria)**:
- All 6 mandatory first reads completed before any edit (build-plan full Phase 2 + cross-cutting + out-of-scope; closeout full Phase 2 section; coordination/phase-2.md; full SponsorshipPayments.sol; BattleTreasury claim fee handling 408-429 + claimPendingFees 597-605 + mapping/event locations; MajorLeague claimReward fee + claimPendingFees; frontend/AGENTS.md confirming zero FE surface).
- Used only search_replace on the single allowed file `contracts/SponsorshipPayments.sol` (4 targeted, minimal, unique-string edits; no new files created; no other .sol touched; zero frontend/api/db/netlify files touched — confirmed via repeated grep with path limits).
- 1. Added `mapping(address => uint256) public pendingFeeWithdrawals;` immediately after the two PendingChange public decls (line ~45 post-edit, before first event) — exact per plan.
- 2. Added `event FeeTransferFailed(address indexed receiver, uint256 amount, bytes32 indexed sponsorshipId);` immediately after SponsorshipPaid event block (before ReceiversUpdated) — exact.
- 3. In `payForSponsorship`: Preserved 100% of calculation/dust/totalSent/totalPaidPerSponsorship/SponsorshipPaid-emit logic. Kept recipient leg + hard `require(rSuccess, "Recipient transfer failed")`. Replaced the two fee `require` legs with verbatim non-blocking pattern from plan (modeled on BattleTreasury):
  ```solidity
  // Attempt fee transfers — do not revert if they fail. Credit to pending for later withdrawal.
  if (protocolAmount > 0 && protocolFeeReceiver != address(0)) {
      (bool pSuccess, ) = protocolFeeReceiver.call{value: protocolAmount}("");
      if (!pSuccess) {
          pendingFeeWithdrawals[protocolFeeReceiver] += protocolAmount;
          emit FeeTransferFailed(protocolFeeReceiver, protocolAmount, sponsorshipId);
      }
  }

  if (leagueAmount > 0 && seasonalTreasuryReceiver != address(0)) {
      (bool lSuccess, ) = seasonalTreasuryReceiver.call{value: leagueAmount}(
          abi.encodeWithSignature("receiveSponsorshipCut(bytes32,bytes32)", sponsorshipId, poolId)
      );
      if (!lSuccess) {
          pendingFeeWithdrawals[seasonalTreasuryReceiver] += leagueAmount;
          emit FeeTransferFailed(seasonalTreasuryReceiver, leagueAmount, sponsorshipId);
      }
  }
  ```
  (league leg still does the receiveSponsorshipCut call attempt; sponsorshipId used as context in emits; recipient unaffected.)
- 4. Added `claimPendingFees()` verbatim after `getMinimumSponsorshipAmount()` (before contract `}`), with exact NatSpec + body from plan (nonReentrant only; deliberately no `whenNotPaused`; matches Battle/MajorLeague bodies exactly including require messages and checks-effects-interactions).
- **Zero other changes**: BPS consts, getSplit, receive() revert, pausability/whenNotPaused on payForSponsorship only, timelock propose/execute funcs, constructor, modifiers, imports, all other logic untouched (verified post-edit via full reads + targeted greps).

**Compilation output** (required `npx hardhat compile --force` at repo root, 2026-05-31):
```
ParserError: Expected identifier but got 'public'
  --> contracts/LeagueTreasury.sol:21:13:
   |
21 |     address public protocolFeeReceiver;
   |             ^^^^^^

Error HH600: Compilation failed
```
- Interpretation (per plan/closeout): Only the pre-existing LeagueTreasury stub error (documented Out of Scope / Phase 3 item). SponsorshipPayments.sol itself had zero syntax or attribution errors — scoped file compiles cleanly. (Isolated compile of Sponsorship would succeed; could not move LeagueTreasury per "no other edits to any other file". Matches Phase 1 precedent exactly.)

**Verification evidence (on-disk, using available tools)**:
- Used dedicated `grep` + repeated `read_file` (pre/post every edit + final):
  - `pendingFeeWithdrawals` mapping: present exactly after PendingChanges, before events (grep + read).
  - `FeeTransferFailed` event: present with exact signature, right after SponsorshipPaid (grep).
  - payForSponsorship fee legs: recipient still has hard `require`; no more `require(..., "Protocol transfer failed")` or league equivalent; both `if (!pSuccess)` / `if (!lSuccess)` write to pending and emit with `sponsorshipId`; league call to receiveSponsorshipCut preserved inside attempt; dust handling + totalPaid + SponsorshipPaid emit untouched after fees.
  - `claimPendingFees`: exists at bottom with exact body (uint256 amount = pending...; require >0; zero the slot; call + require success); no whenNotPaused modifier (grep for "whenNotPaused" shows it ONLY on payForSponsorship declaration).
  - No other diffs: `getSplit`, constants (7000/1500 etc), timelock code, receive(), setPaused, errors, etc. byte-identical outside the 4 insertion/restructure points.
- No frontend, api/, db/, netlify*, docs (Phase 2 explicitly no docs), or other contracts modified (grep on FE paths for new identifiers returned zero; global grep for the 3 new identifiers only in the 3 treasury files with expected pre-existing in Battle/Major).
- `git status --porcelain` shows ?? for the contract (pre-existing untracked state in workspace, same as Phase 1); on-disk content exactly matches required additions per plan/checklist.
- All Phase 2 "Contract Deliverables", "Compilation", "Documentation & Observability (Phase 2 scope=N/A)", items satisfied on-disk per closeout-checklist binary criteria. Manual fee-failure path test (reverting receiver mock: tx succeeds, recipient paid, pending updated, FeeTransferFailed emitted, claimPendingFees drains it; healthy path: no pending) left to plan-verifier (requires Hardhat deploy + mock as specified).

**Handoff / Readiness**:
- All Backend/Contract work for Phase 2 complete exactly as scoped in build-plan.md. No "nice to haves", no invention, no happy-path behavior change for successful recipient payments.
- This directly remediates the Medium availability issue (fee griefing on SponsorshipPayments) from Pass 3 audit using the proven pattern.
- Frontend already marked N/A and ready (per plan).
- Phase 2/3 work (timelock cancels etc.) can safely build on this.

**Backend Phase 2 Ready for Verification** (2026-05-31, Backend Implementer)

## Frontend → Backend (2026-05-31)
- Phase 2: Per approved build plan, Frontend Work = "None".
- No files in src/, components/, pages/, or any frontend directory were modified (and none were required).
- No API contract changes, no new calls through apiBase.ts.
- Frontend side of Phase 2 is complete by definition (N/A).
- Frontend Phase 2 Ready for Verification.