# Build Plan: contractaudits5.md Remediation (PostGrad Treasury Security — Remaining Auditor Findings)

**Idea Source**: `frontend/.grok/runs/phased-build-da26e79f/idea.md` (full content of the third audit result / contractaudits5.md; identical to the copy placed in the run directory)
**Created By**: Architect Agent (phased-build skill)
**Date**: 2026-06-01
**Approved Version**: (to be filled after user approval)
**Status**: Draft

---

## Overview

This effort converts the 6 concrete remaining security/operational findings identified in the post-ec52d84a re-audit (contractaudits5.md) of the three PostGrad treasury/payment contracts into a phased, verifiable remediation. The contracts (`contracts/BattleTreasury.sol`, `contracts/MajorLeagueTreasury.sol`, `contracts/SponsorshipPayments.sol`) were substantially hardened in the prior phased-build-ec52d84a run (which fully closed the 11 findings + 9-item Deployment Gate Checklist from contractaudits4.md using 2-day timelocks, Pending* structs, propose/execute/cancel + events, nonReentrant + CEI + recredit-on-fail, custom errors, NatSpec, and append-only storage). The current audit correctly flags one High control-bypass (immediate setDistributorDailyLimit undercutting the now-timelocked distributor proposal), one Medium/High frontrunning/DoS vector on globally-unique sponsorshipId, one Medium attribution loss on league-cut retry paths, one Medium winner-payout lock on rejecting contracts, and two Low items (one-sided refund state inconsistency + source addresses unset at deployment).

The plan produces **only** changes inside the three `.sol` files, minimal targeted updates to the five key documentation files (`TRUST_MODEL.md`, `SECURITY_AUDIT_REPORT.md`, `USER_INTERACTION_GUIDE.md`, `POSTGRAD_REVENUE_DECISION_TABLE.md`, `POSTGRAD_TREASURY_ARCHITECTURE.md`), and extensions to the existing `test/PostGradTreasury.security.spec.ts` (the gate harness introduced in ec52d84a Phase 5). All changes strictly follow the exact patterns proven in ec52d84a (and its Pass 3 predecessor in phased-build-267caf05). The explicit success bar is that an independent verifier agent, starting from a clean checkout, can execute the procedures in the accompanying `closeout-checklist.md` (using only `git`, `npm`, Hardhat at repository root, and the RevertingReceiver/AcceptingReceiver mocks) and confirm 100% pass on every item, including re-exercise of the full prior 11-item Gate plus the 6 new findings.

## Success Criteria (High Level)

- Every one of the 6 findings in contractaudits5.md receives a concrete, code-level fix (or a deliberate, documented design decision with rationale) using the exact patterns mandated from ec52d84a.
- The prior 11-item Deployment Gate Checklist from contractaudits4.md is re-exercised in full with zero regressions (happy-path winner claim, one-sided refund, sponsorship split, allocate+claimReward, EIP-712 resolve, direct ETH behavior, etc. all continue to pass).
- `npx hardhat compile --force` at repository root succeeds with zero new errors on the three contracts.
- All new functions, events, modifiers, storage variables, and EIP-712 fields are added in an append-only manner (no storage layout risk).
- The extended `test/PostGradTreasury.security.spec.ts` (new its for the 6 findings + re-execution of all prior Gate scenarios) runs cleanly with "X passing" (target 18-20 its) on every re-execution.
- Documentation is updated with dated "contractaudits5 / phased-build-da26e79f" notes so a junior engineer understands the new sponsorship EIP-712 flow, specialized retry*Cut paths, winner payoutAddress, one-sided settled flag, and source ctor initialization.
- 100% of the items in `closeout-checklist.md` (including the mandatory Global / Deployment Gate section) pass independent verification with git-diff, grep -n, Hardhat console transcripts, and event/state evidence.
- Final delta security review (in final-closeout.md) confirms no new reentrancy, access-control, griefing, or accounting issues were introduced by the EIP-712 verify, the two new per-ID pending*Cut mappings + retry*Cut .call sites, the conditional winner payout call, or the ctor source wiring.

## Out of Scope

- Any frontend work whatsoever: no changes under `frontend/src/`, no ABI consumption, no calls through `src/lib/apiBase.ts`, no updates to `frontend/abis/`, no `compile:frontend-abis`.
- Any backend / Railway work: no routes in `frontend/api/`, no Supabase changes, no indexer updates.
- Deployment, key management, multisig setup, or actual deployment of remediated contracts (deployment scripts and `deployments/*.json` untouched).
- A full professional third-party audit (this remains an internal remediation pass).
- Any modification of fee percentages (protocolFeeBps, seasonalFeeBps, RECIPIENT_BPS etc.), `TIMELOCK_DELAY` (remains exactly 2 days), or the 85/5/10 and 70/15/15 split ratios.
- ERC20 support (all three contracts remain native-BNB/ETH only).
- New roles beyond the minimal sponsorshipAuthorizer (with its own timelocked Pending* following the exact ec52d84a pattern for minimumSponsorshipAmount / maxAllocationPerTx).
- Touching any other contract (`LeagueTreasury.sol`, `TreasuryVault*`, `Launch*`, `TreasuryRouter`, `CommunityRewardsVault`, mocks beyond using the existing RevertingReceiver/AcceptingReceiver, etc.).
- Updates to `netlify.toml`, `vite.config.ts`, `hardhat.config.ts`, `package.json`, environment variables, or any CI workflow.
- Comprehensive new test suites beyond the minimal targeted extensions to the existing `test/PostGradTreasury.security.spec.ts` required to satisfy the Gate Checklist (existing patterns in that file + other *.spec.ts must be followed).
- Changes to the core Battle EIP-712 domain separator or RESOLVE_WINNER_TYPEHASH string beyond the single additive `,address payoutAddress` field required for the winner-payout Medium finding.
- Production keys, testnet deploys, or any operational runbooks outside the five .md docs.

---

## Phases

### Phase 1: Distributor Limit Control Integrity (High-Severity Bypass Remediation)

**Goal**: Eliminate the High-severity control bypass in which an immediate-onlyOwner `setDistributorDailyLimit` can undercut the timelocked `proposeDistributorChange` / `executeDistributorChange` flow (and the per-distributor limits now atomically bound at proposal time since ec52d84a Phase 3). Remove the immediate setter entirely and replace it with a new timelocked `proposeDistributorLimitUpdate` / `executeDistributorLimitUpdate` / `cancelPendingDistributorLimitUpdate` path (exact pattern of PendingMaxAllocationPerTx + propose/execute/cancel from ec52d84a Phase 5, plus the nonzero enforcement and per-distributor binding already used for initial distributor enablement). This restores the intended blast-radius model for the powerful distributor role.

**Frontend Work**: None (pure contract + docs + test remediation — no UI, no client state, no API client changes).

**Backend / Contract Work** (exact locations and patterns from current post-ec52d84a sources):

- `contracts/MajorLeagueTreasury.sol`
  - Remove (delete entirely) the immediate `setDistributorDailyLimit` function at current lines 211-213. (Verifier will confirm via `git diff` that the function body and declaration are absent; no stub or revert wrapper — full removal is acceptable pre-deployment.)
  - Add (append-only, after the existing distributor change code around line 209 and near the other Pending* structs at 573+) the following:
    - New struct (modeled exactly on PendingMaxAllocation and the limit-carrying PendingDistributorChange):
      ```solidity
      struct PendingDistributorLimitUpdate {
          address distributor;
          uint256 dailyLimit;
          uint256 maxPerTx;
          uint256 executeAfter;
          bool exists;
      }
      PendingDistributorLimitUpdate public pendingDistributorLimitUpdate;
      ```
    - New events (append to the events section near lines 112-116, following Phase 5 naming):
      ```solidity
      event DistributorLimitUpdateProposed(address indexed distributor, uint256 dailyLimit, uint256 maxPerTx, uint256 executeAfter);
      event DistributorLimitUpdateExecuted(address indexed distributor, uint256 dailyLimit, uint256 maxPerTx);
      event PendingDistributorLimitUpdateCancelled();
      ```
    - New error (append near other custom errors at 121-125): `error InvalidDistributorLimitUpdate();`
    - Three new functions (exact propose/execute/cancel + 2-day TIMELOCK_DELAY + onlyOwner + events + delete pattern from executeMaxAllocationPerTx / proposeDistributorChange):
      - `function proposeDistributorLimitUpdate(address distributor, uint256 dailyLimit, uint256 maxPerTx) external onlyOwner`
        - Must require `distributors[distributor]` (only for currently-enabled distributors).
        - Must require `dailyLimit > 0 && maxPerTx > 0` (same nonzero rule as initial proposal).
        - Sets the pending struct with `executeAfter = block.timestamp + TIMELOCK_DELAY`.
        - Emits `DistributorLimitUpdateProposed`.
      - `function executeDistributorLimitUpdate() external onlyOwner`
        - Validates exists + timelock expired.
        - Sets `distributorDailyLimit[change.distributor] = change.dailyLimit;` and same for maxPerTx (mirrors executeDistributorChange lines 171-172).
        - Emits `DistributorLimitUpdateExecuted` + the legacy `DistributorUpdated` for compatibility if desired.
        - `delete pendingDistributorLimitUpdate;`
      - `function cancelPendingDistributorLimitUpdate() external onlyOwner`
        - `delete ...; emit PendingDistributorLimitUpdateCancelled();`
  - Update NatSpec / comments:
    - At the former setDistributorDailyLimit site (now removed): add a one-line comment "Removed in phased-build-da26e79f Phase 1 (contractaudits5 High finding). Limits are now exclusively controlled via the timelocked proposeDistributorChange (initial) and proposeDistributorLimitUpdate (subsequent) paths."
    - Update the allocateReward comment block (around 307-320) and the distributor section header (144-146) to reference the new timelocked limit-update path.
    - Add a short comment at the `distributorDailyLimit` / `distributorMaxPerTx` mappings (583-586) cross-referencing both timelocked paths.
  - No changes to `proposeDistributorChange` / `executeDistributorChange` (they continue to atomically bind initial limits on enable).

- `contracts/TRUST_MODEL.md`: Add a short paragraph under "Key Privileged Roles → 1. Contract Owner" (or in the distributor subsection) stating that daily/maxPerTx limit changes for existing distributors are now exclusively timelocked (2-day delay + cancel) via the new proposeDistributorLimitUpdate flow. Cross-reference the removal of the immediate setter.

**Deliverables**:
- `setDistributorDailyLimit` function is completely absent from MajorLeagueTreasury.sol (git diff + grep confirm zero occurrences of the old name).
- New `PendingDistributorLimitUpdate` struct + three functions + three events present and following the exact ec52d84a Phase 5 / distributor-change patterns (nonzero enforcement, timelock, events, onlyOwner cancel).
- Only timelocked paths can now modify per-distributor dailyLimit / maxPerTx after initial enablement.
- NatSpec + inline comments updated with "phased-build-da26e79f Phase 1" / "contractaudits5 High" markers.
- One coordination note in `coordination/phase-1.md` (populated by implementer).

**Dependencies**: None (self-contained on MajorLeagueTreasury + one doc).

**Integration Points with Other Phases**:
- Phase 4 gate spec will add an it that confirms `major.setDistributorDailyLimit` is undefined and that proposeDistributorLimitUpdate + 2d jump + execute successfully updates limits (and that 0-limit proposals revert).
- No interaction with sponsorship, Battle claim/refund, or source ctor work.
- Phase 3 (ctor) touches the same file but at completely disjoint locations (constructor only).

**Estimated Complexity**: Low-Medium (pure removal + one new simple uint-timelock path modeled on already-shipped Phase 5 code).

**Local vs Production Impact** (per `frontend/AGENTS.md` mandatory questions — identical for all phases):
- Does this change affect any API calls? No — pure on-chain Solidity changes only.
- Will the change work with `npm run dev` locally? N/A (no frontend involvement; verification uses Hardhat at repository root).
- Will the change work after a Netlify deploy (calls going through the Railway redirect)? N/A (contracts are not yet invoked from the deployed frontend; this is pre-deployment remediation).
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No.
- Do we need to touch `netlify.toml` or environment variable handling? No.
- Verification path: `npx hardhat compile --force` + targeted Hardhat console / updates to `test/PostGradTreasury.security.spec.ts` (in Phase 4) that deploy MajorLeagueTreasury and exercise the new propose/execute limit-update path + confirm the old immediate setter is gone. Completely independent of Vite dev server, Netlify proxy, or Railway.

---

### Phase 2: SponsorshipPayments Authorization & League-Cut Attribution (Medium/High Frontrunning + Medium Retry Metadata Loss)

**Goal**: Close the Medium/High frontrunning/DoS vector on globally-unique `sponsorshipId` (any caller can pre-pay a predictable ID with a wrong recipient and block the legitimate sponsor) by adding a minimal, secure EIP-712 backend signature requirement (exact pattern copied from BattleTreasury's RESOLVE_WINNER flow: ECDSA import + using, typehash constant, _domainSeparatorV4 helper, digest.recover, custom InvalidSignature error). Simultaneously address the Medium attribution loss on retryPendingFee for league cuts by adding per-ID `pendingFailed*Cut` mappings + specialized `retryBattleCut(bytes32 battleId, bytes32 poolId)` / `retrySponsorshipCut(bytes32 sponsorshipId, bytes32 poolId)` functions that re-deliver the exact metadata call to MajorLeagueTreasury.receive*Cut (instead of plain ETH → unallocatedBalance). All changes follow ec52d84a nonReentrant + CEI + recredit-on-fail + append-only + NatSpec rules.

**Frontend Work**: None.

**Backend / Contract Work**:

- `contracts/SponsorshipPayments.sol`
  - Add import + using (after existing imports at top, exact style of BattleTreasury lines 5+29):
    ```solidity
    import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
    ...
    using ECDSA for bytes32;
    ```
  - Add (append-only near other Phase 5 PendingMinimum at 60-66):
    - New struct + storage for authorizer (timelocked, following PendingMinimum exactly):
      ```solidity
      struct PendingAuthorizer {
          address newValue;
          uint256 executeAfter;
          bool exists;
      }
      PendingAuthorizer public pendingSponsorshipAuthorizer;
      address public sponsorshipAuthorizer; // Set at construction or via timelocked propose/execute (Phase 2, contractaudits5)
      ```
    - New events (near other Phase 5 events at 112+):
      ```solidity
      event SponsorshipAuthorizerProposed(address indexed newAuthorizer, uint256 executeAfter);
      event SponsorshipAuthorizerExecuted(address indexed newAuthorizer);
      event PendingSponsorshipAuthorizerCancelled();
      ```
    - New errors (near 100 area): `error InvalidSponsorshipAuthorization(); error SponsorshipAuthorizationExpired();`
    - New constant typehash (near minimumSponsorshipAmount or after TIMELOCK_DELAY):
      ```solidity
      bytes32 public constant SPONSORSHIP_AUTH_TYPEHASH = keccak256(
          "SponsorshipAuthorization(bytes32 sponsorshipId,address payer,address recipient,bytes32 poolId,uint256 amount,uint256 deadline)"
      );
      ```
    - Internal helpers (modeled verbatim on Battle _domainSeparatorV4 + resolve logic, lines 465-517):
      - `function _domainSeparatorV4() internal view returns (bytes32) { ... }` (name="SponsorshipPayments", version="1")
      - `function _hashTypedDataV4(bytes32 structHash) internal view returns (bytes32)`
      - `function _verifySponsorshipAuthorization(bytes32 sponsorshipId, address payer, address recipient, bytes32 poolId, uint256 amount, uint256 deadline, bytes calldata signature) internal view`
        - Checks `block.timestamp <= deadline` (else SponsorshipAuthorizationExpired)
        - Builds structHash with the 6 fields + typehash
        - Recovers and requires `== sponsorshipAuthorizer` (else InvalidSponsorshipAuthorization)
    - New timelocked authorizer trio (exact copy of proposeMinimumSponsorshipAmount / execute / cancel at 301-323, placed after the minimum functions):
      - `proposeSponsorshipAuthorizer(address newAuthorizer)`
      - `executeSponsorshipAuthorizer()`
      - `cancelPendingSponsorshipAuthorizer()`
      - (If newAuthorizer == address(0) allowed for "unsigned mode" during transition; documented.)
  - Update `payForSponsorship` (current 214-252):
    - Change signature to `function payForSponsorship(bytes32 sponsorshipId, address recipient, bytes32 poolId, uint256 deadline, bytes calldata signature) external payable nonReentrant whenNotPaused`
    - After the minimum-amount + recipient checks and before the `if (sponsorshipPaid[sponsorshipId])` guard:
      - `if (sponsorshipAuthorizer != address(0)) { _verifySponsorshipAuthorization(sponsorshipId, msg.sender, recipient, poolId, msg.value, deadline, signature); }`
      - (If authorizer is 0, unsigned calls are still accepted for backward-compat during initial deployment window; once authorizer is set, signatures are required. This is the minimal secure binding.)
    - Update the NatSpec (203-213) with full EIP-712 requirements (identical style to Battle's resolveWinner NatSpec): "When sponsorshipAuthorizer is set, the caller must supply a valid EIP-712 signature from that authorizer over the SponsorshipAuthorization struct (sponsorshipId, payer=msg.sender, recipient, poolId, amount=msg.value, deadline). Personal-sign is not accepted. Backend must use ethers.signTypedData with the exact domain and typehash."
    - The existing uniqueness guard + paid flag + split logic + FeeTransferFailed (with sponsorshipId) remain unchanged.
  - In the league cut failure leg (around 249-252): also populate the new per-ID pending (see below).
  - Add the two new per-ID pending mappings + specialized retry functions (append after the existing retryPendingFee + proposeFeeRedirect block at 407+ , following Phase 1 pattern):
    ```solidity
    mapping(bytes32 => uint256) public pendingFailedSponsorshipCut; // sponsorshipId => amount (for attribution-preserving retry)
    ```
    - New events: `SponsorshipCutRetriedWithMetadata(bytes32 indexed sponsorshipId, bytes32 poolId, uint256 amount);` and equivalent `BattleCutRetriedWithMetadata` (for symmetry, even though Battle file also gets one).
    - `function retrySponsorshipCut(bytes32 sponsorshipId, bytes32 poolId) external nonReentrant { ... }`
      - Exact zero-first + amount = pendingFailedSponsorshipCut[...] + require >0 + set 0 + (success = seasonalTreasuryReceiver.call{value}(abi.encodeWithSignature("receiveSponsorshipCut(bytes32,bytes32)", sponsorshipId, poolId))) + on fail restore + revert FeeRetryFailed + on success emit + also decrement pendingFeeWithdrawals[seasonal] if present (to keep aggregates consistent).
  - Add identical `pendingFailedBattleCut`? No — that lives in BattleTreasury (cross-contract coordination is only via the documented events + Major's restricted receive). The sponsorship retry only needs the sponsorshipId version here.
  - Update NatSpec on `retryPendingFee` (388-392) to cross-reference: "For league-cut amounts (seasonalTreasuryReceiver), prefer the specialized retrySponsorshipCut(sponsorshipId, poolId) which re-delivers with metadata to preserve pool attribution. plain retryPendingFee sends plain ETH (Major receive() credits unallocatedBalance). Attribution for failed cuts is always available in the preceding FeeTransferFailed event."

- `contracts/BattleTreasury.sol` (symmetric for battle-cut attribution):
  - Add the identical `pendingFailedBattleCut` mapping (bytes32 battleId => uint256) + `retryBattleCut(bytes32 battleId, bytes32 poolId)` function + `BattleCutRetriedWithMetadata` event after its own retryPendingFee block (around 861+).
  - In the seasonalFee failure leg inside `claim` (around 578-585): also do `pendingFailedBattleCut[battleId] += seasonalFee;` (in addition to the existing pendingFeeWithdrawals credit and FeeTransferFailed emit which already carries battleId).
  - Update NatSpec on claim() and retryPendingFee (823-826 area) with the same cross-ref language as above.
  - No EIP-712 or authorizer changes here (Battle already has its resolver EIP-712).

- `contracts/MajorLeagueTreasury.sol`: No code changes required (the receive*Cut functions already accept the metadata; the new retry*Cut paths from the sources will simply call them with the correct IDs once the source is authorized). Minor NatSpec update on receiveBattleCut / receiveSponsorshipCut (242-248, 278-284) noting "Attribution-preserving retries are now available via the source contracts' retry*Cut functions (phased-build-da26e79f Phase 2)."

- Documentation (all five files):
  - `contracts/USER_INTERACTION_GUIDE.md`: New subsection "Phase 2: Sponsored Payments now require EIP-712 Authorization (when authorizer set)" with exact ethers.signTypedData example + "Phase 2: Attribution-Preserving League Cut Retries (retryBattleCut / retrySponsorshipCut)".
  - `contracts/TRUST_MODEL.md`: New paragraph under Fee Receiver Failure Recovery describing the specialized retry*Cut paths and the sponsorship authorizer role (timelocked, separate from owner).
  - `contracts/SECURITY_AUDIT_REPORT.md`, `POSTGRAD_REVENUE_DECISION_TABLE.md`, `POSTGRAD_TREASURY_ARCHITECTURE.md`: Dated 2026-06-01 "contractaudits5 / phased-build-da26e79f Phase 2" notes summarizing the EIP-712 binding and the retry*Cut addition.

**Deliverables**:
- SponsorshipPayments now has full EIP-712 SponsorshipAuthorization support + timelocked sponsorshipAuthorizer (ctor or propose path) + the payForSponsorship signature updated to carry deadline + signature (with verify gate when authorizer != 0).
- Both BattleTreasury and SponsorshipPayments expose `retryBattleCut(bytes32,bytes32)` / `retrySponsorshipCut(bytes32,bytes32)` (respectively) that re-send with the exact metadata ABI to MajorLeagueTreasury, preserving pool attribution.
- New per-ID pendingFailed*Cut mappings (append-only) populated on league-cut failure legs.
- All NatSpec, comments, and the five docs updated with Phase 2 / contractaudits5 markers.
- One coordination note + one summary in the run directory.

**Dependencies**: None for the core changes (Battle and Sponsorship changes are independent except for the shared Major receive*Cut target).

**Integration Points with Other Phases**:
- Phase 4 extended security spec will exercise: valid EIP-712 sponsorship pay (with authorizer set via timelock), bad sig / expired / wrong-payer reverts, duplicate ID with invalid sig still reverts SponsorshipAlreadyPaid, retrySponsorshipCut succeeds in crediting specific pool while plain retryPendingFee( seasonal ) lands in unallocated (both paths evidenced via Major state reads + events).
- Phase 3 (Battle winner payout EIP-712 extension) is independent but re-uses the same _domainSeparatorV4 style (no conflict).

**Estimated Complexity**: Medium-High (EIP-712 addition is copy-paste from audited Battle code; new per-ID mappings + retry*Cut are small but touch failure legs in two files + require careful CEI/recredit + aggregate sync).

**Local vs Production Impact**: N/A — pure root Hardhat contract + docs + test work (no frontend, no apiBase, no netlify impact). Verification exclusively via `npx hardhat compile --force`, `npx hardhat test test/PostGradTreasury.security.spec.ts`, `git diff/grep` at repository root. No changes under frontend/, api/, netlify.toml, vite.config, hardhat.config or env handling.

---

### Phase 3: BattleTreasury Settlement Robustness + Winner Payout Safety + Source Ctor Initialization (Medium + Low + Low/Operational)

**Goal**: Address the three BattleTreasury-centric (plus one cross-Major) findings that remain after Phases 1-2: Medium winner-claim permanent lock when the winner address is a rejecting contract (use signed payoutAddress inside the existing EIP-712 resolve flow per audit recommendation — no new pull mapping); Low one-sided refund path missing `settled = true` (1-line consistency fix); Low/Operational battleTreasurySource / sponsorshipPaymentsSource starting unset at deployment (add trailing constructor parameters to MajorLeagueTreasury for atomic init, with 0 allowed + documented controlled-deployment sequence alternative).

**Frontend Work**: None.

**Backend / Contract Work**:

- `contracts/BattleTreasury.sol`
  - Update the `RESOLVE_WINNER_TYPEHASH` constant (current 461-463) to the 9-field string:
    ```solidity
    bytes32 public constant RESOLVE_WINNER_TYPEHASH = keccak256(
        "ResolveWinner(bytes32 battleId,address creator,address challenger,address winner,uint256 stakeAmount,uint256 depositDeadline,uint256 resolutionDeadline,bytes32 seasonalPoolId,address payoutAddress)"
    );
    ```
  - Append one field to the Battle struct (after seasonalPoolId or resolutionDeadline, before closing } at line 53 — append-only):
    ```solidity
    address winnerPayoutAddress; // Phase 3: signed payout (or 0 = use winner). Set in resolveWinner from EIP-712 payload. Used in claim() for the actual transfer.
    ```
  - Update `resolveWinner` function signature and body (486+):
    - New signature: `function resolveWinner(bytes32 battleId, address winner, address payoutAddress, bytes calldata signature)`
    - In the structHash abi.encode, add `payoutAddress` as the 9th argument after seasonalPoolId.
    - After `battle.winner = winner;` add `battle.winnerPayoutAddress = payoutAddress;`
    - Update the NatSpec block (481-485) and the function header comment to document the new 9-field signed payload and the semantics of payoutAddress (0 = fallback to winner; otherwise the signed address receives the winnerAmount in claim).
    - Emit can remain `WinnerResolved(battleId, winner)` (payoutAddress is observable via the Battle struct or a new event if desired; minimal change keeps existing emit).
  - Update `claim` (539+):
    - After the `if (battle.settled)` check and pot math, before the winner transfer:
      ```solidity
      address payout = battle.winnerPayoutAddress != address(0) ? battle.winnerPayoutAddress : battle.winner;
      (bool winnerSuccess, ) = payout.call{value: winnerAmount}("");
      require(winnerSuccess, "Winner payout failed");
      ```
    - Update NatSpec (525-534 area) to explain the payoutAddress path and that a rejecting winner contract no longer permanently locks funds when the resolver includes a safe payoutAddress in the signed resolution.
  - In the one-sided AwaitingDeposits refund branch (current 629-631):
    - After `battle.state = BattleState.Settled;` (and the zeroing) add:
      ```solidity
      battle.settled = true; // Phase 3 remediation (contractaudits5 Low finding): one-sided incomplete-deposit path now sets settled for full consistency with claim() and active-timeout paths.
      ```
    - Update the NatSpec on refund() (592-606) and the isClaimable / isRefundable helpers (757+) with a one-line note on the consistency fix.

- `contracts/MajorLeagueTreasury.sol`
  - Update constructor (current 126-134) to accept two trailing parameters:
    ```solidity
    constructor(
        address _protocolFeeReceiver,
        address _seasonalTreasuryReceiver,
        uint256 _protocolFeeBps,
        uint256 _seasonalFeeBps,
        address _battleTreasurySource,        // NEW Phase 3 — may be address(0); configure via timelock if not supplied
        address _sponsorshipPaymentsSource   // NEW Phase 3
    ) Ownable(msg.sender) {
        ...
        if (_battleTreasurySource != address(0)) battleTreasurySource = _battleTreasurySource;
        if (_sponsorshipPaymentsSource != address(0)) sponsorshipPaymentsSource = _sponsorshipPaymentsSource;
    }
    ```
  - Add NatSpec to the constructor documenting the two new params and the "controlled deployment sequence" alternative (deploy Battle + Spons first → deploy Major with sources → no timelock wait required for first cuts).
  - No other changes (the existing propose/execute/cancel for sources remain available for later rotation).

- Documentation updates (five files):
  - `contracts/USER_INTERACTION_GUIDE.md`: New subsection "Phase 3: Winner Payout Address in Signed Resolutions" (resolver includes payoutAddress in EIP-712; claim pays there) + "Phase 3: One-Sided Refund now Consistent (settled flag)" + "Phase 3: MajorLeagueTreasury Constructor Source Initialization".
  - `contracts/TRUST_MODEL.md`: Note under resolver trust that the resolver can now also designate a safe payout address at resolution time (reduces risk of winner-controlled rejecting contracts locking pots).
  - `SECURITY_AUDIT_REPORT.md`, `POSTGRAD_*` files: Dated Phase 3 / contractaudits5 notes.

**Deliverables**:
- Battle struct contains `winnerPayoutAddress`; resolveWinner accepts + validates + stores the 9th signed field; claim uses it (with 0-fallback).
- One-sided refund path sets `settled = true` (git diff shows the single added line + comment).
- MajorLeagueTreasury constructor accepts (and optionally applies) the two source addresses at deployment time.
- All NatSpec + the five docs updated.
- Coordination note in `coordination/phase-3.md`.

**Dependencies**: Phase 2 (BattleTreasury file touched by both; implementer must be careful with line offsets but changes are non-overlapping: Phase 2 touches retry/claim fee legs + NatSpec; Phase 3 touches resolve + claim winner leg + struct + one-sided branch + Battle NatSpec).

**Integration Points with Other Phases**:
- Phase 4 gate will add its for: resolveWinner with payoutAddress=safeEOA + winner contract that rejects direct ETH → claim succeeds and funds arrive at payout (not locked); one-sided refund path now reports settled=true via the public getter / struct read; Major deployed with ctor sources → receive*Cut succeeds immediately from those addresses (no 2-day wait).
- EIP-712 extension re-uses the exact domain + recover style from Phase 2 (no duplication risk).

**Estimated Complexity**: Medium (EIP-712 field addition + 1-line settled + 2-param ctor are small; the payout logic + NatSpec + test updates in Phase 4 are the bulk).

**Local vs Production Impact**: N/A — pure root Hardhat contract + docs + test work (no frontend, no apiBase, no netlify impact). Verification exclusively via `npx hardhat compile --force`, `npx hardhat test test/PostGradTreasury.security.spec.ts`, `git diff/grep` at repository root. No changes under frontend/, api/, netlify.toml, vite.config, hardhat.config or env handling.

---

### Phase 4: Global / Deployment Gate — Prior 11-Item Gate Re-Exercise + 6 New Findings, Full Documentation Sweep, Extended Security Spec, Final Closeout

**Goal**: Perform the mandatory comprehensive closeout: update all five documentation files with dated "contractaudits5 / phased-build-da26e79f" notes and a new SECURITY_AUDIT_REPORT section declaring both the prior 11 findings + Gate and the 6 new findings fully addressed; extend `test/PostGradTreasury.security.spec.ts` with new describe/it blocks that cover the 6 new scenarios (plus re-execution of every prior Gate scenario with zero regressions); produce `notes/phase-4-gate-evidence.md` collating all transcripts; run the full security spec + compile cleanly; produce final-closeout.md + a delta security review confirming the entire remediation delta (Phases 1-4) introduces no new issues; achieve 100% independent verifier sign-off on the complete checklist.

**Frontend Work**: None.

**Backend / Contract Work** (all files + test only; no new contract logic):

- All three contracts + five .md files:
  - Final pass over NatSpec / comments to ensure every "Phase 5 (ec52d84a)" reference is complemented by "Phase X (da26e79f / contractaudits5)" markers where relevant.
  - No new functions or storage (all substantive work completed in 1-3).

- `test/PostGradTreasury.security.spec.ts` (the 519-line gate harness from ec52d84a):
  - Add 7+ new `it` blocks inside new or existing describe sections (following exact style of the 11 existing its: deploy via ethers, time travel via increaseTime, RevertingReceiver/AcceptingReceiver mocks, expect reverts with custom errors or strings, state reads on pending* / prizePools / settled, event emissions):
    - "Sponsorship EIP-712 authorization (contractaudits5 Medium/High)": deploy Spons with authorizer set via timelock; unsigned payForSponsorship reverts InvalidSponsorshipAuthorization; valid signTypedData (exact domain + SPONSORSHIP_AUTH_TYPEHASH) succeeds and marks sponsorshipPaid; bad signer / expired deadline / mismatched payer/amount reverts; duplicate ID with invalid sig still hits SponsorshipAlreadyPaid first.
    - "Specialized retry*Cut preserves league cut attribution (contractaudits5 Medium)": trigger league cut failure (e.g. via temporary bad source or reverting mock on Major side), confirm both pendingFeeWithdrawals[seasonal] and pendingFailed*Cut[id] credited + FeeTransferFailed emitted with ID; plain retryPendingFee(seasonal) succeeds but lands in Major.unallocatedBalance; specialized retryBattleCut(battleId, poolId) / retrySponsorshipCut(sponsId, pool) succeeds, credits the specific prizePools[poolId], emits *RetriedWithMetadata, and clears the per-ID pending (aggregate pendingFee optionally decremented).
    - "One-sided refund now sets settled (contractaudits5 Low)": create battle, one-sided deposit, advance past depositDeadline, call refund → battle struct read shows state=Settled && settled==true (contrast with pre-Phase-3 behavior via comment).
    - "Winner claim with signed payoutAddress bypasses rejecting winner contract (contractaudits5 Medium)": deploy Battle; create battle; resolve with winner=rejectingMockContract, payoutAddress=safeEOA (via valid EIP-712); advance time; call claim from the winner EOA → funds arrive at safeEOA (not locked at rejecting contract); direct payout path would have reverted but signed-payout path succeeds.
    - "MajorLeagueTreasury ctor source initialization (contractaudits5 Low/Operational)": deploy Battle + Spons first; deploy Major with the two source addresses supplied in ctor (non-zero); confirm only those two addresses can successfully call receiveBattleCut / receiveSponsorshipCut (random caller still reverts "not battle treasury"); no timelock wait required.
    - "No regression on prior 11-item Gate scenarios (re-execution)": re-run (or call the same helper logic as) the 11 its from ec52d84a (reverting fee + retry/redirect, active battle one-rejecting pull + claimRefund, distributor 0-limit propose + daily enforcement + day rollover, bytes32(0) public rejection + sentinel inside restricted receive, MAX_DEPOSIT_WINDOW, EIP-712 resolve roundtrip, direct ETH behavior on 3 contracts, Phase 5 timelocked setters, happy-path sponsorship + claim flows). All must still pass.
  - Update the top-level describe title to include "+ contractaudits5 / phased-build-da26e79f Phase 4".
  - Ensure total its >= 18 and the run produces clean "X passing (Y ms)".

- Documentation sweep (exact files, following ec52d84a Phase 5 precedent):
  - `contracts/TRUST_MODEL.md`: Expand "Remaining Immediate Controls" if any new exceptions (none expected); add "Sponsorship Authorizer (timelocked)" and "Resolver now controls winner payout address" under privileged roles; update Fee Recovery section with the specialized retry*Cut paths.
  - `contracts/SECURITY_AUDIT_REPORT.md`: Append a new top-level section "contractaudits5 Remediation (Run da26e79f) — Status: All 6 findings + prior 11-item Gate re-validated." with side-by-side mapping (exactly as in the ec52d84a final-report) and link to this run directory.
  - `contracts/USER_INTERACTION_GUIDE.md`, `POSTGRAD_REVENUE_DECISION_TABLE.md`, `POSTGRAD_TREASURY_ARCHITECTURE.md`: Each receives a dated 2026-06-01 "Post-audit5 / phased-build-da26e79f" subsection or note block summarizing the new flows (EIP-712 sponsorship auth, retry*Cut, winner payoutAddress, one-sided settled, ctor sources) with before/after code snippets where helpful.
  - All five files must show additions via `git diff` limited to documentation.

- Produce `notes/phase-4-gate-evidence.md` (modeled exactly on the ec52d84a phase-5-gate-evidence.md) collating:
  - Final `npx hardhat compile --force` tail ("Compiled 51+ Solidity files successfully").
  - Full `npx hardhat test test/PostGradTreasury.security.spec.ts` output ("18+ passing").
  - Key transcript excerpts for each of the 6 new findings + confirmation that all 11 prior Gate items still pass.
  - `git diff --stat` and `git status --porcelain` showing exactly the allowed files (3 .sol + 5 .md + test/PostGrad...spec.ts + the run-dir planning artifacts).

- Final artifacts:
  - `verifier-reports/phase-4-closeout.md` (or round-1) declaring 100% PASS on the Phase 4 checklist section.
  - `verifier-reports/final-closeout.md` (modeled on ec52d84a) with per-phase sign-offs, full Gate evidence bundle (old 11 + new 6), git hygiene, compile/test re-execution, and a "New Security Issues Review (Delta Audit)" section covering reentrancy (all new .call sites protected by nonReentrant + zero-first + recredit), access control (onlyOwner + timelock + authorizer sig + modifiers), griefing/fund-stranding (no new push paths for user principal; signed payout prevents lock; per-ID retries are opt-in and recredit), accounting (append-only mappings/struct fields; no uncleared storage; events carry IDs), and EIP-712 soundness (domain separation per contract, no personal-sign, exact type strings, deadline checks).
  - The verifier must be able to state: "All 6 findings from contractaudits5.md + the full 11-item contractaudits4 Gate are satisfied. No new issues introduced. READY TO CLOSE."

**Deliverables**:
- All five documentation files contain dated contractaudits5 / da26e79f notes and an updated SECURITY_AUDIT_REPORT section.
- `test/PostGradTreasury.security.spec.ts` extended with the required new its (total passing its sufficient to cover every bullet); re-execution clean.
- `notes/phase-4-gate-evidence.md` + phase-4 verifier report + final-closeout.md present with full evidence bundle.
- `git diff --stat` for the entire run shows only the three contracts + five .md docs + the security spec (plus run-dir artifacts). Zero files under frontend/, api/, netlify.toml, hardhat.config, etc.
- Final clean `npx hardhat compile --force` and `npx hardhat test test/PostGradTreasury.security.spec.ts` with zero failures / errors on the three contracts.
- Independent verifier has produced reports declaring 100% PASS on Phases 1-4 + Global Gate and that the contracts now satisfy the combined (old 11 + new 6) checklist.

**Dependencies**: Phases 1, 2, and 3 (all substantive changes must be complete and passing their individual verifier gates before Phase 4 begins; the extended spec depends on the new functions, EIP-712 fields, ctor params, and settled line).

**Integration Points with Other Phases**:
- This phase is the single point that re-exercises everything and produces the final evidence bundle required by the task prompt.
- Any deviations discovered during gate re-execution must be treated as Phase 1-3 bugs and fixed before final sign-off (no "close with deviations").

**Estimated Complexity**: Medium (mostly documentation + test extensions + evidence collation; the heavy lifting was in 1-3).

**Local vs Production Impact**: N/A — pure root Hardhat contract + docs + test work (no frontend, no apiBase, no netlify impact). Verification exclusively via `npx hardhat compile --force`, `npx hardhat test test/PostGradTreasury.security.spec.ts`, `git diff/grep` at repository root. No changes under frontend/, api/, netlify.toml, vite.config, hardhat.config or env handling.

---

**End of Build Plan**

This plan is intentionally written at the same level of specificity as the ec52d84a precedent so that a Contract Implementer and an independent Plan Verifier can execute it mechanically with only the repository, standard tooling, and the accompanying closeout-checklist.md. All success criteria are observable from the filesystem, compiler/test output, or on-chain state after Hardhat transactions. The 4-phase structure isolates the High finding, groups related sponsorship changes, handles Battle + ctor hygiene, and reserves the final phase for the mandatory comprehensive gate that re-validates the entire prior remediation plus the new work. 

When approved, the implementer must populate `coordination/phase-N.md` and `summaries/phase-N-backend.md` (following ec52d84a layout) after each phase's code work, before handing to the verifier. The verifier must produce the corresponding `verifier-reports/phase-N-*.md` (and final) only after 100% of that phase's checklist items are evidenced.