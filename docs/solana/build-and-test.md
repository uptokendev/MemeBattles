# Solana Build And Test Lane

Status date: 2026-07-23

## Decision

The Solana program build should use GitHub Actions with pinned Linux tool versions as the source of truth. Local WSL builds are useful for editing and graph inspection, but they should not block progress while the Anchor/Solana/Cargo toolchain ecosystem is moving underneath us.

The repository now includes `.github/workflows/solana-anchor-ci.yml`, which installs and runs these pinned tools on `ubuntu-latest`:

```text
Rust 1.79.0
Solana CLI 1.18.26
Anchor CLI 0.30.1
```

Solana is installed from the `solana-labs/solana` GitHub release tarball with retries. Anchor is installed from the `@coral-xyz/anchor-cli` npm package, which works on the GitHub Linux runner.

This keeps Solana build checks isolated from BNB/Topaz work and avoids asking developers to resolve live crates.io edition-2024 compatibility issues by hand.

## What To Run Locally

For normal development, use WSL/Ubuntu for editing and basic graph inspection:

```bash
git checkout agent/solana-phase0-source-of-truth
git pull
cargo tree -p memewarzone_solana
```

To mirror the CI build lane locally, run:

```bash
rm -f Cargo.lock programs/memewarzone_solana/Cargo.lock
anchor build --no-idl
cargo test -p memewarzone_solana --lib
```

Use `--no-idl` for this phase because Anchor 0.30.1 IDL generation is currently blocked by `proc-macro2::Span::source_file()` compatibility on the pinned Rust/Solana toolchain. Program compilation and Rust invariant tests remain the gate. Generate and commit IDL artifacts later as a separate task once the IDL toolchain is upgraded or pinned to a compatible nightly path.

## CI Source Of Truth

Open or update the PR and let the workflow run. The workflow is scoped to Solana files only:

- `Anchor.toml`
- root `Cargo.toml` / `Cargo.lock`
- `programs/memewarzone_solana/**`
- the Solana Anchor CI workflow itself

The workflow runs:

```bash
anchor build --no-idl
cargo test -p memewarzone_solana --lib
```

If CI fails, fix the repository/toolchain definition in the PR. Do not keep pinning dependencies one by one in a local terminal loop.

## After First Green Build

Once the build lane is green:

1. Commit the generated root `Cargo.lock` if the workflow or local build produces one and it is compatible with the pinned toolchain.
2. Add a dedicated IDL generation lane after choosing the compatible Anchor/nightly toolchain path.
3. Commit generated IDL artifacts only after the real program build succeeds and the IDL lane is stable.
4. Expand tests for:
   - `initialize_global_config`
   - zero-address authority rejection
   - admin/pauser pause updates
   - unauthorized pause rejection
   - `lock_security_defaults`
   - double-lock rejection
   - generation registry account initialization
5. Keep Solana create, buy, sell, graduation, and claims protocol_pending until Phase 15 devnet acceptance is documented.

## Why This Changed

Local WSL reached repeated failures where old Solana SBF Cargo tooling tried to parse newly published crates using Rust edition 2024. The first CI attempt also proved that `solanafoundation/anchor:v0.30.1` is not a valid Docker tag. A second attempt proved that the old `release.solana.com` installer script can fail before installing the `solana` binary. A later attempt proved that Anchor 0.30.1 IDL generation is not stable on this pinned Rust/Solana lane because its `anchor-syn` path expects `proc_macro2::Span::source_file()` behavior that no longer lines up cleanly.

The durable response for Phase 0 is a pinned GitHub Actions build lane that compiles the program with `anchor build --no-idl`, runs the Rust invariant tests, and leaves IDL generation as a deliberate follow-up instead of blocking program compilation on an IDL tooling mismatch.
