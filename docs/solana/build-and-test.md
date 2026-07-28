# Solana Build, IDL And Test Lanes

Status date: 2026-07-28
Build workflow: `.github/workflows/solana-anchor-ci.yml`
Validator workflow: `.github/workflows/solana-local-validator-ci.yml`

## Decision

GitHub Actions is the source of truth for the Solana program build, generated IDL and local-validator acceptance. Local WSL builds remain useful for development, but toolchain differences on a developer machine must not redefine the accepted program, IDL or transaction evidence.

Both workflows are path-filtered to the Anchor workspace, Solana program, Solana tests and their own workflow files. BNB/Topaz implementation remains independently testable.

## Pinned toolchains

```text
Anchor CLI:        0.30.1
Anchor Lang/SPL:   0.30.1
Solana CLI:        1.18.26
SBF/test Rust:     1.79.0
IDL Rust nightly:  nightly-2024-05-09
proc-macro2:       1.0.86
Build Node.js:     24
Validator Node.js: 22
Runner:             ubuntu-latest
```

Anchor 0.30.1 supports an explicit `RUSTUP_TOOLCHAIN` override for IDL generation. The workflows separate the stable SBF build from the nightly IDL build instead of forcing one Rust toolchain to perform both jobs. `proc-macro2` remains pinned to the API generation expected by Anchor 0.30 IDL generation.

## SPL Token dependency boundary

Phase 6 uses the classic SPL Token program at runtime for the campaign mint and token vault.

The Anchor 0.30 account-constraint derive path also expands through Token-2022 interface and extension modules at compile time. The workspace therefore enables these Anchor SPL crate features:

```text
token
token_2022
token_2022_extensions
```

That compile-time compatibility does not make Token-2022 an accepted runtime account. The program account type is `Program<Token>`, the V4 authorization binds the canonical classic SPL Token program ID, and alternate token-program accounts fail before asset initialization.

## Anchor build and IDL gates

The permanent build workflow runs:

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

The build artifact is not permission to deploy and is not a substitute for the versioned deployment manifest, key ceremony, authority verification, devnet acceptance or audit gates.

## Rust invariant coverage

The Rust suite covers source-level invariants for:

- V4 authorization domain and schema;
- SHA-256 digest verification over the complete canonical payload;
- deterministic Campaign, mint, token-vault and SOL-vault PDAs;
- binding every asset address and the canonical token program into the signed payload;
- complete-supply curve/liquidity/reserve accounting;
- integer rounding dust remaining in reserve;
- devnet-only 6 USD target policy;
- generation economics/profile mutation invalidating authorization;
- timer, ticker, reservation, risk and replay rules.

## Local-validator acceptance lane

The validator workflow:

1. creates ephemeral creator/deployer and program identities;
2. synchronizes the Anchor program ID;
3. builds the SBF program and generated IDL;
4. starts `solana-test-validator`;
5. funds the deployer and deploys the program locally;
6. initializes GlobalConfig, GenerationConfig, creator and risk state;
7. installs the Node acceptance harness;
8. executes real V4 Ed25519-plus-create transactions;
9. inspects the resulting mint, token vault, SOL vault, Campaign and replay accounts;
10. runs positive and negative authorization scenarios;
11. uploads validator diagnostics for 14 days.

The permanent workflow uses read-only repository permissions.

## Accepted local-validator evidence

Solana Local Validator Acceptance #26 passed on 2026-07-28.

```text
Accepted branch head: be5d696ead6dc5070f26175710abda858c7aed10
PR merge-test SHA:    ff7ed2d8b3ab83af7dc60ef272d289b016273734
Workflow run ID:      30384574030
Artifact:             memewarzone-solana-validator-ff7ed2d8b3ab83af7dc60ef272d289b016273734
Artifact SHA-256:     a7e81eb39f088e8b42517d3ff9b3667e06113b24b79a94b8ae15ac79e009b94e
Artifact expiry:      2026-08-11T17:53:46Z
```

The accepted run proved:

- Direct Create;
- Draft Deploy Now;
- Countdown Create;
- transaction-size enforcement at or below 1,232 bytes;
- exact mint supply and decimals;
- no freeze authority;
- permanent mint-authority revocation;
- complete supply in a Campaign-PDA-controlled token vault;
- MemeWarzone-program ownership of the SOL vault;
- unchanged `net_raised_lamports` after unsolicited SOL transfer;
- wrong signer, modified payload, expired authorization, reordered instruction, alternate mint, noncanonical token program and replay rejection.

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

The authorization and validator changes are normalized with `cargo fmt`. Older imported Rust foundation formatting still needs a dedicated source-only normalization before `cargo fmt --check` becomes a required repository-wide gate.

Do not hide formatting drift by auto-formatting only in the build runner. The committed source must eventually be formatted and then checked without mutation.

## Failure handling

When either lane fails:

1. Identify the first failed stage.
2. Keep stable SBF failures separate from nightly IDL failures.
3. Keep program/runtime failures separate from test-fixture confirmation races.
4. Do not weaken authorization, economics or account constraints to satisfy tooling.
5. Treat an IDL test compile failure as source/test failure, not permission to bypass IDL generation.
6. Do not update dependencies one by one without an explicit compatibility decision.
7. Preserve the last green program and validator evidence while testing a change.

## Readiness boundary

The accepted lanes prove only that:

- the current program compiles under the pinned SBF lane;
- an IDL can be generated under the pinned IDL lane;
- expected program and IDL files exist;
- Rust source-level invariant tests pass;
- the V4 create flows and negative authorization matrix pass on a local validator;
- the resulting campaign assets and authorities match the source-of-truth rules.

They do not prove devnet deployment, bonding buy/sell, dynamic graduation, DEX integration, permanent lock, treasury routing, claims, indexer readiness or mainnet safety.

Solana remains `protocol_pending` until all implementation and acceptance gates in the source-of-truth document are closed.
