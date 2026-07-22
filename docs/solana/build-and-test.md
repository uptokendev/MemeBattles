# Solana Build And Test Lane

Status date: 2026-07-23

## Decision

The Solana program build should use a pinned Linux container as the source of truth. Local WSL builds are useful for editing, but they should not block progress while the Anchor/Solana/Cargo toolchain ecosystem is moving underneath us.

The repository now includes `.github/workflows/solana-anchor-ci.yml`, which runs `anchor build` inside a pinned Anchor container:

```text
solanafoundation/anchor:v0.30.1
```

This keeps Solana build checks isolated from BNB/Topaz work and avoids asking developers to resolve live crates.io edition-2024 compatibility issues by hand.

## What To Run Locally

For normal development, use WSL/Ubuntu for editing and basic graph inspection only:

```bash
git checkout agent/solana-phase0-source-of-truth
git pull
cargo tree -p memewarzone_solana
```

Treat `anchor build` in local WSL as optional until the CI container is green.

## CI Source Of Truth

Open or update the PR and let the workflow run. The workflow is scoped to Solana files only:

- `Anchor.toml`
- root `Cargo.toml` / `Cargo.lock`
- `programs/memewarzone_solana/**`
- the Solana Anchor CI workflow itself

If CI fails, fix the repository/toolchain definition in the PR. Do not keep pinning dependencies one by one in a local terminal loop.

## After First Green Build

Once the containerized build is green:

1. Commit the generated root `Cargo.lock` if the workflow or local container build produces one.
2. Commit generated IDL artifacts only after the real program build succeeds.
3. Add Phase 1 tests for:
   - `initialize_global_config`
   - zero-address authority rejection
   - admin/pauser pause updates
   - unauthorized pause rejection
   - `lock_security_defaults`
   - double-lock rejection
4. Keep Solana create, buy, sell, graduation, and claims protocol_pending until Phase 15 devnet acceptance is documented.

## Why This Changed

Local WSL reached repeated failures where old Solana SBF Cargo tooling tried to parse newly published crates using Rust edition 2024. That is a tooling-resolution problem, not a product implementation problem. The durable response is a pinned container build lane, not manual crate babysitting.
