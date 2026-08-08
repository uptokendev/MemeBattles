# Solana ↔ BNB product parity — build plan

**Status:** Approved direction 2026-08-08  
**Branch:** `devpostgrad` (single product source of truth)  
**Bar:** A user who only switches **chain + wallet** must get the same launchpad product as BNB postgrad.

## Non-negotiables

1. **Canonical program:** `programs/memewarzone_solana/` (V4 only).  
2. **Legacy scaffold is not product:** `solana/programs/meme_warzone_launchpad/` + legacy FE adapter create/buy/sell.  
3. **No fake readiness:** never set “protocol live” for Solana trade until V4 buy/sell exist and are authorized.  
4. **Secrets:** program keypair, upgrade authority, route-signer secret stay out of git / Netlify / `VITE_*`.  
5. **Reuse BNB patterns:** drafts, ticker, route-auth style digests, Command Center, leagues, recruiter — chain-aware, not forked UIs.

## Dual-stack debt (cleanup)

| Keep (reuse) | Quarantine / do not product-wire | Ops (not auto-deleted) |
| --- | --- | --- |
| V4 program + `authorized_create` | Legacy Anchor workspace under `solana/` | Remote branches listed below |
| `solana-create-authorization-v4.js` + FE V4 plan helpers | `solanaLaunchpadAdapter` **create/buy/sell** as product path | Open PR #55 DRAFT — audit then close |
| Solana wallet, drafts, upload, ticker, recruiter Ed25519 | Indexer legacy event decoder until V4 events | `fix/solana-upload-robustness` — cherry-pick only if needed |
| Devnet runbook + readiness scripts | Old create-authorization v1–v3 docs (archive markers) | Historical agent/* solana branches |

**Branch/PR hygiene (operator):** do not mass-delete remotes without a second confirmation. Prefer:

- Close PR **#55** (`agent/solana-phase0-source-of-truth`) as superseded by #67 + `devpostgrad`.  
- Leave merged Solana agent branches as remote history; optional later archive.

## Phase roadmap (full BNB mimic)

### P0 — Create ceremony (BNB Prepare → Push Live)

**User exit:** Solana draft → authorized create → campaign + mint + vaults on **devnet**; trade UI disabled/honest.

| Step | Work | Owner |
| --- | --- | --- |
| P0.1 | Quarantine legacy adapter; document V4-only product path | Eng |
| P0.2 | Operator: program keygen, `declare_id`, build, deploy, bootstrap | Ops |
| P0.3 | Railway: RPC, program ID, route signer, hashes; auth smoke with flag off | Ops |
| P0.4 | FE: Push Live / Deploy Now → `authorize_solana_v4` → real V4 tx | Eng |
| P0.5 | V4 create indexing (minimal campaign row) | Eng |
| P0.6 | Flip `SOLANA_CREATE_AUTH_ENABLED=true` after one success + one reject | Ops |

**Refs:** `docs/solana-devnet-deployment-runbook.md`, `docs/solana/railway-create-authorization-v4.md`, `docs/solana/phase-0-source-of-truth.md`

### P1 — Bonding trade (BNB Token Details + War Room)

**User exit:** Buy/sell on bonding curve with route-style authorization; chart/trades/mcap; War Room bonding.

| Step | Work |
| --- | --- |
| P1.1 | V4 program buy/sell (+ fee routing) |
| P1.2 | Railway trade authorization (mirror BNB route-auth) |
| P1.3 | FE V4 IDL client replaces legacy adapter for reads/trades |
| P1.4 | Indexer V4 trade events + Ably base58 channels |
| P1.5 | Token Details + War Room Solana path |

### P2 — Graduation + DEX continuity (BNB Topaz)

**User exit:** Graduate in-app; continuous chart; permanent LP lock; post-grad swaps.

| Step | Work |
| --- | --- |
| P2.1 | Graduation ix + SOL/USD policy |
| P2.2 | Meteora DAMM v2 primary; Raydium fallback |
| P2.3 | Continuity indexer + FE chart handoff |
| P2.4 | LP fee harvest + creator Command Center claims |

### P3 — Incentives (BNB league / recruiter / featured heat)

**User exit:** League boards, claims, Featured upvotes, recruiter on-chain claims parity.

| Step | Work |
| --- | --- |
| P3.1 | League scoring + prize for Solana epochs |
| P3.2 | Lift `SOLANA_CLAIMS_DISABLED` with rails |
| P3.3 | Upvotes + Featured for Solana campaigns |
| P3.4 | Ranks / activity from Solana trades |

## BNB surface checklist (must all land by P3)

1. Wallet connect / network switch  
2. Create (immediate + Prepare/scheduled)  
3. Draft promotion / Push Live / logo / ticker  
4. Bonding buy/sell  
5. Charts / trades / mcap / holders  
6. Graduation + DEX continuity  
7. LP lock / fee harvest / creator claims  
8. Upvotes / Featured / Explore / Ending Soon  
9. War Room  
10. League (categories + prize + claims)  
11. Recruiter + portal + squad  
12. Profile / follows / comments / ranks  
13. Command Center claims / rewards  
14. Security / routing auth / creator protection  
15. Indexer + Ably  
16. Auth enforce / API surfaces  

## Implementation order now

1. ~~This doc + cleanup quarantine~~ (done on `devpostgrad`)  
2. ~~P0.1 FE V4 Push Live wire + legacy quarantine~~ (done)  
3. **Ops P0.2–P0.3** when keys ready (devnet deploy + Railway env)  
4. Enable `SOLANA_CREATE_AUTH_ENABLED=true` after one success + one reject  
5. Minimal V4 create indexer row (P0.5)  
6. P1 buy/sell program + FE  

### Engineering already on `devpostgrad`

| Piece | Path |
| --- | --- |
| Parity plan | `docs/solana/bnb-parity-build-plan.md` |
| Legacy quarantine | `solana/README.QUARANTINE.md`, adapter mutations throw |
| V4 authorize client | `frontend/src/lib/solanaCreateAuthorizationV4.ts` |
| V4 plan + submit | `solanaCreateCampaignV4Plan.ts`, `solanaV4CreateSubmit.ts` |
| Push Live Solana | `frontend/src/pages/PushDraftLive.tsx` → authorize + submit |
| Railway authorize | `frontend/api/dev-force/solana-create-authorization-v4.js` |

## Explicit non-goals until the matching phase

- Enabling legacy buy/sell as a stopgap “product”  
- Mainnet Solana before P1 exit on devnet  
- Merging draft PR #55 wholesale into `devpostgrad`  
- Claiming league/claim parity before P3  

## Success metrics

| Gate | Metric |
| --- | --- |
| P0 | 1 authorized create + 1 unauthorized reject on devnet; explorer shows mint/vaults |
| P1 | 1 buy + 1 sell; chart updates; War Room quotes |
| P2 | 1 graduation + continuous chart + LP claim path |
| P3 | League row for Solana campaign; claimable reward smoke |
