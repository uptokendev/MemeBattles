# Solana Phase 3 Security PDAs

Status date: 2026-07-23
Branch: agent/solana-phase0-source-of-truth

## What This Slice Adds

This slice starts Phase 3 creator, wallet, and cluster security in the Anchor program without touching BNB/Topaz files.

Updated files:

| Path | Purpose |
| --- | --- |
| `Cargo.toml` | Enables Anchor `init-if-needed` so backend/admin sync jobs can create or refresh profile PDAs idempotently. |
| `programs/memewarzone_solana/src/lib.rs` | Adds CreatorProfile, RiskProfile, and ClusterProfile PDAs plus sync instructions, events, validation helpers, and invariant tests. |

## Implemented Phase 3 Requirements

| Requirement | Status | Notes |
| --- | --- | --- |
| CreatorProfile PDA | Started | Stores wallet, tier, trust score, live bonding count, launch counters, restriction/manual-review flags, creator buy cap, and derived tier limits. |
| RiskProfile PDA | Started | Stores wallet risk level, restricted flag, cluster ID, and manual-review flag. |
| ClusterProfile PDA | Started | Stores cluster ID, size, risk level, and restricted flag. |
| Tier limits | Started | Program derives plan limits for Tier 1, 2, and 3: live count caps 3/5/10, 24h cooldown, and creator buy lock 24h/6h/1h. |
| Admin authority split | Started | Creator profile sync requires admin or tier admin. Risk and cluster sync require admin or risk admin. |
| Validation tests | Started | Tests cover tier limits, invalid tiers, live-count limit rejection, creator buy cap rejection, risk-level rejection, empty cluster rejection, zero-size cluster rejection, and restricted/manual-review states. |

## Still Pending In Phase 3

- Backend APIs/jobs to sync creator, wallet risk, and cluster risk into these PDAs.
- Audit logs for Solana tier/risk changes outside the program.
- Create/buy/sell instruction enforcement of creator tier, cooldown, live bonding count, creator buy lock/cap, restricted wallets, restricted clusters, and manual-review states.
- Frontend read model and UX display for creator tier, launch eligibility, cooldown, live bonding count, creator buy lock/cap, restricted/manual-review state, and cluster/risk warnings.

## Gate Status

Phase 3 is not complete yet. These PDAs are foundational state and validation only. Solana create/trade/graduation remain protocol_pending until later phases wire the profile checks into authorized create, buy, sell, graduation, indexer, dashboard, and devnet acceptance.
