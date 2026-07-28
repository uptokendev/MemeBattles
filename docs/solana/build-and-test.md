# Solana Build, IDL And Test Lane

Status date: 2026-07-28
Workflow: `.github/workflows/solana-anchor-ci.yml`

## Decision

GitHub Actions is the source of truth for the Solana program build. Local WSL builds remain useful for development, but toolchain differences on a developer machine must not redefine the accepted program or IDL.

The lane is path-filtered to the Anchor workspace, Solana program crate and workflow. BNB/Topaz implementation remains independently testable and is not rebuilt because a Solana-only document changes.

## Pinned toolchains

```text
Anchor CLI:        0.30.1
Anchor Lang/SPL:   0.30.1
Solana CLI:        1.18.26
SBF/test Rust:     1.79.0
IDL Rust nightly:  nightly-2024-05-09
proc-macro2:       1.0.86
Node.js:           24
Runner:             ubuntu-latest
```

Anchor 0.30.1 supports an explicit `RUSTUP_TOOLCHAIN` override for IDL generation. The workflow separates the stable SBF build from the nightly IDL build instead of forcing one Rust toolchain to perform both jobs. `proc-macro2` remains pinned to the API generation expected by Anchor 0.30 IDL generation.

## SPL Token dependency boundary

Phase 6 uses the classic SPL Token program at runtime for the campaign mint and token vault.

The Anchor 0.30 account-constraint derive path also expands through Token-2022 interface and extension modules at compile time. The workspace therefore enables these Anchor SPL crate features:

```text
token
token_2022
token_2022_extensions
```

That compile-time compatibility does not make Token-2022 an accepted runtime account. The program account type is `Program<Token>`, the V3 authorization binds the canonical classic SPL Token program ID, and alternate token-program accounts fail before asset initialization.

## Workflow gates

The workflow runs these stages:

```bash
rm -f Cargo.lock programs/memewarzone_solana/Cargo.lock
anchor build --no-idl

cd programs/memewarzone_solana
mkdir -p ../../target/idl
RUSTUP_TOOLCHAIN=nightly-2024-05-09 anchor idl build \
  --out ../../target/idl/memewarzone_solana.json
cd ../..

test -s target/deploy/memewarzone_solana.so
test -s target/idl/memewarzone_solana.json
cargo test -p memewarzone_solana --lib
```

`anchor idl build` must run from the program crate. In Anchor 0.30.1 the command writes the JSON IDL to stdout when `--out` is omitted, so the workflow always specifies the exact workspace-level artifact path.

A successful run uploads a 14-day artifact containing:

```text
target/deploy/memewarzone_solana.so
target/idl/memewarzone_solana.json
```

The uploaded artifact is build evidence only. It is not permission to deploy and is not a substitute for the versioned deployment manifest, key ceremony, authority verification, local-validator account tests, devnet acceptance or audit gates.

## Phase 6 invariant coverage

The Rust suite now covers the source-level invariants for:

- V3 authorization domain and schema;
- deterministic Campaign, mint, token-vault and SOL-vault PDAs;
- binding every asset address and the canonical token program into the signed payload;
- complete-supply curve/liquidity/reserve accounting;
- integer rounding dust remaining in reserve;
- devnet-only 6 USD target policy;
- generation economics/profile mutation invalidating authorization;
- timer, ticker, reservation, risk and replay rules.

CPI behavior and resulting account state still require local-validator and devnet transaction tests. Unit tests and generated IDL do not prove mint-authority revocation on a live runtime.

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

cd programs/memewarzone_solana
mkdir -p ../../target/idl
RUSTUP_TOOLCHAIN=nightly-2024-05-09 anchor idl build \
  --out ../../target/idl/memewarzone_solana.json
cd ../..

cargo test -p memewarzone_solana --lib
```

The CI result remains authoritative when local dependency caches or host tooling disagree.

## Formatting gate

The Phase 6 authorization source was normalized with `cargo fmt`. Older imported Rust foundation formatting still needs a dedicated source-only normalization before `cargo fmt --check` becomes a required repository-wide gate.

Do not hide formatting drift by auto-formatting only in the build runner. The committed source must eventually be formatted and then checked without mutation.

## Failure handling

When the lane fails:

1. Identify the first failed stage.
2. Keep stable SBF failures separate from nightly IDL failures.
3. Do not weaken authorization, economics or account constraints to satisfy tooling.
4. Treat an IDL test compile failure as source/test failure, not permission to bypass IDL generation.
5. Do not update dependencies one by one without an explicit compatibility decision.
6. Preserve the last green program build while testing a toolchain or IDL change.

## Readiness boundary

A green workflow proves only that:

- the current program compiles under the pinned SBF lane;
- an IDL can be generated under the pinned IDL lane;
- expected program and IDL files exist;
- Rust source-level invariant tests pass;
- the artifact can be retained for review.

Solana create, buy, sell, graduation and claims remain `protocol_pending` until all implementation and acceptance gates in the source-of-truth document are closed.
