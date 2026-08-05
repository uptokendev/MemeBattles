# BNB Launchpad Closeout — 2026-08-06

**Branch:** `devpostgrad`  
**Scope:** Testnet (chain 97) continuous bonding → Topaz launchpad  
**Out of scope for this closeout:** Mainnet gates, full recruiter/airdrop expansion, Solana

---

## 1. Scorecard (repo + live proof)

| Area | Status | Evidence |
|------|--------|----------|
| Prepare Mode (draft / timed arm / publish) | **DONE** | Contracts + FE + APIs |
| Clean-slate factory + locker | **DONE** | `0x77Af…` factory, `0xb083…` locker |
| Bonding trade on Token Details | **DONE** | Existing path |
| Graduated trade = **Topaz only** | **DONE** | `topazV2Trade.ts`; DexScreener/Pancake removed from FE |
| Unified chart (bonding + Topaz) | **DONE** | `UnifiedMarketChart` continuous OHLC + mcap |
| Creator chart pins (avatar + hover card + stack) | **DONE** | Orange popup, 1s stay, mobile tap-out, stack on 1h+ |
| War Room Topaz quote/buy/sell | **DONE** | `WarRoomTradePanel` + fill record |
| War Room post-fill chart refresh | **DONE** | `recordTopazFill` + event |
| Market continuity API + pool indexer | **DONE** (ops on) | Indexer flags; DDY smoke below |
| LP fee claim (Command Center only) | **DONE** | Creator harvest UI; ops harvest on web-dashboard |
| Creator buy lock (on-chain) | **DONE** | Factory + security preflight |
| Funding-indexer fail-closed buys | **SOFTENED** | Unavailable detector → warning + allow (no silent MetaMask block for clean wallets) |
| $6 full lifecycle formal pack | **RUNBOOK READY** | Manual steps below |
| Mainnet / audit gates | **LATER** | Not this closeout |

---

## 2. Live smoke already proven (DDY example)

Indexer: `https://memebattles-production-dca0.up.railway.app`  
Campaign: `0x127629b181023b503e91dca1e33c6f94664257b4`

| Check | Result |
|-------|--------|
| `marketStage` | `TOPAZ_ACTIVE` |
| `tradingEnabled` | `true` |
| `poolEnabled` | `true` |
| `lastIndexedBlock` | advancing (e.g. `123365775`) |
| Reserves / fee / WBNB | populated after repair |
| Repair | `POST /api/token/:campaign/repair-dex-pool?chainId=97` |

**Note:** Bonding trades may still dominate `market-trades` until more Topaz Swaps occur; chart uses continuous client series + indexer when available.

---

## 3. Final acceptance checklist (you run once)

Use PowerShell + `curl.exe`. Set:

```powershell
$TOKEN_API = "https://memebattles-production-dca0.up.railway.app"   # postgrad indexer
$FE_API    = "https://YOUR-POSTGRAD-FRONTEND-API.up.railway.app"  # frontend API if separate
$CAMPAIGN  = "0x…"  # fresh or DDY
```

### A. Continuity

```powershell
curl.exe -sS --max-time 30 "$TOKEN_API/api/token/$CAMPAIGN/market-state?chainId=97"
# Expect TOPAZ_ACTIVE (or TOPAZ_PENDING briefly), tradingEnabled true, poolEnabled true
```

### B. Product path (manual in UI)

1. **Bonding:** clean wallet buy + sell on a live (non-graduated) campaign  
2. **Creator lock:** creator wallet during lock → Tier lock dialog (not “Unavailable”)  
3. **Graduate** (or use DDY): Token Details still trades on-site via Topaz  
4. **Chart:** 1m Price + Market Cap look continuous; creator avatar pins + orange hover card  
5. **War Room:** Topaz buy/sell; chart updates after fill  
6. **LP fees:** Command Center → Coins → Claim LP fees when unharvested &gt; 0  
7. **Ops (optional):** web-dashboard `/finance/lp-fees` harvest  

### C. Env must-haves (postgrad)

**Indexer**

```text
ENABLE_GRADUATION_HANDOFF_RECONCILER=1
ENABLE_TOPAZ_POOL_INDEXER=1
ENABLE_UNIFIED_MARKET_API=1
LP_LOCKER_ADDRESS_97=0xb083929D2bbabdE7fc580090D5B18bbD918Fda9a
BSC_RPC_HTTP_97=<working RPC>
```

**Frontend Netlify**

```text
VITE_ENABLE_POSTGRAD=true
VITE_TOKEN_API_BASE=<indexer>
VITE_REALTIME_API_BASE=<indexer>
VITE_PERMANENT_LP_LOCKER_ADDRESS_97=0xb083…
VITE_TOPAZ_* addresses for router/factory/WBNB
```

---

## 4. Explicit non-goals (do not block “launchpad done”)

- Mainnet (56) production cutover  
- Full Market Continuity admin UI rebuild  
- Perfect historical candles for every past campaign without re-index  
- Recruiter / airdrop / squad product expansion  

---

## 5. Known residual risks

| Risk | Mitigation |
|------|------------|
| Free RPC timeouts on pool log scans | Chunked indexer + soft errors; optional better RPC |
| Sparse Topaz history until Swaps exist | Expected; chart still works from client fills |
| Funding indexer lag | Soft-allow clean wallets; still block proven creator links |
| Mainnet not configured | Separate go-live ticket |

---

## 6. Definition of done (this closeout)

- [x] Continuous bonding → Topaz product path in code  
- [x] No DexScreener/Pancake as trading/chart primary  
- [x] Creator LP claim in Command Center  
- [x] Chart continuous + creator trade UX  
- [x] Indexer market continuity operable on postgrad  
- [x] Closeout doc + soft-fail for funding detector lag  
- [ ] One signed operator sign-off on checklist §3.B (manual)

When §3.B is green once on testnet, **BNB launchpad build for postgrad is complete** for product purposes.
