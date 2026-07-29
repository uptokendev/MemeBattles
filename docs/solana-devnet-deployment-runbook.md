# MemeWarzone Solana Devnet Deployment Runbook

Status: operator-controlled deployment preparation
Target branch: `devpostgrad`
Network: Solana devnet

## Purpose

This runbook converts the accepted local-validator program into a controlled devnet deployment without putting deployer or upgrade-authority secrets in the repository, frontend, Netlify or ordinary GitHub Actions logs.

The deployment is not considered complete until the program binary, IDL, program address, deployment transaction, slot, ProgramData account, upgrade authority and initialized protocol accounts have been recorded and independently verified.

## What GitHub Actions should do

GitHub Actions remains the source of truth for:

1. pinned Anchor/Solana/Rust builds;
2. generated IDL and V4 client binding;
3. local-validator acceptance;
4. static devnet readiness checks;
5. deployment-artifact hashing and manifest validation.

GitHub Actions must not generate or commit the permanent program keypair. The first devnet deployment should be performed from the operator's WSL environment with a dedicated funded devnet deployer and the permanent program keypair stored outside the repository.

## Manual prerequisites

Inside WSL/Ubuntu, install and use:

- Anchor CLI `0.30.1`;
- Solana CLI `1.18.26`;
- Rust `1.79.0` for SBF builds;
- Rust `nightly-2024-05-09` for IDL generation.

Use a dedicated devnet deployer wallet. Do not reuse a browser wallet, treasury wallet, Owners Safe signer or production mainnet authority.

## Step 1 — create the permanent devnet program identity

Run this outside the repository or in a protected local secrets directory:

```bash
mkdir -p "$HOME/.config/memewarzone/solana-devnet"
solana-keygen new \
  --no-bip39-passphrase \
  --outfile "$HOME/.config/memewarzone/solana-devnet/memewarzone_solana-keypair.json"
solana-keygen pubkey "$HOME/.config/memewarzone/solana-devnet/memewarzone_solana-keypair.json"
```

Record the public key. Never commit the JSON keypair.

Copy the keypair into `target/deploy/memewarzone_solana-keypair.json` only for the duration of the local build/deploy session, then remove that working copy after the deployment evidence has been captured.

## Step 2 — synchronize the program ID

Replace the placeholder program ID in both locations:

- `programs/memewarzone_solana/src/lib.rs` in `declare_id!`;
- `Anchor.toml` under `[programs.devnet]`.

The localnet ID may remain ephemeral for validator CI. The devnet ID must equal the permanent devnet program keypair public key.

Run:

```bash
node scripts/solana/check-devnet-readiness.mjs
```

This must fail while the placeholder is active or the two program IDs disagree.

## Step 3 — build the authoritative artifacts

```bash
rustup default 1.79.0
rm -f Cargo.lock programs/memewarzone_solana/Cargo.lock
anchor build --no-idl
(
  cd programs/memewarzone_solana
  mkdir -p ../../target/idl
  RUSTUP_TOOLCHAIN=nightly-2024-05-09 anchor idl build \
    --out ../../target/idl/memewarzone_solana.json
)
node scripts/check-solana-v4-idl.mjs \
  target/idl/memewarzone_solana.json \
  target/idl/memewarzone_solana.v4.binding.json
cargo test -p memewarzone_solana --lib
```

Do not deploy artifacts from an uncommitted source tree. The deployment manifest must point to the exact source commit that produced the binary.

## Step 4 — prepare the pre-deployment manifest

```bash
node scripts/solana/prepare-devnet-deployment.mjs \
  --program-id <PROGRAM_ID> \
  --rpc-url https://api.devnet.solana.com \
  --commit <GIT_COMMIT_SHA>
```

The generated file is:

```text
deployments/solana-devnet.prepared.json
```

It records the program, IDL and V4 binding SHA-256 hashes. It deliberately leaves deployment and initialization evidence empty.

## Step 5 — fund the devnet deployer

```bash
solana config set \
  --url https://api.devnet.solana.com \
  --keypair "$HOME/.config/memewarzone/solana-devnet/deployer.json"
solana address
solana balance
```

Use the Solana devnet faucet or approved team funding process. Confirm the wallet contains enough devnet SOL for deployment and account initialization.

## Step 6 — deploy

```bash
export ANCHOR_WALLET="$HOME/.config/memewarzone/solana-devnet/deployer.json"
anchor deploy \
  --provider.cluster devnet \
  --provider.wallet "$ANCHOR_WALLET"
```

Capture the deployment signature from the output.

Then inspect the deployed program:

```bash
solana program show <PROGRAM_ID> --url https://api.devnet.solana.com
```

Record:

- program ID;
- ProgramData address;
- upgrade authority;
- last deployed slot;
- binary length;
- deployment transaction signature;
- source commit;
- artifact hashes;
- toolchain versions.

## Step 7 — initialize protocol state

The initialization sequence must remain:

1. `initializeGlobalConfig`;
2. `lockSecurityDefaults`;
3. `setPauseFlags`;
4. `initializeGenerationConfig`;
5. `syncClusterProfile`;
6. creator and wallet risk profiles only when required for acceptance accounts.

The initial safe pause posture is:

- global pause: off;
- create pause: off only during controlled acceptance;
- buy pause: on;
- sell pause: on;
- graduation pause: on;
- claims pause: on;
- route authorization required: on;
- authorized trading required: on;
- security defaults locked: true.

Do not enable bonding simply because create acceptance passes.

## Step 8 — configure Railway, disabled first

Set Railway with the verified devnet values, but keep issuance disabled until the on-chain account verification succeeds:

```text
SOLANA_CLUSTER=devnet
SOLANA_RPC_URL=<APPROVED_DEVNET_RPC>
SOLANA_PROGRAM_ID=<PROGRAM_ID>
SOLANA_ROUTE_SIGNER_PUBLIC_KEY=<ROUTE_SIGNER_PUBLIC_KEY>
SOLANA_ROUTE_SIGNER_SECRET=<RAILWAY_SECRET_ONLY>
SOLANA_CREATE_AUTH_ENABLED=false
SOLANA_CREATE_AUTH_SCHEMA_VERSION=4
SOLANA_IDL_SHA256=<IDL_HASH>
SOLANA_PROGRAM_SHA256=<PROGRAM_HASH>
SOLANA_GENERATION_MANIFEST_SHA256=<MANIFEST_HASH>
```

Never place the route signer secret in Netlify, Vite variables, frontend files, deployment manifests, GitHub variables or repository secrets used by pull-request workflows.

## Step 9 — required acceptance before enabling Railway

Verify on devnet:

1. the deployed program is executable and owned by the BPF upgradeable loader;
2. the ProgramData upgrade authority is the intended devnet authority;
3. GlobalConfig is owned by the deployed program;
4. route signer and operator authorities match the approved addresses;
5. security defaults are locked;
6. initial pause flags match the safe posture;
7. GenerationConfig is self-bound to the deployed program and its own PDA;
8. generation economics and manifest hash match the signed deployment evidence;
9. a controlled Draft Deploy Now transaction succeeds;
10. Countdown Create succeeds and remains non-tradable before `launch_at`;
11. Direct Create remains blocked until canonical reservation creation is implemented;
12. all negative V4 authorization cases still fail.

Only after this evidence is recorded may `SOLANA_CREATE_AUTH_ENABLED` be changed to `true`.

## Stop conditions

Stop immediately when:

- program IDs disagree;
- the placeholder program ID is present;
- the deployer or program keypair appears in git status;
- the built binary hash differs from the prepared manifest;
- the upgrade authority is unexpected;
- GlobalConfig or GenerationConfig is owned by another program;
- route signer configuration differs between chain and Railway;
- security defaults are unlocked;
- trading or graduation is unpaused before those instructions are implemented and accepted.

## Next dependency after devnet create acceptance

Once the deployment and initialization evidence is complete, recalculate the checklist. The likely next implementation is the wallet transaction builder plus devnet Draft Deploy Now and Countdown acceptance, because that validates the real backend-to-wallet-to-program boundary before bonding logic is added.
