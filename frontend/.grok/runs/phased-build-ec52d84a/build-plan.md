# Build Plan: PostGrad Treasury Security Remediation (contractaudits4.md Findings)

**Idea Source**: `frontend/.grok/runs/phased-build-ec52d84a/idea.md` (full content of the latest security re-audit; identical to `frontend/.grok/architect-feed/contractaudits4.md`)
**Created By**: Architect Agent (phased-build skill)
**Date**: 2026-05-31
**Approved Version**: (to be filled after user approval)
**Status**: Draft

---

## Overview

This effort converts the 11 concrete security findings (3 High, multiple Medium, and Low/Operational) identified in the latest re-audit of the three PostGrad treasury/payment contracts into a phased, verifiable remediation. The contracts (`contracts/BattleTreasury.sol`, `contracts/MajorLeagueTreasury.sol`, `contracts/SponsorshipPayments.sol`) are already substantially hardened from prior passes (Pass 3 in phased-build-267caf05), but the re-audit correctly flags remaining fund-stranding vectors (failed-fee recovery fragility for contract receivers, push-based active-battle refunds that one bad participant can block), weak distributor blast-radius controls (0 = unlimited + immediate setters), permissionless revenue-cut entrypoints, `bytes32(0)` ambiguity, missing deposit-window upper bound, uncleared storage after settlement, event and timelock observability gaps, and a handful of remaining immediate owner setters.

The plan produces only changes inside the three `.sol` files plus minimal targeted updates to the five key documentation files that live alongside them (`TRUST_MODEL.md`, `SECURITY_AUDIT_REPORT.md`, `USER_INTERACTION_GUIDE.md`, `POSTGRAD_REVENUE_DECISION_TABLE.md`, `POSTGRAD_TREASURY_ARCHITECTURE.md`). All changes follow existing code patterns (nonReentrant + checks-effects-interactions, the proven `pendingFeeWithdrawals` + `claimPendingFees` shape, 2-day `TIMELOCK_DELAY` + propose/execute/cancel, custom errors, NatSpec style). The explicit success bar is that an independent verifier can run the exact procedures in the accompanying `closeout-checklist.md` and confirm that the contracts now satisfy every item on the "Deployment Gate Checklist" printed at the end of the audit document.

## Success Criteria (High Level)

- Every one of the 11 findings receives a concrete, code-level fix or a deliberate, documented design decision (with rationale) that the auditor would accept.
- The eight explicit test scenarios in the Deployment Gate Checklist (reverting fee receivers, contract fee receivers, one-participant rejecting active timeout refund, distributor daily/tx limits, `bytes32(0)` rejection, EIP-712, direct ETH behavior, plus clean compile) are all demonstrably passing with reproducible evidence.
- `npm run compile` at repository root succeeds with zero errors attributable to the three contracts.
- All new functions, events, modifiers, and storage variables are added in an append-only manner (no storage layout corruption risk for a pre-deployment contract).
- Happy-path user flows (deposit → resolve → claim, payForSponsorship, allocateReward → claimReward, one-sided deposit refund) are behaviorally unchanged except for the documented improvements.
- Documentation is updated so that a junior engineer can understand the new recovery paths, the new pull-refund flow, the restricted cut receivers, and the exact remaining trust assumptions without asking questions.
- 100% of the items in `closeout-checklist.md` pass independent verification with git-diff, grep, Hardhat console transcripts, and event-log evidence.

## Out of Scope

- Any frontend work whatsoever: no changes under `frontend/src/`, `frontend/components/`, no ABI consumption, no calls through `src/lib/apiBase.ts`, no updates to `frontend/abis/`, no `compile:frontend-abis` step inside this effort.
- Any backend / Railway work: no routes in `frontend/api/`, `frontend/server/`, no Supabase migrations, no changes to realtime-indexer or db/.
- Deployment, key management, multisig setup, or actual deployment of the remediated contracts to testnet or mainnet (deployment scripts and the `deployments/*.json` files are untouched).
- A full professional third-party audit (this remains an internal remediation pass whose output will be an input to a future external audit).
- Any modification of fee percentages (protocolFeeBps, seasonalFeeBps, RECIPIENT_BPS etc.), `TIMELOCK_DELAY` (remains 2 days), or the 85/5/10 and 70/15/15 split ratios.
- ERC20 support (all three contracts remain native-BNB only).
- New roles, new contracts, or reuse of these contracts for War Pools / betting at this time.
- Gas optimizations, storage packing, or architectural refactors beyond the minimal fixes required by the findings.
- Touching any other contract (`LeagueTreasury.sol`, `TreasuryVault*`, `Launch*`, `TreasuryRouter`, mocks, etc.).
- Updates to `netlify.toml`, `vite.config.ts`, `hardhat.config.ts`, `package.json`, environment variables, or any CI workflow.
- Comprehensive new test suites beyond the minimal targeted Hardhat spec required to satisfy the Gate Checklist (existing patterns in `test/*.spec.ts` may be followed for any new spec file).
- Changes to the resolver signing format (already fixed in prior pass) or the core EIP-712 typehash.

---

## Phases

### Phase 1: Failed Fee Recovery Hardening Across All Three Contracts

**Goal**: Eliminate the permanent-stranding risk for protocol and league fees when a receiver contract rejects plain ETH transfers by adding the exact `retryPendingFee(address receiver)` anyone-callable retry (with recredit-on-failure) plus a timelocked owner-only `redirectStuckFee` rescue path for fee-only funds, in every contract that uses the `pendingFeeWithdrawals` pattern.

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
- The retry function exactly matches the auditor's recommended body (zero the mapping, attempt `call{value}`, re-set on failure and revert).
- The redirect path is restricted to fee amounts recorded in `pendingFeeWithdrawals` and is itself protected by the existing 2-day timelock + cancel pattern already used for receivers and distributors.
- Inline documentation updated so a reader knows when to use `retryPendingFee` vs the old `claimPendingFees`.
- One coordination note in `coordination/phase-1.md` (populated by implementer).

**Dependencies**: None (highest-priority, self-contained, touches all three files in parallel-friendly way).

**Integration Points with Other Phases**:
- Phase 2 (refunds) and Phase 3 (distributors) may emit additional `FeeTransferFailed` events; the retry path covers them automatically.
- Phase 5 documentation sweep will reference the new functions.
- No cross-contract calls between the new functions.

**Estimated Complexity**: Medium

**Local vs Production Impact** (per `frontend/AGENTS.md` mandatory questions):
- Does this change affect any API calls? No — pure on-chain Solidity changes only.
- Will the change work with `npm run dev` locally? N/A (no frontend involvement; verification uses Hardhat at repository root).
- Will the change work after a Netlify deploy (calls going through the Railway redirect)? N/A (contracts are not yet invoked from the deployed frontend).
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No.
- Do we need to touch `netlify.toml` or environment variable handling? No.
- Verification path: `npm run compile` (root) + targeted Hardhat console / one-off scripts that deploy the contracts + a reverting-receiver mock and exercise `retryPendingFee` and the timelocked redirect. Completely independent of Vite dev server, Netlify proxy, or Railway.

---

### Phase 2: Active-Battle Timeout Refunds — Pull Model, Deposit Zeroing, and Deposit Window Upper Bound

**Goal**: Remove the griefing vector in which a single participant with a reverting `receive()` can permanently block the other participant's refund after `resolutionDeadline`, convert that path to pull-based credits, zero `creatorDeposit`/`challengerDeposit` after all claim and active-timeout paths (so view helpers and invariants become correct post-settlement), and add a hard maximum on `depositWindowSeconds` in `createBattle()`.

**Frontend Work**: None.

**Backend / Contract Work**:

- `contracts/BattleTreasury.sol` (primary file):
  - Add new storage near the top-level mappings (around line 55-93 area):
    ```solidity
    mapping(address => uint256) public pendingRefunds;
    ```
  - Add new events (append to events section ~line 148):
    ```solidity
    event RefundCredited(bytes32 indexed battleId, address indexed to, uint256 amount);
    event RefundClaimed(address indexed to, uint256 amount);
    ```
  - Add new error: `error NoPendingRefund();`
  - In `createBattle` (lines 298-332): after the existing `if (depositWindowSeconds < 1 hours) revert InvalidAmount();` add:
    ```solidity
    uint256 public constant MAX_DEPOSIT_WINDOW = 7 days;
    if (depositWindowSeconds > MAX_DEPOSIT_WINDOW) revert InvalidAmount();
    ```
    (Place the constant at the top with other constants near line 96.)
  - Refactor the active-battle timeout branch inside `refund()` (currently lines 536-554):
    - Capture amounts into locals.
    - Zero both `creatorDeposit` and `challengerDeposit`.
    - Set `settled = true; state = Settled;`.
    - Credit `pendingRefunds[battle.creator] += creatorAmount;` and same for challenger.
    - Emit `RefundCredited` for each (or a single batch event).
    - Remove the two direct `call` transfers and the `require` that could revert the whole tx.
  - In `claim()` (lines 453-494): after calculating `totalPot`, `winnerAmount`, fees, and immediately after `battle.settled = true; battle.state = Settled;` (before any external calls), zero the deposits:
    ```solidity
    uint256 creatorDep = battle.creatorDeposit;
    uint256 challengerDep = battle.challengerDeposit;
    battle.creatorDeposit = 0;
    battle.challengerDeposit = 0;
    ```
    (Use the locals for the pot math if needed; the rest of the function is unchanged.)
  - In the one-sided deposit refund path (already zeros at 522-523) — add a comment noting it remains push-based because only one party can be affected by their own receiver.
  - Add the pull function after `refund()`:
    ```solidity
    function claimRefund() external nonReentrant {
        uint256 amount = pendingRefunds[msg.sender];
        if (amount == 0) revert NoPendingRefund();
        pendingRefunds[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) {
            pendingRefunds[msg.sender] = amount; // recredit on failure
            revert("Refund claim failed");
        }
        emit RefundClaimed(msg.sender, amount);
    }
    ```
  - Update all affected view helpers (`getPotBalance`, `getCurrentPot`, `getBattleParticipantInfo`, `isClaimable`, `isRefundable`) — they already read the deposit fields, so after zeroing they will correctly report 0 for settled battles. Add a comment in each explaining post-settlement zeroing.
  - Update NatSpec for `refund()`, `claim()`, and the new `claimRefund()` (including the one-sided vs two-party distinction).

- `contracts/USER_INTERACTION_GUIDE.md`: add a new subsection under Battle refunds explaining the `claimRefund()` flow for post-deadline active battles and the fact that deposits are now cleared on settlement.

**Deliverables**:
- `BattleTreasury.sol` contains `MAX_DEPOSIT_WINDOW`, the `pendingRefunds` mapping, `claimRefund()`, the refactored active-timeout branch that never performs a direct transfer, and zeroing of both deposit fields in `claim()` and the active path.
- The one-sided incomplete-deposit refund path remains push (documented).
- All view helpers and the `Battle` struct itself are unchanged in layout.
- Documentation updated for the new user recovery path.

**Dependencies**: None (independent of Phase 1 fee retry).

**Integration Points with Other Phases**:
- Phase 5 will expand the `Refunded` event and may add more context; the new `RefundCredited` + `RefundClaimed` events are additive.
- Zeroing makes accounting invariants hold for any later off-chain indexers.

**Estimated Complexity**: Medium (careful state-machine surgery on the refund function)

**Local vs Production Impact**:
- Does this change affect any API calls? No.
- Will the change work with `npm run dev` locally? N/A.
- Will the change work after a Netlify deploy...? N/A.
- Direct `fetch()`? No.
- `netlify.toml` / env? No.
- Verification: root `npm run compile` + Hardhat console script that creates an Active battle past resolutionDeadline, has one participant be a reverting mock contract, calls `refund()`, confirms the other side can later `claimRefund()` successfully while the reverting side's credit remains in `pendingRefunds`, and that `getPotBalance` now returns 0 after the call.

---

### Phase 3: Distributor Limit Binding, Cut-Receiver Restrictions, and Zero Pool ID Reservation (MajorLeagueTreasury)

**Goal**: Bind per-distributor daily and per-tx limits into the existing timelock proposal so that enabling a distributor always carries enforceable nonzero caps; restrict `receiveBattleCut` and `receiveSponsorshipCut` to known source contracts (`BattleTreasury` and `SponsorshipPayments`) via timelocked source addresses + modifiers; reserve `bytes32(0)` as an invalid pool ID for all public allocation/funding paths while preserving its sentinel meaning inside the (now-restricted) receive functions.

**Frontend Work**: None.

**Backend / Contract Work** (MajorLeagueTreasury.sol only):

- Extend the existing `PendingDistributorChange` struct (currently lines 356-361):
  ```solidity
  struct PendingDistributorChange {
      address distributor;
      bool allowed;
      uint256 dailyLimit;
      uint256 maxPerTx;
      uint256 executeAfter;
      bool exists;
  }
  ```
- Change `proposeDistributorChange(address distributor, bool allowed)` signature and body (line 108 area) to:
  ```solidity
  function proposeDistributorChange(address distributor, bool allowed, uint256 dailyLimit, uint256 maxPerTx) external onlyOwner { ... }
  ```
  Inside: if `allowed` then `require(dailyLimit > 0, "daily limit required"); require(maxPerTx > 0, "tx limit required");` then store all four values in the pending struct.
- Update `executeDistributorChange()` (line 117) to also set:
  ```solidity
  distributorDailyLimit[change.distributor] = change.dailyLimit;
  distributorMaxPerTx[change.distributor] = change.maxPerTx;   // new mapping
  ```
  (Add the new mapping `mapping(address => uint256) public distributorMaxPerTx;` near the other daily* mappings at bottom.)
- Update the allocateReward limit checks (lines 222-234 area) to prefer the per-distributor max when set:
  ```solidity
  uint256 effMax = distributorMaxPerTx[msg.sender] > 0 ? distributorMaxPerTx[msg.sender] : maxAllocationPerTx;
  if (effMax > 0 && amount > effMax) revert InvalidAmount();
  ```
  (Keep the global `maxAllocationPerTx` for backward compatibility during transition; the immediate `setMaxAllocationPerTx` will be addressed in Phase 5.)
- Add source address state + timelock (append near other pending* at ~line 352):
  ```solidity
  address public battleTreasurySource;
  address public sponsorshipPaymentsSource;
  PendingChange public pendingBattleTreasurySource;
  PendingChange public pendingSponsorshipPaymentsSource;
  ```
- Add events (append):
  ```solidity
  event BattleTreasurySourceProposed(address indexed newSource, uint256 executeAfter);
  event BattleTreasurySourceExecuted(address indexed newSource);
  event SponsorshipPaymentsSourceProposed(address indexed newSource, uint256 executeAfter);
  event SponsorshipPaymentsSourceExecuted(address indexed newSource);
  ```
- Add the two propose/execute/cancel functions (modeled exactly on the existing fee-receiver ones) for the two source addresses.
- Add modifiers:
  ```solidity
  modifier onlyBattleTreasury() {
      require(msg.sender == battleTreasurySource, "not battle treasury");
      _;
  }
  modifier onlySponsorshipPayments() {
      require(msg.sender == sponsorshipPaymentsSource, "not sponsorship payments");
      _;
  }
  ```
- Wrap `receiveBattleCut` and `receiveSponsorshipCut` with the appropriate modifier (they remain payable and keep their internal `if (poolId == bytes32(0))` logic).
- Add:
  ```solidity
  error InvalidPoolId();
  modifier validPoolId(bytes32 poolId) {
      if (poolId == bytes32(0)) revert InvalidPoolId();
      _;
  }
  ```
- Apply `validPoolId` modifier to: `fundPrizePool`, `allocateUnallocatedToPool`, `allocateReward`.
- Update the two receive functions' NatSpec to document that they are now access-controlled.
- Update the distributor-related events (`DistributorUpdated`) to remain compatible.
- Update `TRUST_MODEL.md` section on Distributors with the new "limits are proposed atomically with the role" rule.

**Deliverables**:
- `MajorLeagueTreasury.sol` has the extended distributor pending struct and proposal that enforces nonzero limits, the per-distributor max mapping, restricted cut receivers with timelocked source addresses, and `validPoolId` protection on all public pool-mutating entrypoints except the (now-restricted) receive cut functions.
- Constructor or an initializer sets the initial source addresses (or owner proposes them post-deploy).
- All existing public function signatures for non-admin paths are unchanged.

**Dependencies**: None (independent of Phases 1-2).

**Integration Points with Other Phases**:
- Phase 4 and 5 will add more events; the new source events are additive.
- Phase 5 will make `setMaxAllocationPerTx` itself timelocked or remove the immediate path.

**Estimated Complexity**: High (multiple interacting storage + access-control changes in one file)

**Local vs Production Impact**:
- Does this change affect any API calls? No.
- `npm run dev`? N/A.
- Netlify deploy? N/A.
- Direct fetch bypass? No.
- netlify.toml / env? No.
- Verification: root compile + Hardhat script that (1) proposes+executes a distributor with explicit limits >0 and confirms allocate over the limit reverts, (2) sets source addresses then confirms random callers to receive*Cut revert while the real BattleTreasury address succeeds, (3) confirms `fundPrizePool(bytes32(0))` and `allocateReward(bytes32(0), ...)` now revert with `InvalidPoolId`.

---

### Phase 4: Sponsorship ID Uniqueness + Event Schema Completion + Timelock Observability

**Goal**: Resolve the comment-vs-implementation mismatch for `sponsorshipId` (make it a true unique paid-once identifier), expand every under-specified event listed by the auditor with the missing fields, and emit dedicated proposal + execution events for every timelock path in all three contracts (cancellation events were already added in Pass 3).

**Frontend Work**: None.

**Backend / Contract Work**:

- `contracts/SponsorshipPayments.sol`:
  - Add `mapping(bytes32 => bool) public sponsorshipPaid;` near `totalPaidPerSponsorship`.
  - Inside `payForSponsorship` (after the minimum-amount check, before any transfers):
    ```solidity
    if (sponsorshipPaid[sponsorshipId]) revert InvalidAmount(); // or new error "Already paid"
    sponsorshipPaid[sponsorshipId] = true;
    ```
  - Update the comment above `totalPaidPerSponsorship` (line 215) to reflect the new unique + cumulative hybrid model.
  - Expand the `SponsorshipPaid` event definition (lines 48-55) to include:
    ```solidity
    event SponsorshipPaid(
        bytes32 indexed sponsorshipId,
        address indexed payer,
        address indexed recipient,
        bytes32 poolId,
        uint256 totalAmount,
        uint256 recipientAmount,
        uint256 protocolAmount,
        uint256 leagueAmount,
        uint256 cumulativePaid
    );
    ```
  - Update the emit site (lines 192-199) to pass `msg.sender`, `poolId`, and `totalPaidPerSponsorship[sponsorshipId]` as the cumulative.
  - Add the three standard propose/execute events for the two receiver timelocks (if not already present) + emit them from the existing propose/execute functions (modeled on the BattleTreasury pattern).

- `contracts/BattleTreasury.sol`:
  - Expand `BattleCreated` (lines 125-130) to:
    ```solidity
    event BattleCreated(
        bytes32 indexed battleId,
        address indexed creator,
        address indexed challenger,
        uint256 stakeAmount,
        uint256 depositDeadline,
        uint256 resolutionDeadline,
        bytes32 seasonalPoolId
    );
    ```
  - Update the emit at line 331 to pass the additional fields.
  - Add the full set of proposal/execution events for the four timelock categories (protocolFeeReceiver, seasonal, resolver, authorizedCreator) and emit them from the existing propose/execute functions (e.g. `event ProtocolFeeReceiverProposed(address indexed newReceiver, uint256 executeAfter);` etc.).
  - Expand `Refunded` or keep + add the new `RefundCredited` from Phase 2 as sufficient.

- `contracts/MajorLeagueTreasury.sol`:
  - Expand `SponsorshipCutReceived` (line 71) to include `bytes32 poolId`.
  - Update the emit inside `receiveSponsorshipCut`.
  - `BattleCutReceived` (added in Pass 3) is already good.
  - Add the full propose/execute event set for protocol/seasonal receivers and for the (already-extended) distributor change (including the limit values in the event).
  - Add propose/execute events for the two new source addresses (from Phase 3).

- Update NatSpec on every changed event and the `payForSponsorship` / `createBattle` functions.

**Deliverables**:
- `sponsorshipId` is now enforced unique (first payment wins; subsequent attempts revert).
- Every event the auditor called out now contains the listed missing fields.
- Every timelock category in every contract now emits a `XXXProposed(newValue, executeAfter)` and `XXXExecuted(newValue)` (or richer for distributor).
- Cancellation events (already present from Pass 3) remain.

**Dependencies**: Phase 3 (the distributor events will reference the richer struct).

**Integration Points with Other Phases**:
- Phase 5 will reference the richer events in documentation and may add a couple more for the final immediate-setter timelocks.

**Estimated Complexity**: Low-Medium (mostly additive event + emit changes + one guard)

**Local vs Production Impact**:
- All questions: N/A / No (pure contract changes; events are append-only and do not affect existing call sites that do not yet consume them).
- Verification: compile + a Hardhat script that exercises `createBattle`, `payForSponsorship`, and all timelock propose/execute paths and prints the exact event topics + args for manual confirmation against the plan.

---

### Phase 5: Documentation Alignment, Remaining Immediate Setters, Gate Test Coverage, and Deployment Readiness

**Goal**: Close the loop on the last low-severity items (remaining immediate owner setters), bring all five key documentation files up to date with the full set of remediation changes, add the minimal Hardhat test coverage that lets the verifier mechanically satisfy every bullet of the Deployment Gate Checklist, and produce the final evidence bundle that marks the contracts "ready for the external audit + deployment decision."

**Frontend Work**: None.

**Backend / Contract Work**:

- All three contracts + the five `.md` files:
  - Make the remaining sensitive immediate setters timelocked where practical and low-risk:
    - `SponsorshipPayments.setMinimumSponsorshipAmount` → add a `PendingMinimum` + propose/execute/cancel (or reuse pattern).
    - `MajorLeagueTreasury.setMaxAllocationPerTx` → add a simple pending uint256 + propose/execute (global limit now also timelocked).
    - `BattleTreasury.setPaused`, `MajorLeagueTreasury.setPaused`, `SponsorshipPayments.setPaused` remain immediate (emergency only) — add only a comment + TRUST_MODEL entry.
  - Add the corresponding proposal/execution events for the new timelocked setters.
  - Update every NatSpec comment block that mentions "immediate" or "owner can set" to reflect the new state.

- Documentation sweep (exact files):
  - `contracts/TRUST_MODEL.md`: new or expanded section "Remaining Immediate Controls (Post Remediation)" that lists exactly the three pause functions + any others that stayed immediate, with justification and the multisig recommendation.
  - `contracts/SECURITY_AUDIT_REPORT.md`: append a new section "contractaudits4 Remediation (phased-build-ec52d84a) — Status: All 11 findings + Gate Checklist addressed."
  - `contracts/USER_INTERACTION_GUIDE.md`: add usage examples for `retryPendingFee`, `claimRefund`, the new restricted cut receivers (for operators), and the new timelocked paths for min sponsorship / global max.
  - `contracts/POSTGRAD_REVENUE_DECISION_TABLE.md` and `POSTGRAD_TREASURY_ARCHITECTURE.md`: one-paragraph "Post-audit4 hardening" notes at the top of the relevant tables/sections.

- New test file (following patterns in `test/LaunchFactory.spec.ts` and `test/TreasuryRouter.Routing.spec.ts`):
  - `test/PostGradTreasury.security.spec.ts` (or `contracts/test/` if preferred) containing Hardhat `describe` blocks that:
    - Deploy the three contracts + minimal reverting / accepting mock receivers.
    - Exercise every Gate scenario (reverting fee receiver → pending + retry succeeds; contract receiver accepts; active battle with one reverting participant → other claims via pull; daily limit blocks over-allocation and resets; `bytes32(0)` rejected on fund/allocate; direct ETH reverts on the three contracts; EIP-712 round-trip still works).
    - The spec must be runnable via `npx hardhat test test/PostGradTreasury.security.spec.ts` and produce clear pass/fail output.

**Deliverables**:
- All three contracts have no remaining "immediate powerful setter" surprises beyond the three documented emergency pauses.
- The five documentation files contain accurate, dated sections describing the final state after this run.
- A runnable security spec exists that, when executed, covers every item the auditor listed in the Gate Checklist.
- `npm run compile` is green.
- A short `notes/phase-5-gate-evidence.md` (or similar) with command transcripts can be left by the implementer for the verifier.

**Dependencies**: All prior phases (Phase 5 is the final integration + evidence phase).

**Integration Points with Other Phases**:
- Consumes every new function, event, modifier, and limit rule added earlier.
- Produces the artifacts the verifier needs to close the entire run.

**Estimated Complexity**: Medium (docs + one new test file + a few small timelock additions)

**Local vs Production Impact**:
- All four AGENTS.md questions: N/A / No / No / No.
- The new test file lives under `test/` (or `contracts/test/`) and is exercised only via Hardhat at the repository root. No frontend, no Netlify, no Railway, no apiBase.
- Verification command surface: `npm run compile && npx hardhat test test/PostGradTreasury.security.spec.ts`

---

## Cross-Cutting Concerns

- **Testing strategy**: Each phase includes explicit manual / console reproduction steps in the closeout checklist. Phase 5 adds a single reusable spec file that can be run in isolation. No coverage threshold is mandated beyond "the eight Gate scenarios are covered and pass."
- **Event & storage hygiene**: All event additions are append-only (new topics). All new storage variables are declared after existing ones. Struct extensions are only performed on types that have not yet been written to persistent storage (pre-deployment).
- **Error & event naming**: Follow the existing custom-error style (`InvalidAmount`, `NothingToRefund`, etc.) and the `XXXProposed` / `XXXExecuted` / `XXXCancelled` naming already established in Pass 3.
- **Migration / rollback**: N/A — pre-deployment contracts. A future deployer will simply use the final source.
- **Observability**: After Phase 4 every timelock action and every fee failure path has a dedicated, indexed event. Indexers and dashboards can now reliably track proposals, executions, cancellations, and stuck-fee situations.

## Future Phases / Follow-ups (not in this effort)

- Professional third-party audit using the final post-Phase-5 source + the security spec as a starting point.
- ABI sync (`npm run compile:frontend-abis`) + frontend integration work (new events, new view functions such as `pendingRefunds`, `retryPendingFee` UI, distributor limit displays, etc.) — separate phased-build run.
- Actual testnet deployment + adversarial testing using the new recovery paths.
- Decision on whether to keep the global `maxAllocationPerTx` at all once per-distributor limits are fully live.
- Potential later addition of ERC20 support or War Pool reuse of BattleTreasury if the product direction requires it.
- Any on-chain factory or LeagueManager contract that will be the real authorizedCreator / distributor caller (currently assumed to be backend).

---

**Post-Approval Next Actions (for implementer + verifier)**:
1. User explicitly approves this plan + the linked `closeout-checklist.md`.
2. Implementer (Contract) begins Phase 1, updates `coordination/phase-1.md` on every handoff.
3. On completion of a phase, verifier runs the exact checklist section for that phase only and produces `verifier-reports/phase-N.md`.
4. Only after a clean 100% PASS on phase N does work on phase N+1 begin.
5. Final gate is the full Phase 5 checklist + the Deployment Gate Checklist items all passing.

This plan is intentionally small, linear, and written so that a junior-to-mid Solidity engineer can execute any single phase with zero ambiguity about what "done" and "verifiable" mean.