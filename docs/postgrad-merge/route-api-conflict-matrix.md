# MemeBattles Postgrad Route/API Conflict Matrix

Generated for the Phase 0 preservation gate before merging `devpostgrad` into the protected `dev` API backbone.

## Branch Snapshot

| Branch | Head commit | Role |
| --- | --- | --- |
| `dev` | `ceb754401b62ddb1f0e666d70655aa9bb7dea3f3` | Protected operational API backbone. |
| `devpostgrad` | compared as `devpostgrad` against `dev` | Product/UI expansion branch with Arena, War Room, sponsorship, contract, and schema additions. |
| `integration/postgrad-merge` | created from `dev` | Safe reconciliation branch for preserving `dev` APIs while layering postgrad product work. |

## API Preservation Rules Applied

- Preserve every working `dev` endpoint unless a reviewed migration says otherwise.
- Extend existing endpoints instead of creating duplicate competing API versions.
- Keep reward, recruiter, squad, airdrop, prepare-mode, routing authorization, and War Missions behavior DB-backed and intact.
- Gate settlement-sensitive, contract-blocked, and schema-dependent additions behind feature flags until contracts, migrations, and QA are complete.
- Do not expose fake reward, payout, settlement, sponsorship, or battle data in production mode.

## Endpoint Matrix

| Endpoint group | `dev` status | `devpostgrad` status | Classification | Merge decision |
| --- | --- | --- | --- | --- |
| `/api/activity/trades`, `/api/ably/token`, `/api/auth/nonce`, campaign/comment/chat/diagnostics/status/upload/vote/profile routes | Present as operational handlers | Present with no intentional replacement found | Preserve | Keep `dev` behavior unless direct file diff proves a compatible extension. |
| `/api/arena/ops/health` | Not present | Added via `frontend/api/arenaOps.js` | Extend, gated | Add after checking DB/schema readiness and feature flag behavior. |
| `/api/arena/battles`, `/api/arena/battles/open`, `/api/arena/battles/creator-status`, `/api/arena/battles/:battleId`, `/api/arena/battles/:battleId/transition` | Not present | Added via `frontend/api/arenaBattles.js` | Extend, gated | Add as postgrad battle lifecycle API only with persistent battle tables and no fake production settlement. |
| `/api/arena/events`, `/api/arena/events/:eventId`, `/api/arena/events/:eventId/transition`, `/api/arena/events/:eventId/advance-bracket` | Not present | Added via `frontend/api/arenaEvents.js` | Extend, gated | Add behind events/tournaments readiness flags until lifecycle and settlement rules are approved. |
| `/api/arena/league`, `/api/arena/league/advance-week`, `/api/arena/league/rebalance-divisions`, `/api/arena/league/cycle-season-state` | Existing legacy `/api/league`, `/api/leagueRoot`, `/api/leaguePayouts` remain present | Added separate Arena league API | Extend with compatibility checks | Preserve legacy league endpoints; add Arena league routes only if consumers are distinct and payouts remain gated. |
| `/api/arena/war-pools`, `/api/arena/war-pools/:battleId`, `/api/arena/war-pools/:battleId/support`, `/api/arena/war-pools/:battleId/transition` | Not present | Added via `frontend/api/arenaWarPools.js` | Extend, gated | Do not expose publicly until escrow, payout, and compliance rules are approved. |
| `/api/sponsored` | Not present | Added via `frontend/api/sponsored.js` | Extend, gated | Add only when sponsorship lifecycle tables and active approved placement filtering are ready. |
| `/api/sponsorship-applications` | Not present | Added via `frontend/api/sponsorship-applications.js` | Extend, gated | Add as intake/admin workflow with payment review and audit status fields. |
| `/api/war-room` | Not present | Added via `frontend/api/warRoom.js` | Extend | Add as trader workflow API after confirming it reads campaign/trade data through stable service wrappers. |
| `/api/rewards/me`, `/api/rewards/me/history`, `/api/rewards/me/claims`, `/api/rewards/me/eligibility`, `/api/rewards` | Present in `dev` through `dev-fix/stubs.js` and `rewards.js` | Present | Preserve/extend | Keep current reward surfaces; creator-fee buckets must be additive and reconcilable. |
| `/api/airdrops/winners`, `/api/squads`, `/api/squads/members`, `/api/squads/:code/summary`, recruiter and attribution routes | Present in `dev` | Present | Preserve | Do not replace attribution/recruiter/squad behavior. Extend through migrations if needed. |
| `/api/routing/status`, `/api/routing/create-authorization`, `/api/routing/trade-authorization`, recruiter-routing aliases | Present in `dev` | Present | Preserve | Keep route authorization logs and behavior intact. |
| `/api/wm-auth-*`, `/api/wm-profile`, quest, social, Telegram, Discord, community, admin console, review, and social-check endpoints | Present in `dev` with concrete handlers | Mostly present | Preserve | Keep `dev` handlers. |
| `/api/wm-x-oauth-start`, `/api/wm-x-oauth-callback`, `/api/social-x-callback`, `/api/wm-quiz-get`, `/api/wm-quiz-submit`, `/api/wm-referral-track`, `/api/wm-admin-badge-award`, `/api/wm-admin-notifications-list`, `/api/wm-admin-recruiter-review`, `/api/wm-admin-user-action`, `/api/wm-admin-quest-upsert`, `/api/wm-admin-leaderboard-snapshot`, `/api/wm-admin-prizes`, `/api/wm-daily-rollover` | Present in `dev` as concrete handlers | Changed to `warMissionsProxy` in `devpostgrad` | Conflict: preserve `dev` | Do not accept the proxy substitution without a reviewed migration. These are the highest-risk API regressions in the merge. |
| `/api/internal/rewards/publications`, `/api/internal/rewards/ops/*`, `/api/internal/rewards/airdrops/*` | Present in `dev` | Present | Preserve | Keep internal reward ops behavior and token requirements intact. |

## UI/Routing Acceptance Targets

- `/arena` remains the overview hub.
- `/arena/battles`, `/arena/leagues`, and `/arena/events` must route visibly.
- `/war-room` must be available as the trader workflow.
- `/token/:campaignAddress` is the canonical token deep link.
- No public Arena token-detail route should remain without redirect coverage.

## Active Stop Conditions

- Stop before merging `frontend/api/server.mjs` if any concrete `dev` War Missions handler would be replaced by `warMissionsProxy`.
- Stop before enabling creator claims until creator-fee accounting reconciles with contract events.
- Stop before exposing War Pools until escrow, payout, and compliance rules are approved.
- Stop before deleting visible routes until replacement route mapping and redirect tests exist.
- Stop before adding new financial/reward tables without audit fields, statuses, timestamps, idempotency keys where retries are possible, and actor attribution.

## Next Implementation Order

1. Merge `devpostgrad` into `integration/postgrad-merge` while manually preserving all `dev` War Missions and reward/routing endpoints.
2. Add the postgrad Arena, sponsorship, and War Room API modules behind readiness flags.
3. Run route/API compatibility checks against frontend consumers.
4. Add DB migrations for battle lifecycle, creator-fee accounting, sponsorship lifecycle, events/tournaments, and war pools before enabling production-facing features.
5. Reconcile contract ABIs and addresses, then remove flags only after QA gates pass.
