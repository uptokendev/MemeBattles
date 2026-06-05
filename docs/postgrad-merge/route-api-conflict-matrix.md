# MemeBattles Postgrad Route/API Conflict Matrix

Generated for the Phase 0 preservation gate before merging `devpostgrad` into the protected `dev` API backbone.

## Current Branch Snapshot

| Branch | Current state | Role | Merge note |
| --- | --- | --- | --- |
| `dev` | `58d7c491b76914c60951e325d2ab9685d30383a3`; Railway/API deploy green | Protected operational API backbone connected to Railway. | Source of truth for API handlers. API-only work lands here. |
| `devpostgrad` | Diverged from `dev`; 458 commits ahead and 114 behind at latest comparison | Product/UI expansion branch. | Frontend/product work lands here. Local API server is a gateway/proxy, not the live API implementation. |
| `integration/postgrad-merge` | Exists, but is 23 commits behind `dev` and 10 commits ahead | Safe reconciliation branch. | Must be rebased/updated from current `dev` before any final merge work; do not force-move without reviewing its 10 ahead commits. |

## API Preservation Rules Applied

- Preserve every working `dev` endpoint unless a reviewed migration says otherwise.
- Extend existing endpoints instead of creating duplicate competing API versions.
- Keep reward, recruiter, squad, airdrop, prepare-mode, routing authorization, and War Missions behavior DB-backed and intact.
- Gate settlement-sensitive, contract-blocked, and schema-dependent additions behind feature flags until contracts, migrations, and QA are complete.
- Do not expose fake reward, payout, settlement, sponsorship, or battle data in production mode.
- Keep `devpostgrad` from importing concrete API modules directly. It should use the Railway-backed `dev` API through proxy/client wrappers.

## Runtime Server Decision

| File | `dev` decision | `devpostgrad` decision | Merge instruction |
| --- | --- | --- | --- |
| `frontend/api/server.mjs` | Full API server with all operational routes plus gated postgrad route group. | Local dev API gateway/proxy only. | Preserve the `dev` server during integration. Do not let the gateway replace live API handlers. |
| `frontend/server/railwayProxy.js` | Existing proxy middleware remains available. | Used so local devpostgrad can talk to Railway/dev API. | Keep proxy support, but live API route ownership stays on `dev`. |
| Postgrad API modules | Added on `dev` as DB-first handlers behind flags. | Older/larger modules may still exist in tree, but are not the runtime source of truth. | Prefer current `dev` DB-first gated modules unless explicitly replacing with reviewed migrations. |

## Endpoint Matrix

| Endpoint group | `dev` status | `devpostgrad` status | Classification | Merge decision |
| --- | --- | --- | --- | --- |
| Core campaign/comment/chat/diagnostics/status/upload/vote/profile routes | Present as operational handlers | Accessed through gateway/proxy for local product work | Preserve | Keep `dev` behavior unless a compatible extension is reviewed. |
| `/api/arena/ops/health` | Present on `dev` behind `POSTGRAD_ARENA_OPS_ENABLED` | Frontend should call API client/proxy | Extend, gated | Enable only after matching DB tables are checked. |
| `/api/arena/battles`, `/api/arena/battles/open`, `/api/arena/battles/creator-status`, `/api/arena/battles/:battleId`, `/api/arena/battles/:battleId/transition` | Present on `dev` behind `POSTGRAD_BATTLES_ENABLED`; DB-first, no production memory fallback | Frontend consumers exist | Extend, gated | Keep disabled until persistent battle lifecycle tables and QA are ready. |
| `/api/arena/events`, `/api/arena/events/:eventId`, `/api/arena/events/:eventId/transition`, `/api/arena/events/:eventId/advance-bracket` | Present on `dev` behind `POSTGRAD_EVENTS_ENABLED`; DB-first | Frontend consumers exist | Extend, gated | Keep disabled until lifecycle/tournament rules and schema are ready. |
| `/api/arena/league`, `/api/arena/league/advance-week`, `/api/arena/league/rebalance-divisions`, `/api/arena/league/cycle-season-state` | Present on `dev` behind `POSTGRAD_LEAGUE_ENABLED`; legacy `/api/league`, `/api/leagueRoot`, `/api/leaguePayouts` preserved | Frontend consumers exist | Extend with compatibility checks | Preserve legacy league endpoints; Arena league payouts remain gated. |
| `/api/arena/war-pools`, `/api/arena/war-pools/:battleId`, `/api/arena/war-pools/:battleId/support`, `/api/arena/war-pools/:battleId/transition` | Present on `dev` behind `POSTGRAD_WAR_POOLS_ENABLED`; DB-first | Frontend consumers exist | Extend, gated | Do not expose until escrow, payout, and compliance rules are approved. |
| `/api/sponsored` | Present on `dev` behind `POSTGRAD_SPONSORSHIPS_ENABLED`; active DB placements plus env fallback only | Frontend consumers exist | Extend, gated | Keep disabled until sponsorship lifecycle tables and approval/payment workflow are ready. |
| `/api/sponsorship-applications` | Present on `dev` behind `POSTGRAD_SPONSORSHIPS_ENABLED`; DB-backed intake | Frontend page exists | Extend, gated | Enable only with reviewed admin/payment handling. |
| `/api/war-room` | Present on `dev` behind `POSTGRAD_WAR_ROOM_ENABLED`; campaign/trade-context DB reads | Frontend page exists | Extend, gated | Enable after stable campaign data and wallet states are verified. |
| `/api/rewards/me`, `/api/rewards/me/history`, `/api/rewards/me/claims`, `/api/rewards/me/eligibility`, `/api/rewards` | Present in `dev` through existing handlers/stubs | Product work may consume these | Preserve/extend | Keep current reward surfaces; creator-fee buckets must be additive and reconcilable. |
| `/api/airdrops/winners`, `/api/squads`, recruiter, attribution, and routing authorization routes | Present in `dev` | Product work may consume these | Preserve | Do not replace attribution/recruiter/squad/routing behavior. |
| War Missions routes (`/api/wm-*`, `/api/social-x-callback`) | Present in `dev` as concrete handlers | Gateway/proxy on `devpostgrad`; older missing-import failures should not return | Preserve | Highest-risk merge area. Keep `dev` concrete handlers and do not accept gateway-only replacement in final API server. |
| `/api/internal/rewards/*` | Present in `dev` | Product work may consume these | Preserve | Keep internal reward ops behavior and token requirements intact. |

## UI/Routing Acceptance Targets

- `/arena` remains the overview hub.
- `/arena/battles`, `/arena/leagues`, and `/arena/events` route visibly.
- `/war-room` is the trader workflow.
- `/token/:campaignAddress` is the canonical token deep link.
- No public Arena token-detail route remains without redirect coverage.

## Active Stop Conditions

- Stop before merging `frontend/api/server.mjs` if any concrete `dev` API handler would be replaced by the `devpostgrad` gateway.
- Stop before enabling creator claims until creator-fee accounting reconciles with contract events.
- Stop before exposing War Pools until escrow, payout, and compliance rules are approved.
- Stop before deleting visible routes until replacement route mapping and redirect tests exist.
- Stop before adding new financial/reward tables without audit fields, statuses, timestamps, idempotency keys where retries are possible, and actor attribution.

## Next Implementation Order

1. Review the 10 commits currently ahead on `integration/postgrad-merge`, then update that branch from current `dev` without losing useful integration work.
2. Merge `devpostgrad` into the refreshed integration branch while manually preserving the `dev` API server and concrete War Missions/reward/routing handlers.
3. Run route/API compatibility checks against frontend consumers.
4. Add or verify DB migrations for battle lifecycle, creator-fee accounting, sponsorship lifecycle, events/tournaments, and war pools before enabling production-facing feature flags.
5. Reconcile contract ABIs and addresses, then remove flags only after backend, contract, and QA gates pass.
