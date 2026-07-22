# Solana Phase 1 Anchor Foundation

Status date: 2026-07-22
Branch: agent/solana-phase0-source-of-truth

## What This Slice Adds

This slice starts the real Solana program track without touching BNB/Topaz implementation files.

Added files:

| Path | Purpose |
| --- | --- |
| `Anchor.toml` | Anchor workspace entry with localnet/devnet placeholder program ID. |
| `programs/memewarzone_solana/Cargo.toml` | Anchor program package definition. |
| `programs/memewarzone_solana/src/lib.rs` | Initial program foundation with GlobalConfig PDA, authorities, pause flags, and lock_security_defaults. |

## Implemented Phase 1 Requirements

| Requirement | Status | Notes |
| --- | --- | --- |
| Create Anchor workspace | Started | Workspace and program package are present. |
| Add GlobalConfig PDA | Started | `global_config` PDA uses the `global` seed. |
| Add authorities | Started | admin, pauser, tier admin, risk admin, route signer, reward operator, treasury operator, generation operator are stored in GlobalConfig. |
| Add pause flags | Started | global, create, buy, sell, graduation, and claims pause flags are stored and updateable by admin or pauser. |
| Add lock_security_defaults | Started | Admin-only instruction permanently sets route authorization and authorized trading to true and marks defaults locked. |
| Security defaults cannot weaken after lock | Partially started | The lock instruction is one-way. Future config mutation instructions must also check `security_defaults_locked`. |

## Deliberate Defaults

Initial GlobalConfig defaults are conservative:

- `create_paused = true`
- `buy_paused = true`
- `sell_paused = true`
- `graduation_paused = true`
- `claims_paused = true`
- `route_authorization_required = true`
- `authorized_trading_required = true`
- `security_defaults_locked = false` until explicitly locked by admin

This keeps Solana non-launchable until later phases implement and prove create, trade, graduation, rewards, indexer, dashboard, and devnet acceptance.

## Remaining Phase 1 Gates

- Anchor build must run in an environment with Anchor/Solana tooling installed.
- Generated IDL must be committed after a real build.
- Local validator deploy must pass.
- Authority and pause tests must be added and pass.
- The placeholder program ID in `Anchor.toml` and `declare_id!` must be replaced before devnet deployment.

This file should stay paired with `docs/solana/phase-0-source-of-truth.md` until Phase 1 gates are complete.
