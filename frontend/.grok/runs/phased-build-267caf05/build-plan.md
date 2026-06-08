# Build Plan: PostGrad Treasury Security Remediation (Pass 3 Audit Findings)

**Idea Source**: `frontend/.grok/runs/phased-build-267caf05/idea.md` (references `frontend/.grok/architect-feed/contractaudits3.md`)
**Created By**: Architect Agent (phased-build skill)
**Date**: 2026-05-31
**Approved Version**: 2026-05-31 (user explicit approval via ask_user_question on "Approve plan and checklist as-is. Proceed with Phase 1.")
**Status**: Approved

## Approval Record
- **Date**: 2026-05-31
- **Decision**: User selected "Approve plan and checklist as-is. Proceed with Phase 1."
- **Approver**: Direct user confirmation in the phased-build conversation
- **Next action**: Execute Phase 1 (EIP-712 fix) with implementer + verifier gate. Subsequent phases only after clean verifier sign-off on prior phase.

---

## Overview

This effort remediates the two remaining blocking security findings from the internal Pass 3 audit on the PostGrad treasury contracts (`BattleTreasury.sol`, `MajorLeagueTreasury.sol`, `SponsorshipPayments.sol`). The highest-priority item is a correctness bug in EIP-712 digest construction inside `resolveWinner` that would cause all standard signatures to fail. The second is an availability issue where fee receiver reverts can block legitimate sponsorship payments. A small set of recommended operational polish items (timelock cancellation, dedicated event, documentation alignment, and monorepo compile hygiene) are included as a final phase.

All work is strictly limited to the three contracts + targeted documentation updates. No frontend, no backend API routes, no database changes, no new dependencies, and no alterations to fee percentages, timelock delay (2 days), or trust model roles occur. Changes follow the exact non-blocking `pendingFeeWithdrawals` + `claimPendingFees` pattern already proven in `BattleTreasury` and `MajorLeagueTreasury`.

## Success Criteria (High Level)

- The EIP-712 bug is eliminated; `resolveWinner` accepts signatures produced by standard EIP-712 libraries (ethers `signTypedData`, hardware wallets, etc.).
- Sponsorship payments to the recipient succeed even when `protocolFeeReceiver` or `seasonalTreasuryReceiver` revert; failed cuts are recorded in `pendingFeeWithdrawals` and are claimable.
- All three contracts compile cleanly (after any drive-by stub hygiene).
- Documentation accurately reflects the fixed behavior and off-chain signing requirements.
- 100% of the closeout checklist items pass independent verification with concrete evidence (git diffs, manual signature reconstruction + recover tests, event emission checks, etc.).
- Git diff remains minimal, well-commented, and auditor-friendly.

## Out of Scope

- Any frontend UI, components, pages, client state, ABI consumption, or calls through `src/lib/apiBase.ts` / `apiFetch`.
- Any new or modified backend/API routes (Railway-side Node/Express code in `frontend/api/` or `frontend/server/`).
- Database / Supabase schema / migrations.
- Comprehensive test suite (targeted manual verification procedures are included; no new files under `test/` or `contracts/test/`).
- Touching unrelated contracts: `LaunchFactory.sol`, `LaunchCampaign.sol` (even though they use `toEthSignedMessageHash`), `LeagueTreasury.sol` (except the minimal compile-stub drive-by in Phase 3), `TreasuryVault*`, `TreasuryRouter`, etc.
- Changing fee BPS values, `TIMELOCK_DELAY`, `RECIPIENT_BPS` etc., or introducing new roles / timelocks on `setAuthorizedCreator` or `distributors`.
- Deployment scripts, multisig procedures, or key rotation.
- Gas optimizations or major refactors.
- ERC20 support (remains BNB-only).
- Any direct `fetch()` or bypass of central API layer (N/A for this pure contract effort).
- Updates to `netlify.toml`, `vite.config.ts`, `hardhat.config.ts`, `package.json`, or environment variable handling.

---

## Phases

### Phase 1: Fix EIP-712 Digest Construction Bug in BattleTreasury.resolveWinner

**Goal**: Remove the incorrect outer `toEthSignedMessageHash` wrapper around the already-complete EIP-712 digest in `resolveWinner` so that standard typed-data signatures succeed and winners can claim.

**Frontend Work**: None (pure contract security fixes — no UI or client changes required)

**Backend / Contract Work**:
- File: `contracts/BattleTreasury.sol`
  - Line 6: Remove the unused import `"@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";` (it will no longer be referenced after the digest fix).
  - Lines 334-375 (`resolveWinner` function and preceding NatSpec + typehash block at 317-320): 
    - Replace the buggy digest construction (currently lines 363-365):
      ```solidity
      bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
          keccak256(abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash))
      );
      ```
      with the correct canonical EIP-712 form (matching the audit recommendation and the intent of the existing `_domainSeparatorV4` + `RESOLVE_WINNER_TYPEHASH`):
      ```solidity
      bytes32 digest = keccak256(
          abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash)
      );
      ```
    - Update the NatSpec comment (lines 334-337) and add an explicit "Off-chain signing requirements" paragraph immediately above or inside the function documenting:
      - The signed struct is the full `ResolveWinner` type with 8 fields.
      - Callers/resolvers **MUST** use standard EIP-712 signing (`ethers.signTypedData` / `signTypedData_v4`, Ledger Live typed data, etc.).
      - Personal sign of the struct hash (or of the inner EIP-712 hash) will no longer work after this fix.
    - Preserve the rest of the function, struct encoding, `_domainSeparatorV4`, events, errors, and all other logic exactly.
- No changes to any other `.sol` file, no new functions, no storage changes.

**Deliverables**:
- `contracts/BattleTreasury.sol` with the exact one-line logical change to digest construction, import removed, and clarifying NatSpec/comments added.
- The happy-path `resolveWinner` + `claim` flow behavior is unchanged for correctly-signed transactions.
- Inline documentation now makes the required off-chain signing method unambiguous for future backend resolver implementers.

**Dependencies**: None (highest-priority standalone correctness fix)

**Integration Points with Other Phases**:
- Independent of Phase 2 and Phase 3.
- The signature format change has an off-chain impact on any backend code that will call `resolveWinner` (see Cross-Cutting Concerns section below). This must be coordinated before any production deployment of the fixed contract.

**Estimated Complexity**: Low

**Local vs Production Impact**:
- N/A — only Solidity source and documentation updated. No effect on Vite/Netlify/Railway/API routing.
- Will this work with `npm run dev` locally? N/A (no frontend involvement).
- Will this work after a Netlify deploy (calls going through the Railway redirect)? N/A.
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No.
- Do we need to touch `netlify.toml` or environment variable handling? No.
- Verification path: `npm run compile` (or Hardhat targeted compilation / direct solc on the single file) at repository root. Completely independent of the frontend dev server, proxy, or any deployed Netlify site. The contracts are not yet wired into the live frontend or backend.

---

### Phase 2: Apply Non-Blocking Fee Pattern to SponsorshipPayments.payForSponsorship

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

**Dependencies**: None (independent of Phase 1)

**Integration Points with Other Phases**:
- Complements Phase 1 (both close remaining Pass 3 blockers).
- Phase 3 polish can safely add cancellation and events on top of the updated SponsorshipPayments.

**Estimated Complexity**: Low

**Local vs Production Impact**:
- N/A — only Solidity source and documentation updated. No effect on Vite/Netlify/Railway/API routing.
- Will this work with `npm run dev` locally? N/A.
- Will this work after a Netlify deploy (calls going through the Railway redirect)? N/A.
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No.
- Do we need to touch `netlify.toml` or environment variable handling? No.
- Verification uses Hardhat at root only. No frontend or Railway backend impact.

---

### Phase 3: Operational Polish — Timelock Cancellations, Dedicated Event, Documentation, and Compile Hygiene

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

**Dependencies**: Phases 1 and 2 must be complete (the contracts must already contain the corrected EIP-712 logic and the `pendingFeeWithdrawals` mapping in Sponsorship before adding cancels and the new event on top of the hardened surfaces).

**Integration Points with Other Phases**:
- Builds directly on the storage and function surfaces introduced/fixed in Phases 1+2.
- All documentation updates reference the changes from the prior phases.

**Estimated Complexity**: Low (many small, mechanical additions following existing patterns)

**Local vs Production Impact**:
- N/A — only Solidity source and documentation updated. No effect on Vite/Netlify/Railway/API routing.
- Will this work with `npm run dev` locally? N/A.
- Will this work after a Netlify deploy (calls going through the Railway redirect)? N/A.
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No.
- Do we need to touch `netlify.toml` or environment variable handling? No.
- After Phase 3 the monorepo `npm run compile` target becomes green (modulo any future unrelated issues). Verification remains root-level Hardhat only.

---

## Cross-Cutting Concerns

- **Signature / Off-chain Coordination (Critical)**: The Phase 1 digest fix changes the exact hash that `resolveWinner` expects. Any future backend resolver code (Railway API layer, not yet implemented in `frontend/api/`) that produces signatures for `resolveWinner` **must** switch from any personal_sign / wrapped-hash approach to standard EIP-712 typed data signing. Recommended implementation (ethers v6 / viem / web3.py equivalent):

  ```ts
  // Domain matches BattleTreasury._domainSeparatorV4 exactly
  const domain = {
    name: "BattleTreasury",
    version: "1",
    chainId: 56, // or 97 for testnet, etc.
    verifyingContract: "0x..." // BattleTreasury address
  };
  const types = {
    ResolveWinner: [
      { name: "battleId", type: "bytes32" },
      { name: "creator", type: "address" },
      { name: "challenger", type: "address" },
      { name: "winner", type: "address" },
      { name: "stakeAmount", type: "uint256" },
      { name: "depositDeadline", type: "uint256" },
      { name: "resolutionDeadline", type: "uint256" },
      { name: "seasonalPoolId", type: "bytes32" },
    ]
  };
  const value = { battleId, creator, challenger, winner, stakeAmount: battle.stakeAmount, depositDeadline: battle.depositDeadline, resolutionDeadline: battle.resolutionDeadline, seasonalPoolId: battle.seasonalPoolId };
  const signature = await signer.signTypedData(domain, types, value);
  // Then call resolveWinner(battleId, winner, signature)
  ```

  Pre-fix signatures (if any were generated against the buggy digest) will fail after deployment. Document this in resolver runbooks.

- **Money-moving safety**: All edits preserve ReentrancyGuard, checks-effects-interactions (winner/recipient paid before fee attempts), and the "pay user first, never block on fee receivers" principle.

- **AGENTS.md compliance**: This is a pure smart-contract change at the repository root (Hardhat). No frontend API calls, no Netlify/Railway surface, no `apiBase.ts` involvement. The "Local vs Production Impact" answers above are therefore N/A for every phase, satisfying the architect rules in `frontend/AGENTS.md` and the phased-build skill requirements.

- **Compilation & verification**: After Phase 3 the monorepo compiles cleanly. Earlier phases can be verified in isolation by compiling the specific modified file (or accepting the single known pre-existing error from the LeagueTreasury stub until Phase 3).

- **Event & storage layout**: New events and the `pendingFeeWithdrawals` mapping in SponsorshipPayments are append-only additions; existing storage slots and event signatures for non-fee paths are untouched.

- **Testing / verification strategy**: No new automated test files. Verifier uses git diff for exact textual changes + manual reconstruction of EIP-712 digests + on-chain static calls (via Hardhat console or a one-off script) + event emission checks via transaction receipts. All checklist items are written to be executable by an independent agent without the original implementer.

## Future Phases / Follow-ups (not in this effort)

- Professional third-party audit of the three contracts (post-remediation).
- Implementation of the off-chain battle resolver (backend) with the correct EIP-712 signing shown above, plus integration tests.
- Frontend consumption of the treasuries (battle creation/deposit/claim flows, sponsorship UI, league prize UIs) — will require ABI sync via `npm run sync:frontend-abis` and new components/pages.
- Unit / property tests for the fixed paths (e.g. fee failure + claimPendingFees, signature positive/negative cases, timelock cancel).
- Potential future hardening: timelock on `setAuthorizedCreator`, rate limits, or moving creator authorization behind a minimal factory (if risk tolerance changes).
- War Pool reuse of BattleTreasury logic (separate decision).
- Mainnet deployment + monitoring runbooks for the new `FeeTransferFailed`, cancellation, and `BattleCutReceived` events.

---

**This plan is intentionally narrow, sequential, and evidence-oriented so that a junior-to-mid engineer (or verifier agent) can execute or validate any single phase with zero ambiguity.**
