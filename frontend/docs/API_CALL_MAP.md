# DEV-FIX-API Frontend Call Map

This is the Phase 1 inventory of important frontend API clients and the backend routes they expect.

## Main API clients

| Frontend file | Function area | Routes called | Phase 1 status |
|---|---|---|---:|
| `src/lib/recruiterApi.ts` | Referral capture | `/api/recruiters/:code/referral/capture` | stub |
| `src/lib/recruiterApi.ts` | Wallet attribution | `/api/attribution/wallet-connect`, `/api/attribution/wallet/:wallet` | stub |
| `src/lib/recruiterApi.ts` | Route authorization | `/api/recruiter-routing/create-authorization`, `/api/recruiter-routing/trade-authorization` | alias stubs returning 503 |
| `src/lib/recruiterApi.ts` | Recruiter views | `/api/recruiters`, `/api/recruiters/:code/summary`, `/api/recruiters/wallet/:wallet/summary`, `/api/recruiters/:code/replacements` | stubs |
| `src/lib/recruiterApi.ts` | Squad summary | `/api/squads/:code/summary` | stub 404 |
| `src/lib/recruiterApi.ts` | Wallet reward state | `/api/rewards/me`, `/api/rewards/me/history`, `/api/rewards/me/claims` | stubs |
| `src/lib/recruiterApi.ts` | Recruiter signup | `/api/recruiter-signup/*` | stubs |
| `src/lib/rewardProgramsApi.ts` | Eligibility | `/api/rewards/me/eligibility` | stub |
| `src/lib/rewardProgramsApi.ts` | Airdrop winners | `/api/airdrops/winners` | stub |
| `src/lib/rewardProgramsApi.ts` | Squad leaderboard/member scores | `/api/squads`, `/api/squads/members` | stubs |
| `src/lib/rewardProgramsApi.ts` | Internal reward ops | `/internal/rewards/*` | router stubs available after `/api` prefix strip; update frontend to `/api/internal/rewards/*` next |
| `src/lib/rewardsApi.ts` | Legacy league rewards | `/api/rewards`, `/api/league` | real existing handlers |
| `src/lib/profileApi.ts` | Profile load/save | `/api/profile`, `/api/auth/nonce` | real existing handlers |
| `src/lib/followApi.ts` | Follow system | `/api/follows/*` | real existing handlers |
| `src/lib/leagueCabinetApi.ts` | Profile cabinet | `/api/profileCabinet` | real existing handler |
| `src/pages/Create.tsx` | Logo upload | `/api/upload` | real existing handler |
| `src/pages/Status.tsx` | Private status | `/api/status` | real existing handler |

## Important behavior notes

- Phase 1 stubs are meant to remove unknown-route 404s and stabilize UI rendering.
- Phase 1 stubs are not final business logic.
- Route authorization stubs intentionally return `503`, not fake signatures, because fake signatures would cause misleading transaction failures.
- Legacy `/api/rewards` currently means League rewards only. New unified reward surfaces use `/api/rewards/me*`.
- Recruiter, airdrop, and squad surfaces should be accessed primarily inside the Profile page, not top-level navigation.

## Cleanup candidates after real route implementation

| Candidate | Current concern | Action later |
|---|---|---|
| `/api/rewards` | Name is too broad for legacy League rewards | Rename/refactor to `/api/rewards/league` with compatibility alias |
| `/api/featured` | Need to confirm active caller | Keep until import/call scan confirms unused |
| `/api/shareCard` | Need to confirm active caller | Keep until import/call scan confirms unused |
| `/api/epochPools`, `/api/leaguePayouts`, `/api/leagueRoot` | Legacy League support | Keep until League page and claim flow are fully reviewed |
| `/internal/rewards/*` frontend paths | Inconsistent namespace | Update frontend to `/api/internal/rewards/*` |
