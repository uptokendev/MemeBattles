# Solana Build, IDL and Test Lane

Status date: 2026-07-28
Workflow: `.github/workflows/solana-anchor-ci.yml`

## Decision

GitHub Actions is the source of truth for the Solana program build. Local WSL builds remain useful for development, but toolchain differences on a developer machine must not redefine the accepted program or IDL.

The lane is isolated to Solana program, manifest and documentation paths so BNB/Topaz work remains independently testable.

## Pinned toolchains

```text
Anchor CLI:        0.30.1
Solana CLI:        1.18.26
SBF/test Rust:     1.79.0
IDL Rust nightly:  nightly-2024-05-09
Node.js:           24
Runner:             ubuntu-latest
```

Anchor 0.30.1 supports an explicit `RUSTUP_TOOLCHAIN` override for IDL generation. The workflow therefore separates the stable SBF build from the nightly IDL build instead of forcing one Rust toolchain to perform both jobs.

## Workflow gates

The workflow runs these stages:

```bash
rm -f Cargo.lock programs/memewarzone_solana/Cargo.lock
anchor build --no-idl
RUSTUP_TOOLCHAIN=nightly-2024-05-09 anchor idl build
test -s target/deploy/memewarzone_solana.so
test -s target/idl/memewarzone_solana.json
cargo test -p memewarzone_solana --lib
```

A successful run uploads a 14-day artifact containing:

```text
target/deploy/memewarzone_solana.so
target/idl/memewarzone_solana.json
```

The uploaded artifact is build evidence only. It is not permission to deploy and is not a substitute for the versioned deployment manifest, key ceremony, authority verification, devnet acceptance or audit gates.

## Why the SBF and IDL builds are separate

The Solana 1.18 SBF toolchain and Anchor 0.30.1 CLI are intentionally pinned for program compatibility. Anchor 0.30.1 IDL generation uses a nightly compiler path and supports pinning that nightly explicitly. Separating the commands provides reproducible behavior without upgrading the program dependency stack mid-implementation.

## Local mirror

Inside WSL/Ubuntu, use the same versions and commands:

```bash
rustup toolchain install 1.79.0 --profile minimal
rustup toolchain install nightly-2024-05-09 --profile minimal
rustup default 1.79.0

rm -f Cargo.lock programs/memewarzone_solana/Cargo.lock
anchor build --no-idl
RUSTUP_TOOLCHAIN=nightly-2024-05-09 anchor idl build
cargo test -p memewarzone_solana --lib
```

The CI result remains authoritative when local dependency caches or host tooling disagree.

## Formatting gate

The first attempt to add `cargo fmt --check` exposed formatting drift in the imported historical Rust foundation before the workflow reached IDL generation. That does not invalidate the compiled authorization logic, but formatting should be normalized in a dedicated source-only change before making `cargo fmt --check` a required gate.

Do not hide formatting drift by auto-formatting only in the build runner. The committed source must eventually be formatted and then checked without mutation.

## Failure handling

When the lane fails:

1. Identify the first failed stage.
2. Keep stable SBF failures separate from nightly IDL failures.
3. Do not weaken authorization, economics or account constraints to satisfy tooling.
4. Do not update dependencies one by one without an explicit compatibility decision.
5. Preserve the last green program build while testing an IDL-toolchain change.

## Readiness boundary

A green workflow proves only that:

- the current program compiles under the pinned SBF lane;
- an IDL can be generated under the pinned IDL lane;
- expected program and IDL files exist;
- Rust invariant tests pass;
- the artifact can be retained for review.

Solana create, buy, sell, graduation and claims remain `protocol_pending` until all implementation and acceptance gates in the source-of-truth document are closed.
