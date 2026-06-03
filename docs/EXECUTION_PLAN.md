# MemeWarzone — Execution Plan & Contributor Guide

> Read this before branching off to work a Jira ticket. It captures the branch
> strategy, the Jira backlog, execution order, dependency graph, and the
> per-ticket workflow so multiple people (or agents) can work in parallel
> without stepping on each other.

Repo: `uptokendev/MemeBattles` · Jira project: **DEV** (`https://mwz.atlassian.net`)
Last updated: 2026-06-03

---

## 1. Branch strategy

`origin/dev` and `origin/devpostgrad` both carry changes that must reach `main`.
We integrate on a **`staging`** branch (created from `origin/dev`), merge
`origin/devpostgrad` into it, reconcile `main`, then PR `staging → main`.

```
main ──(16 hotfix commits — reconcile, see DEV-33)
 │
origin/dev ──► staging ◄── integration target (this branch)
                  │
                  └── merge origin/devpostgrad ──► staging = dev + devpostgrad
                                                       │
                                                       └──► PR staging → main (DEV-36)
```

### Divergence snapshot (2026-06-03, split at `60bf55b` 2026-05-21)

| Comparison | Unique commits |
|---|---|
| `origin/dev` ahead of `main` | 915 |
| `origin/devpostgrad` ahead of `main` | 1258 |
| `dev` vs `devpostgrad` | 102 (dev-only) ↔ 445 (devpostgrad-only) |
| `main` ahead of both | 16 (direct hotfixes — confirm with team) |

### What each branch owns

- **`dev`** (already in `staging`): MemeWarzone landing page + domain routing,
  logo→public-site redirects, Discord join-quest / OAuth guild verification,
  War Missions daily quests (Daily Warpath, daily rollover).
- **`devpostgrad`** (merging in): post-grad systems (arena battles, league, war
  pools, events, sponsorships), rewards/recruiter/airdrop/squad stubs + the
  route-auth signer, creator-fee economics.

### Known merge-conflict hotspots (DEV-32)

- `frontend/api/dev-fix/stubs.js` — both branches have a copy
- App routing / `frontend/src/app.tsx`
- Landing page + landing styles — **dev owns it; devpostgrad already removed its
  copy → keep dev's**
- Stylesheet imports

---

## 2. Current code reality (verified on `devpostgrad`)

Authoritative source: **`frontend/docs/API_ROUTE_MAP.md`** (route status: real /
stub / alias / internal / signer) and **`frontend/api/dev-fix/stubs.js`**.

**Already `real`:** campaigns feed, comments, chat (Ably realtime), league +
claims + payouts + merkle root, profile/cabinet, votes, follows, uploads, auth
nonce.

**Stubbed (the build backlog):** reward ledger (`/rewards/me*`), recruiters
(leaderboard/summary/referral-capture/signup), attribution (wallet-connect),
squads, airdrops (winners + draw engine), internal reward ops.

**Important corrections to the original audit:**
- The **route-authorizer is implemented** as a signer
  (`frontend/api/dev-fix/route-auth.js`); it works once
  `ROUTE_AUTHORITY_PRIVATE_KEY` is set. `ROUTE_AUTHORIZER_NOT_IMPLEMENTED` is the
  no-key fallback. → DEV-11 is **config + verify**, not "build a signer."
- The **creator 0.10% fee** exists as a frontend constant
  (`frontend/src/features/postgrad/creatorFeeEconomics.ts`,
  `CREATOR_FEE_BPS = 10`) but `accountingReady` / `claimsReady` /
  `contractEventsReady` are all `false`, and `TreasuryRouter.sol` has **no
  creator bucket**. → DEV-12 is a decision + (if kept) real wiring.

Key files to know:
- `contracts/TreasuryRouter.sol` — fee routing (League/Recruiter/Community/Protocol vaults)
- `contracts/LaunchCampaign.sol`, `LaunchFactory` — create/trade/finalize + route auth
- `frontend/api/dev-fix/stubs.js` — current stub registry
- `frontend/docs/API_ROUTE_MAP.md` — route status + "Next implementation priorities"
- `database/arena_*_import.sql` — post-grad seed data (devpostgrad-only)

---

## 3. Jira backlog

4 epics, all tickets in `To Do`, unassigned. Every Story/Task/Subtask is written
to be self-contained: **Context → Goal → acceptance criteria → Verification →
Definition of Done → Depends on.**

### DEV-4 — Pre-Graduation Launch Core
| Key | Title |
|---|---|
| DEV-7 | Recruiter system: referral attribution + signup |
| ↳ DEV-8 | Persist referral attribution (recruiter↔wallet) |
| ↳ DEV-9 | Recruiter signup nonce + submission |
| ↳ DEV-26 | Recruiter views: leaderboard + summary (DB-backed) |
| DEV-16 | Fast-launch / unlock Deploy Mode |
| DEV-17 | Prepare Mode scheduling: countdown, deploy-at-time, pay-upfront |
| DEV-18 | Reward ledger: DB-back rewards/me + history + claims + eligibility |
| DEV-19 | Squad system: leaderboard, members, summary + pool |
| DEV-20 | Airdrop system: eligibility, claims, winners publication |
| DEV-21 | Telegram promotion bot |
| DEV-22 | Discord promotion bot |
| DEV-23 | TokenDetails: confirm/finish live chat tab |
| DEV-24 | War Room: validate live DB/indexer-backed feed |
| DEV-25 | Graduation → in-page PancakeSwap DEX trading |

### DEV-5 — Post-Graduation Systems
| Key | Title |
|---|---|
| DEV-27 | Battle system: scoring, settlement & reward engine |
| DEV-28 | Major league: production scoring + treasury payout |
| DEV-29 | Betting / arena war pools: escrow, settlement & payout |
| DEV-30 | Sponsorship system: payment, scheduling & activation |
| DEV-31 | Weekend tournaments / events: brackets, scheduling, settlement, admin |

### DEV-6 — Fee Routing & Treasury
| Key | Title |
|---|---|
| DEV-11 | Configure & verify route-authority signer |
| DEV-12 | Creator 0.10% fee: decide + wire (or remove) — **founder decision** |
| DEV-13 | Align trading-fee split model with incentive scope |
| DEV-14 | Align finalize/graduation-fee split model (no League share) |
| DEV-15 | Back internal reward-ops endpoints with real data |

### DEV-10 — Release Integration (staging → main)
| Key | Title |
|---|---|
| DEV-32 | Merge origin/devpostgrad into staging (resolve conflicts) |
| DEV-33 | Reconcile main's 16 unique commits |
| DEV-34 | Load & verify post-grad DB imports on merged DB |
| DEV-35 | Post-merge smoke test: launch flow + dev-side features |
| DEV-36 | Open PR: staging → main |

---

## 4. Execution order & dependency graph

Derived from `API_ROUTE_MAP.md` "Next implementation priorities". **Route auth is
the root** — most attribution/reward work depends on it.

```
DEV-11 (route-auth config)
   ├─► DEV-16 (fast-launch) ─► DEV-17 (scheduling)
   └─► DEV-8 (attribution persistence)
          └─► DEV-18 (reward ledger)  ◄── foundation for everything below
                 ├─► DEV-26 (recruiter views)
                 ├─► DEV-19 (squad system)
                 ├─► DEV-15 (internal reward ops) ─► DEV-20 (airdrop)
                 ├─► DEV-27 (battles), DEV-28 (league), DEV-31 (events)
                 └─► ...
DEV-13 / DEV-14 (fee splits) — parallel, contract-side
DEV-12 (creator fee) — blocked on founder decision
DEV-21 / DEV-22 (bots), DEV-23 (chat), DEV-24 (war room), DEV-25 (DEX) — independent
DEV-29 (betting) — independent but needs security review + compliance
```

Release track (DEV-10) runs alongside: `DEV-32 → {DEV-33, DEV-34} → DEV-35 → DEV-36`.

**Suggested first ticket: DEV-11.** It unblocks the largest subtree.

---

## 5. How to work a ticket

The backlog is built for the **superpowers `subagent-driven-development`** flow,
but the steps apply to any contributor.

1. **Pull work** with JQL:
   `project = DEV AND labels = agent-ready AND status = "To Do"`
   (DEV-12 and DEV-36 are not `agent-ready` — they need a human decision/sign-off.)
2. **Read the ticket fully** — Context, Goal, acceptance criteria, Verification, DoD.
3. **Branch off `staging`** in an isolated worktree:
   ```
   git fetch origin
   git worktree add ../wt-DEV-XX -b feature/DEV-XX-short-desc staging
   ```
   Never work directly on `staging` / `main`.
4. **TDD** — write failing tests against the acceptance criteria first, then implement.
5. **Verify** — run the ticket's Verification commands; capture evidence.
6. **Self-review → spec review → code-quality review** before marking done.
7. **PR back into `staging`** (not `main`). Reference the DEV-XX key in the PR.

### Conventions
- Match the repo's existing commit style (plain imperative subject lines).
- `agent-ready` + an area label (`recruiter`, `airdrop`, `fees`, `squad`,
  `postgrad`, `release`, …) on every actionable ticket.
- Repo + branch (`uptokendev/MemeBattles` · `devpostgrad`) is stated in each
  ticket's Context block.

---

## 6. Open decisions / blockers

- **DEV-12** — keep & wire the 0.10% creator trading fee (contract bucket +
  accounting + claims + events) or remove it. Founder call required.
- **DEV-33** — identify main's 16 unique commits (`git log origin/dev..origin/main`)
  and confirm with the team which are still needed.
- **DEV-29** — betting/war-pools needs legal/compliance sign-off + a contract
  security review before mainnet.
- **`staging` is not yet pushed** — push with `git push -u origin staging` once
  the team is ready to collaborate on it.
