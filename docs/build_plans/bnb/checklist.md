# BNB Build Closeout Checklist

**Source plan:** `docs/build_plans/bnb/masterbuildplan.md`  
**Compared against repo:** branch `devpostgrad`  
**Repo HEAD at inspection:** `e00816e8` — *Pre-check creator arm eligibility on Create page and open the explain dialog*  
**Plan-referenced HEAD:** `2e9a3b29` (historical plan snapshot; branch is far ahead)  
**Inspection date:** 2026-08-01 (updated after Prepare Mode / arm-cooldown UX closeout)  
**Re-run note:** Prepare Mode create → publish → timed arm + arm-cooldown UX validated live. Contract generation remains gen-3; no further factory change planned for cooldown policy.  

## How to read this

| Status | Meaning |
|--------|---------|
| **DONE** | Implemented on `devpostgrad` and backed by code/deploy artifacts. May still need live ops re-check. |
| **IN PROGRESS** | Partial code, draft PR, deploy not verified, or acceptance not closed. |
| **NOT STARTED** | No meaningful implementation or operational gate on this branch. |
| **OUT OF SCOPE** | Explicitly excluded from this BNB closeout (do not expand scope here). |

> **Note on plan consistency:** The top of `masterbuildplan.md` marks Phase 3A (timed launches + ticker lifecycle) as **DONE**. The lower Phase 3A section still says **PENDING**. Repo inspection agrees with the top: the implementation is largely present; what remains is acceptance, ops proof, WTR merge, and mainnet gates.

---

## Executive summary

**Updated:** 2026-08-06 — continuous Topaz / chart / LP claim landed on `devpostgrad`.  
**Canonical closeout doc:** `docs/bnb-launchpad-closeout-2026-08.md`

| Area | State |
|------|--------|
| Prepare Mode + scheduled launch + cooldown correction | **DONE** |
| Ticker reservation lifecycle | **DONE** |
| Creator arm cooldown policy + UX | **DONE** |
| Creator-cluster buy protection | **DONE** (+ soft-fail when funding indexer lagging) |
| TreasuryRouterV2 / multi-locker foundation | **DONE** (Command Center LP claim + web-dashboard harvest) |
| Generation-aware indexing + legacy recovery | **DONE** |
| Continuous bonding → Topaz (WTR / Token Details) | **DONE** on `devpostgrad` (not blocked on PR #75) |
| Unified chart + creator trade pins | **DONE** |
| DexScreener / Pancake as primary | **REMOVED** |
| Full $6 lifecycle acceptance pack | **RUNBOOK** — operator sign-off in closeout doc §3.B |
| Market Continuity admin ops surface | **PARTIAL** (repair endpoints + LP fees page; full admin UI later) |
| Security / release / mainnet controls | **LATER** |
| Recruiter / Airdrop / Squad full expansion | **OUT OF SCOPE** |

**Contract work:** Closed for this closeout unless audit forces redeploy.

**Product done gate (postgrad testnet):** continuous Topaz trade + chart + LP claim + indexer continuity smoke (see closeout doc).

#### P0 — what the code actually does (repo truth)

Wiring: `server.mjs` → `security-current-time.js` + `route-auth.js` + `creator-cluster-detector.js` + worker `scripts/run-creator-funding-worker.mjs`.

| Situation | Expected code path | User-facing |
|-----------|--------------------|-------------|
| Connected wallet **is campaign creator** and `creatorBuyLockUntil` still in future | `CREATOR_BUY_LOCKED` | Tier dialog: “cannot buy own token for 24h (Tier 1)” |
| Wallet linked via on-chain RiskRegistry cluster or DB cluster | `CREATOR_CLUSTER_BUY_LOCKED` | “Creator-linked wallet” during lock |
| Wallet got BNB from creator (funding indexer evidence) during lock window | `CREATOR_CLUSTER_BUY_LOCKED` | Same linked-wallet dialog |
| Funding indexer **not initialized / lagging / RPC fail** while checking a non-creator wallet | `detectDirectCreatorFunding` **throws** → catch → `CREATOR_CLUSTER_CHECK_UNAVAILABLE` | **“Protection Check Unavailable”** — MetaMask never opens |
| On-chain protection read fails (no RPC / bad campaign resolution) | same UNAVAILABLE fail-closed | **“Protection Check Unavailable”** |
| After lock expires, linked cluster buys over shared cap | `CREATOR_CLUSTER_BUY_CAP_EXCEEDED` | Cap dialog |

**On-chain lock anchor (correct for timed launches):**  
`LaunchFactory` sets `creatorBuyLockUntil = launchAt + creatorBuyLockDuration` (not deploy time). Tier 1 = 24h after **trading open**.

**Critical design risk:** for any wallet that is not already the creator and not already cluster-matched, trade preflight always calls funding detection. If `creator_funding_indexer_state` is missing or stale, that call **throws** and **all buys fail closed** with UNAVAILABLE. That matches “stranded after deploy” better than a pure product bug in Prepare Mode.

#### P0/P1 acceptance criteria (must pass before other builds)

- [ ] Railway API has `BSC_RPC_HTTP_97` (or equivalent) and can read `creatorBuyLockUntil` / `launchAt` on gen-3 campaigns
- [ ] Migration applied: `creator_funding_indexer_state`, funding evidence tables, `creator_cluster_buy_reservations`
- [ ] Railway **creator-funding worker** running (`npm run worker:creator-funding` / `railway.worker-creator-funding.json`) and `creator_funding_indexer_state` shows current for chain 97
- [ ] **Creator wallet** on a fresh timed campaign: during lock → clear **Tier 1 lock** dialog (not Unavailable)
- [ ] **Unrelated wallet** (never funded by creator): can get trade authorization and buy after `launchAt`
- [ ] **Linked / funded wallet** (if testing bypass): blocked only during lock, with correct dialog
- [ ] After `launchAt + 24h` (or use shorter test tier if available): creator path behaves per tier cap rules
- [ ] Preflight response codes logged: distinguish `CREATOR_BUY_LOCKED` vs `CREATOR_CLUSTER_CHECK_UNAVAILABLE` vs `TRADE_CAMPAIGN_RESOLUTION_UNAVAILABLE`

#### P0 engineering fixes to consider (only if ops alone is not enough)

- [ ] Soften fail-closed: when indexer is unhealthy **and** no positive funding evidence, return warning + allow non-creator trade *or* degrade with explicit ops alert (product/security decision — do not silently weaken real locks)
- [ ] Surface indexer health on a private status endpoint / Command Center so “Unavailable” is diagnosable in under 1 minute
- [ ] Ensure token-route canonicalization (`547a0d74` / `a8676e45`) is live on Railway so campaign resolution does not itself trip UNAVAILABLE
- [ ] Add one automated e2e: scheduled campaign + creator preflight-buy expects `CREATOR_BUY_LOCKED` with `unlockAt ≈ launchAt + 24h`

---

## 1. DONE — checked off

### 1.1 Prepare Mode and creator launch flows

- [x] **Direct Create** path exists (token details → tier → deploy → trading open)
- [x] **Draft → Deploy Now** path exists (`PushDraftLive`, draft APIs, Prepare Mode pages)
- [x] **Draft → Deploy with Countdown** path exists (`launchAt`, pre-trade lock, auto-open without keeper)
- [x] Signed binding of draft, ticker, reservation version, nonce, metadata, graduation target, generations, `launchAt`
- [x] Frontend surfaces: Prepare Mode, promotion pages, countdown (`ScheduledLaunchCountdown`, `PublicPromotion`, `ScheduledTokenAccessRoute`)

**Evidence:** `contracts/LaunchCampaign.sol` (`launchAt`), `contracts/LaunchFactory.sol` (scheduled create + auth), `frontend/src/pages/PushDraftLive.tsx`, `frontend/src/pages/Prepare*.tsx`, draft/route-auth APIs.

### 1.2 Corrected creator cooldown model

- [x] `launchAt` is trading-open time only (not a global reserved slot)
- [x] Multiple campaigns may share the same `launchAt`
- [x] Cooldown checked at deploy/arm time (factory-level)
- [x] Immediate and scheduled campaigns share live-campaign accounting
- [x] Creator buy lock anchored to trading-open (`launchAt + lockDuration`)

**Evidence:** `docs/creator-arm-cooldown-correction-2026-07-29.md`, PR #79 history, factory deployment purpose field: *creator cooldown evaluated at arm/deploy time*.

### 1.3 Corrected BSC Testnet factory generation

- [x] Factory generation **3** / campaign generation **2** recorded and activated
- [x] Factory-owned permanent LP locker deployed with replacement factory
- [x] Older factories kept supported (creation disabled on obsolete factories)
- [x] Reuses existing Topaz / treasury / registry / route-authority infrastructure

**Evidence:** `deployments/bscTestnet.creator-arm-cooldown-factory.json`  
- Active factory: `0xA2B19f194826b6D930D18F3fBCad662FaDC9459E`  
- Locker: `0x58867c3B969e838e405f1130F8fFF9ff4E7d2343`  
- Activated: `2026-07-29T20:29:55Z`

### 1.4 Graduation-tier enforcement

- [x] Allowed targets enforced in backend (`$6` test tier on chain 97; `$15K` / `$30K` / `$50K` production set)
- [x] Arbitrary values rejected
- [x] Draft stores `graduation_target_wei` (migration present)

**Evidence:** `frontend/api/dev-fix/drafts-base.js`, `draft-deploy-base.js`, `route-auth.js`, `db/migrations/20260729134500_add_draft_graduation_target.sql`.

### 1.5 Canonical ticker reservation lifecycle

- [x] Uniqueness / reservation records / version / nonce / expiry / grace
- [x] Renewal / reclaim / armed state / permanent post-arm ownership
- [x] Deployment reconciliation path (including draft ↔ indexed campaign link fix)
- [x] Atomic blocking uniqueness (chain + cluster + normalized ticker)
- [x] Status model includes `SOFT_RESERVED`, `PREPARE_MODE_RESERVED`, `ARMED_ONCHAIN`, `EXPIRED_GRACE`, `SCHEDULE_MISSED`, etc.

**Evidence:**  
`db/migrations/20260728193040_canonical_ticker_reservations.sql`  
`db/migrations/20260728203032_scope_ticker_reservations_by_cluster.sql`  
`frontend/api/dev-fix/ticker-reservation-service.js`  
`frontend/src/lib/draftApi.ts`

### 1.6 Cryptographic draft ownership

- [x] Signed wallet owner sessions (not trust-submitted wallet alone)
- [x] Covers private draft read, promotion publish, deploy, archive, scheduled auth, ticker management, reconciliation

**Evidence:** `frontend/api/dev-platform/draft-auth.js`, `frontend/src/lib/draftAuth.ts`, `db/migrations/20260728_000002_draft_owner_sessions.sql`.

### 1.7 TreasuryRouterV2 and multi-locker foundation

- [x] `TreasuryRouterV2` contract + tests/tooling
- [x] V1 path retained for older campaigns (compatibility stance in plan/docs)
- [x] Weekly / monthly treasury separation artifacts
- [x] Charity Treasury deployed on staged testnet artifacts
- [x] Community Rewards routing contracts present
- [x] Multi permanent LP locker support + harvest path in `PermanentLpLocker`
- [x] Creator 80% / protocol 20% LP-fee model in locker/router design

**Evidence:** `contracts/TreasuryRouterV2.sol`, `contracts/CharityTreasury.sol`, `contracts/PermanentLpLocker.sol`, `deployments/bscTestnet.treasury-v2-staged.json`, harvest tests/commits.

### 1.8 Generation-aware indexing

- [x] Multiple factory generations / supported factory inventory
- [x] Active vs supported factory addresses in indexer env wiring
- [x] Adaptive / multi-factory discovery and cursors

**Evidence:** `realtime-indexer/src/factoryInventory.ts`, `factoryDiscovery.ts`, historical factory recovery commits.

### 1.9 Legacy curve-history and realtime recovery

- [x] Legacy history recovery work merged (PR #80 lineage)
- [x] Trade reconciliation / Ably stabilization work landed on branch history
- [x] Tiny BNB display precision + CSP/analytics hardening reflected in closeout commits

**Evidence:** git history (`Recover legacy curve history…`, featured metrics, image hydration commits).

### 1.10 Creator and linked-wallet protection

- [x] Direct creator buy lock + linked creator-cluster buy lock
- [x] Tier-specific unlock times + shared cluster buy cap
- [x] Direct creator→wallet BNB funding detection path
- [x] Persistence into wallet/cluster risk tables + reservations
- [x] On-chain RiskRegistry sync jobs support
- [x] Atomic authorization reservations (cap race prevention)
- [x] Campaign-specific restrictions; fail-closed UI (no MetaMask open on backend deny)
- [x] Creator protection dialog in app shell

**Evidence:** PR #81 merge, `db/migrations/20260730_000001_creator_cluster_buy_reservations.sql`, `20260730_000002_creator_funding_indexer.sql`, `frontend/src/components/token/CreatorProtectionDialog.tsx`, `frontend/api/dev-platform/security-current-time.js`, `creator-cluster-detector.js`.

### 1.11 Supabase / DB security additions

- [x] Scheduled launch storage
- [x] Canonical ticker reservation tables + events
- [x] Creator-cluster buy reservations
- [x] Draft owner sessions
- [x] Service-role oriented reservation access pattern in API layer

**Evidence:** migrations under `db/migrations/20260728*`, `20260729*`, `20260730*`.

### 1.12 Frontend launch and campaign presentation (mostly done)

- [x] Scheduled campaign / countdown UX
- [x] Prepare Mode promotion pages
- [x] Local + UTC presentation patterns
- [x] Graduation-tier selection on deploy path
- [x] Creator-only pre-launch Token Details access control
- [x] Image URI normalization + draft image recovery for featured campaigns
- [x] Featured campaign metrics restoration
- [x] Creator protection dialog
- [x] Deployment-path hardening so install/start/build all apply closeout repairs (Netlify/Railway determinism commits on HEAD)

**Evidence:** pages/components listed above; commits through `7ed78f7d`.

### 1.13 Extra work discovered during build (completed corrective streams)

- [x] Scheduled-launch architecture correction (slot model removed)
- [x] Replacement factory + locker generation
- [x] TSM/ATS-style incident repairs (reconciliation, ticker after deploy, factory selection, private-draft auth noise, countdown lifecycle)
- [x] Creator-cluster protection expansion beyond original creator lock
- [x] Multi-ABI / multi-generation history decoding
- [x] Netlify vs Railway install/build/start parity hardening
- [x] Campaign image hydration from Prepare Mode drafts

---

## 2. IN PROGRESS / PARTIAL — still in the works

### 2.1 Priority 1 — Latest protection + image deployment verification

| Item | Status | Notes |
|------|--------|--------|
| Netlify frontend on current `devpostgrad` HEAD | **IN PROGRESS / VERIFY** | Plan checked `2e9a3b29`; HEAD is now `7ed78f7d`. Needs live rebuild confirmation. |
| Railway frontend API redeployed | **IN PROGRESS / VERIFY** | Same — ops confirmation required. |
| Railway BSC Testnet RPC healthy | **IN PROGRESS / VERIFY** | Operational, not verifiable from repo alone. |
| Explorer key / funding-indexer path for creator funding detection | **IN PROGRESS** | PR/commit `#85` replaced explorer dependency with BNB funding indexer — confirm env + live behavior. |
| WIC shows real image | **IN PROGRESS / VERIFY** | Code path exists; needs live check. |
| WIC creator Tier-1 lock dialog (not “Protection Check Unavailable”) | **IN PROGRESS / VERIFY** | Dialog exists; “Unavailable” path still present as fallback — prove happy path live. |
| Unrelated wallet can still trade | **IN PROGRESS / VERIFY** | Acceptance proof, not closed in repo. |

### 2.2 Priority 2 — PR #75 War Trade Room / Topaz continuity

**PR:** https://github.com/uptokendev/MemeBattles/pull/75  
**Branch:** `agent/war-trade-room-continuity-foundation`  
**State at inspection:** OPEN, **DRAFT**, **CONFLICTING** with `devpostgrad`  
**Divergence:** ~**59 ahead / ~55 behind** (still diverged)

| Item | Status | Notes |
|------|--------|--------|
| DB foundation (`campaign_market_state`, `dex_pools`, `dex_trades`, `market_stats`, `trade_intents`, repair logs, candles) | **IN PROGRESS** | On PR only — **not** on `devpostgrad` |
| Graduation handoff / historical reconciler / Topaz swap+reserve indexing | **IN PROGRESS** | PR files: `graduationReconciler.ts`, `topazPoolIndexer.ts`, etc. |
| Unified market API + Ably market updates | **IN PROGRESS** | PR only |
| `UnifiedMarketChart`, graduation explosion, Topaz buy/sell adapter | **IN PROGRESS** | PR only — **absent** from current tree |
| Fail-closed pending/degraded market stages | **IN PROGRESS** | PR migrations include degraded metadata rule |
| Rebase/merge onto current `devpostgrad` preserving cooldown, draft sessions, tickers, protection, image fixes, factory gen config | **IN PROGRESS / BLOCKED** | Mergeable = CONFLICTING |
| Authenticated trade-intent creation | **IN PROGRESS / MISSING** | Plan lists as pre-merge gap |
| Complete reorg / block-replacement rollback | **IN PROGRESS / MISSING** | Plan lists as pre-merge gap |
| Deterministic candle repair | **IN PROGRESS / MISSING** | Plan lists as pre-merge gap |
| ERC-20 Transfer-based holder balances | **IN PROGRESS / MISSING** | Plan lists as pre-merge gap |
| Wire unified market workspace into actual War Trade Room page | **IN PROGRESS / MISSING** | `WarRoom.tsx` exists on mainline; unified market not integrated on branch |
| Remove branch-only validation workflows | **IN PROGRESS** | PR contains `.github/workflows/wtr-*-validation.yml` |
| Conflict resolution with current `TokenDetails` | **IN PROGRESS** | PR touches `TokenDetails.tsx` |
| Full frontend + indexer + Topaz suites on rebased head | **IN PROGRESS** | Prior green on old head; must re-run after rebase |

### 2.3 Priority 3–4 — WTR production pieces + shadow deploy (testnet)

| Item | Status |
|------|--------|
| Deploy WTR API/indexer to Railway (shadow, public execution flags off) | **IN PROGRESS / NOT DEPLOYED** on mainline |
| Historical graduation reconciler run against real graduated campaign | **IN PROGRESS** |
| Resolve graduation tx / router / factory / WBNB / pair / fee / reserves / post-burn supply | **IN PROGRESS** |
| Register + backfill pool; compare swaps/reserves to chain | **IN PROGRESS** |
| Enable unified market API → chart → quotes → trading (staged) | **IN PROGRESS** |

### 2.4 Treasury live harvest & reconciliation proof

| Item | Status | Notes |
|------|--------|--------|
| Contracts + unit coverage for harvest routing | **DONE** | Implementation exists |
| Live multi-locker authorization on active gen-3 stack | **IN PROGRESS / VERIFY** | Deployment artifact listed activation steps; confirm all lockers authorized on current primary router |
| Live fee accrue → harvest → 80/20 split → DB/indexer/admin agree | **IN PROGRESS** | Plan explicitly: *not the main implementation — complete live harvest and reconciliation proof* |

### 2.5 Phase 3A residual gaps (implementation mostly done)

These are **not** greenfield; they are closeout residual / polish vs the detailed Phase 3A checklist:

| Item | Status | Notes |
|------|--------|--------|
| `tradingOpen()` explicit read helper on campaign | **PARTIAL** | `launchAt` enforced; dedicated `tradingOpen()` name from plan not found |
| Full Creator Command Center reservation state machine UI (Drafts / Prepare / Scheduled / Armed / Live / Expired as product surface) | **PARTIAL** | Pieces exist (Prepare, drafts, upcoming drafts); not a complete single Command Center ops product |
| Public Upcoming Launches full status vocabulary | **PARTIAL** | `UpcomingDrafts` etc. exist; full status set not proven complete |
| Reservation expiry dashboard notifications (72h/24h/grace/missed/armed/live) | **PARTIAL / THIN** | Expiry processing exists in service; required notification matrix not clearly complete |
| Admin Prepare Mode Launch Operations diagnostics | **PARTIAL / THIN** | Backend diagnostics incomplete relative to plan §4.8 |
| Existing-draft ticker migration + duplicate conflict inventory | **IN PROGRESS / UNPROVEN** | No dedicated migration/rehearsal artifact found in repo |
| Feature-flag rollout checklist for reservations/scheduling fully executed | **IN PROGRESS / UNPROVEN** | Implementation present; formal rollout report not closed |
| End-to-end Phase 3A acceptance matrix (immediate, scheduled, expiry, race, tier-cap, full lifecycle) | **IN PROGRESS / OPEN** | Tests exist in pieces; combined acceptance report not closed |

### 2.6 Frontend “mostly done” leftovers

| Item | Status |
|------|--------|
| Live confirmation that production build + protection tests + Topaz CI + secret scan are green on **current** HEAD | **IN PROGRESS / VERIFY** |
| Mobile Launch Controls QA / wallet EIP-6963 matrix sign-off | **IN PROGRESS / UNPROVEN** |

---

## 3. NOT STARTED — not even started (or no closed gate)

### 3.1 Priority 5 — Full $6 acceptance pack (go/no-go)

#### Launch-path acceptance
- [ ] Direct Create acceptance run recorded
- [ ] Draft Deploy Now acceptance run recorded
- [ ] Draft Deploy with Countdown acceptance run recorded
- [ ] Signed authorization verified end-to-end
- [ ] Correct factory (gen 3) used
- [ ] Threshold persistence verified
- [ ] Ticker permanence after arm verified
- [ ] Current-time creator cooldown verified
- [ ] Scheduled pre-launch trading lock verified
- [ ] Automatic open at `launchAt` verified
- [ ] Same-`launchAt` multi-campaign verified
- [ ] Creator live-count accounting verified
- [ ] Creator buy-lock behavior verified
- [ ] Unrelated-wallet trading verified

#### Graduation acceptance
- [ ] Bonding buy/sell through $6 graduation
- [ ] Topaz volatile pool creation
- [ ] LP transfer to correct permanent locker
- [ ] Pool registration
- [ ] Post-burn supply reconciliation
- [ ] Market-stage transition (no external handoff UX)
- [ ] Chart remains mounted; full bonding history retained
- [ ] Graduation marker present
- [ ] No DexScreener iframe / no PancakeSwap copy as primary trade UX

#### Topaz trading acceptance
- [ ] In-app Topaz buy
- [ ] In-app Topaz sell
- [ ] External Topaz trade appears in MemeWarzone
- [ ] Allowance only to verified router
- [ ] Quote/execution parity + slippage/min received
- [ ] No bonding fee post-graduation
- [ ] Post-grad activity isolated from bonding reward calculations

#### Harvest acceptance
- [ ] Fees accrue
- [ ] Locker harvest succeeds
- [ ] LP principal untouched
- [ ] Creator 80% / protocol 20%
- [ ] All old + new lockers authorized
- [ ] TreasuryRouterV2 reconciliation succeeds
- [ ] DB / indexer / frontend / admin agree

### 3.2 Priority 6 — Admin and operations closeout (Market Continuity)

- [ ] Supported pools ops view
- [ ] Pool verification controls
- [ ] Indexer cursors and lag
- [ ] Degraded pools surface
- [ ] Route mismatch alerts
- [ ] Failed backfills
- [ ] Candle/stat repair controls
- [ ] Quote comparison tools
- [ ] Locker/harvest state dashboard
- [ ] Audited retry / reconciliation controls
- [ ] Disable/restore Topaz execution controls
- [ ] Monitoring and alerts wired
- [ ] Guarantee public app cannot call privileged repair ops

**Evidence of absence:** `campaign_market_state` / `dex_pools` / Market Continuity strings only appear in the plan and on PR #75 — not on `devpostgrad`.

### 3.3 Priority 7 — Security and release closeout

- [ ] Complete secret and credential review
- [ ] Confirm production environment ownership
- [ ] Run security matrix (as launch evidence, not just local scripts existing)
- [ ] RPC failover test
- [ ] Worker restart recovery test
- [ ] Database restore/rollback rehearsal
- [ ] Deployment rollback rehearsal
- [ ] Audit final contracts + final application commit
- [ ] Freeze accepted source and deployment manifests
- [ ] Produce signed acceptance evidence

*(Scripts/docs exist in places — e.g. runbooks, security remediation docs — but the **release gates are not closed**.)*

### 3.4 Priority 8 — Mainnet controls and deployment

- [ ] Owners Safe
- [ ] Ops Safe
- [ ] Signer custody
- [ ] Timelock decisions
- [ ] Production funding
- [ ] Final BNB deployment addresses
- [ ] Mainnet deployment sheet
- [ ] Mainnet-equivalent final testnet generation
- [ ] Mainnet deployment
- [ ] First immediate launch monitoring
- [ ] First scheduled launch monitoring
- [ ] First graduation monitoring
- [ ] First Topaz buy/sell monitoring
- [ ] First LP-fee harvest reconciliation

### 3.5 Phase 3A go/no-go gates still open (even though code is largely present)

From plan §8 — these remain **PENDING** as **acceptance gates**, not as “no code”:

- [ ] Timed launch contracts — formal go condition closed
- [ ] Ticker reservation lifecycle — formal go condition closed
- [ ] Existing draft migration — formal go condition closed
- [ ] Creator launch operations — formal go condition closed
- [ ] Scheduled-launch acceptance — final-generation campaign through graduation + reconcile

---

## 4. OUT OF SCOPE for this BNB closeout

Do **not** silently expand closeout with these (plan §5 / §9):

- Full Recruiter vertical slice expansion
- Shared epoch + claim engine completion beyond proving bonding-only accounting isolation
- Weekly Airdrop eligibility/draw engine completion
- Squad Pool allocation mathematics completion
- Full incentive admin/diagnostics/sim epoch certification
- Backend-custodied auto-deployment / gas deposit / AA paymasters
- Paid ticker markets / ticker transfers / cross-chain ticker exclusivity
- Solana timed-launch contracts (chain-aware data model only)
- Full multi-channel notification rebuild (dashboard warnings sufficient if working)

**Closeout-only incentive requirement:** prove routing buckets + bonding-only accounting remain correct and Topaz volume is isolated.

---

## 5. Repo vs plan snapshot (quick truth table)

| Plan claim | Repo reality |
|------------|--------------|
| Prepare Mode timed launches DONE | **Confirmed** (contracts + FE + APIs) |
| Ticker reservation DONE | **Confirmed** (migrations + service + APIs) |
| Factory gen 3 / campaign gen 2 DEPLOYED | **Confirmed** (deployment JSON) |
| Creator protection DONE (PR #81) | **Confirmed** on branch |
| TreasuryRouterV2 foundation DONE/DEPLOYED | **Confirmed** code + staged deploy artifacts; live harvest proof open |
| WTR foundation “already built” | **Built on PR #75 only** — not merged, conflicting |
| Frontend presentation mostly done | **Confirmed** with live deploy verify still open |
| $6 full lifecycle acceptance | **Not closed** |
| Market Continuity admin surface | **Not present** on `devpostgrad` |
| Mainnet controls | **Not started** |

---

## 6. Recommended closeout order (next actions)

### Just finished

1. Prepare Mode create / publish / timed arm (live)  
2. Arm cooldown policy kept as gen-3 (24h any arm + live-cap)  
3. Arm explain dialog on Create + draft deploy  
4. RPC failover for create-authorization  

### Now (short acceptance — not a big build)

1. After `launchAt` on a $6 campaign: **clean wallet** buy/sell on bonding.  
2. **Creator wallet**: Tier buy-lock dialog (not Unavailable).  
3. If clean wallet hits UNAVAILABLE: funding-indexer worker + RPC ops only.

### Next major engineering stage — follow `topaztrading.md`

4. **Phase 0:** freeze SHAs, verify Topaz router/factory/WBNB on chain 97, ABI capture, inventory DexScreener/Pancake removals.  
5. **Rebase PR #75** onto current `devpostgrad` (preserves prepare-mode/RPC/arm-dialog work).  
6. **Phases 1–5 (backend):** route resolution → market schema → graduation handoff → pool indexer → unified API/candles.  
7. **Phases 6–8 (frontend):** UnifiedMarketChart → Topaz trade adapter → **TokenDetails continuous trade** → War Trade Room reuse.  
8. **Phases 9–10:** admin diagnostics + shadow mode + $6 Topaz/harvest acceptance.  
9. Admin Market Continuity (web-dashboard) + mainnet gates.

---

## 7. Scorecard

| Bucket | Status |
|--------|--------|
| Core launchpad contracts + Prepare Mode | **DONE** |
| Arm cooldown + UX | **DONE** |
| Bonding trade-path acceptance | **DONE** (code); optional re-smoke |
| WTR / Topaz continuity | **DONE** on `devpostgrad` |
| Unified chart + creator UX | **DONE** |
| LP harvest (creator + ops) | **DONE** |
| $6 go/no-go formal sign-off | **Operator checklist** (`docs/bnb-launchpad-closeout-2026-08.md`) |
| Admin + mainnet | **Later** |

**Bottom line (2026-08-06):** Postgrad **BNB launchpad product build is complete** for continuous bonding → Topaz. Remaining work is **operator sign-off** on the acceptance checklist and **mainnet/admin** when you choose to schedule it.
)
