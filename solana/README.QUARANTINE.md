# QUARANTINE — legacy Solana launchpad scaffold

**Do not use this workspace as the product launchpad.**

| Path | Role |
| --- | --- |
| `solana/programs/meme_warzone_launchpad/` | **Legacy** create/buy/sell scaffold |
| Product V4 program | `programs/memewarzone_solana/` (repo root) |

Parity build plan: `docs/solana/bnb-parity-build-plan.md`.

Frontend product path must use V4 authorize + IDL create only (`solanaCreateAuthorizationV4`, `solanaV4CreateSubmit`). The FE file `solanaLaunchpadAdapter.ts` is quarantined for mutations (throws).
