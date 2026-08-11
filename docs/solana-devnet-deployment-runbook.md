# MemeWarzone Solana Devnet Deployment Runbook

Status: operator-controlled deployment preparation  
Target branch: `devpostgrad`  
Network: Solana devnet

## Purpose

This runbook converts the accepted local-validator program into a controlled devnet deployment without putting deployer, program, upgrade-authority or Railway route-signer secrets in the repository, frontend, Netlify or ordinary GitHub Actions logs.

The deployment is not complete until the program binary, IDL, program address, deployment transaction, slot, ProgramData account, upgrade authority, initialized protocol accounts and canonical generation manifest have been recorded and independently verified.

## Automation boundary

GitHub Actions remains the source of truth for:

1. pinned Anchor, Solana and Rust builds;
2. generated IDL and V4 client binding;
3. local-validator acceptance;
4. static devnet readiness checks;
5. canonical generation-manifest validation;
6. deployment-artifact hashing and manifest preparation;
7. syntax checks for the operator bootstrap and verifier.

GitHub Actions must not generate or commit the permanent program keypair, deployer keypair, upgrade authority or Railway route signer. The first devnet deployment and initialization are performed from the operator's WSL environment.

## Manual prerequisites

Inside WSL/Ubuntu, use:

- Anchor CLI `0.30.1`;
- Solana CLI `1.18.26`;
- Rust `1.79.0` for SBF builds;
- Rust `nightly-2024-05-09` for IDL generation;
- Node.js compatible with the accepted test package.

Use a dedicated devnet deployer. Do not reuse a browser wallet, treasury wallet, Owners Safe signer or production mainnet authority.

## Step 1 — create the permanent devnet program identity

Run outside the repository or in a protected local secrets directory:

```bash
mkdir -p "$HOME/.config/memewarzone/solana-devnet"
solana-keygen new \
  --no-bip39-passphrase \
  --outfile "$HOME/.config/memewarzone/solana-devnet/memewarzone_solana-keypair.json"
solana-keygen pubkey "$HOME/.config/memewarzone/solana-devnet/memewarzone_solana-keypair.json"
```

Record the public key. Never commit the JSON keypair.

Copy the keypair into `target/deploy/memewarzone_solana-keypair.json` only during the local build/deploy session, then remove the working copy after evidence has been captured.

## Step 2 — synchronize the public program ID

Replace the placeholder in both locations:

- `programs/memewarzone_solana/src/lib.rs` in `declare_id!`;
- `Anchor.toml` under `[programs.devnet]`.

Run:

```bash
node scripts/solana/check-devnet-readiness.mjs
```

This fails while the placeholder is active, when the IDs disagree, when the canonical devnet generation manifest is unsafe or when required operator tooling is missing.

## Step 3 — build authoritative artifacts

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
npm install --prefix tests/solana --no-audit --no-fund
npm --prefix tests/solana run devnet:check
```

Do not deploy artifacts from an uncommitted source tree. The deployment manifest must point to the exact source commit that produced the binary.

## Step 4 — prepare the deployment manifest

```bash
node scripts/solana/prepare-devnet-deployment.mjs \
  --program-id <PROGRAM_ID> \
  --rpc-url https://api.devnet.solana.com \
  --commit <GIT_COMMIT_SHA>
```

This creates:

```text
deployments/solana-devnet.prepared.json
```

It records SHA-256 values for:

- program binary;
- generated IDL;
- V4 binding;
- canonical generation manifest;
- program source;
- `Anchor.toml`.

Deployment and initialization evidence remains empty until it is proven on-chain.

## Step 5 — prepare dedicated identities

The following identities are distinct concepts even when one devnet operator temporarily controls several roles:

- deployer and initial admin;
- pauser;
- tier admin;
- risk admin;
- reward operator;
- treasury operator;
- generation operator;
- Railway route signer;
- upgrade authority.

Generate the Railway route signer outside the repository. Store its private bytes only in the approved Railway secret store. Record only its public key for initialization.

The route signer is permanently bound in GlobalConfig. The backend later derives its public key from `SOLANA_ROUTE_SIGNER_SECRET_KEY` and refuses authorization when it differs from `SOLANA_ROUTE_SIGNER_PUBLIC_KEY` or the on-chain GlobalConfig value.

## Step 6 — fund and configure the devnet deployer

```bash
solana config set \
  --url https://api.devnet.solana.com \
  --keypair "$HOME/.config/memewarzone/solana-devnet/deployer.json"
solana address
solana balance
```

Use the Solana devnet faucet or approved team funding process. Confirm enough devnet SOL exists for deployment and account initialization.

## Step 7 — deploy

```bash
export ANCHOR_WALLET="$HOME/.config/memewarzone/solana-devnet/deployer.json"
anchor deploy \
  --provider.cluster devnet \
  --provider.wallet "$ANCHOR_WALLET"
```

Capture the deployment signature, then inspect:

```bash
solana program show <PROGRAM_ID> --url https://api.devnet.solana.com
```

Record:

- program ID;
- ProgramData address;
- upgrade authority;
- last deployed slot;
- binary length;
- deployment signature;
- source commit;
- artifact hashes;
- toolchain versions.

## Step 8 — export initialization variables

At minimum:

```bash
export SOLANA_RPC_URL="https://api.devnet.solana.com"
export SOLANA_LAUNCHPAD_PROGRAM_ID="<PROGRAM_ID>"
export SOLANA_OPERATOR_KEYPAIR="$HOME/.config/memewarzone/solana-devnet/deployer.json"
export SOLANA_ROUTE_SIGNER_PUBLIC_KEY="<ROUTE_SIGNER_PUBLIC_KEY>"
```

Optional authority overrides default to the operator public key for the first controlled devnet acceptance:

```bash
export SOLANA_ADMIN_PUBLIC_KEY="<ADMIN_PUBLIC_KEY>"
export SOLANA_PAUSER_PUBLIC_KEY="<PAUSER_PUBLIC_KEY>"
export SOLANA_TIER_ADMIN_PUBLIC_KEY="<TIER_ADMIN_PUBLIC_KEY>"
export SOLANA_RISK_ADMIN_PUBLIC_KEY="<RISK_ADMIN_PUBLIC_KEY>"
export SOLANA_REWARD_OPERATOR_PUBLIC_KEY="<REWARD_OPERATOR_PUBLIC_KEY>"
export SOLANA_TREASURY_OPERATOR_PUBLIC_KEY="<TREASURY_OPERATOR_PUBLIC_KEY>"
export SOLANA_GENERATION_OPERATOR_PUBLIC_KEY="<GENERATION_OPERATOR_PUBLIC_KEY>"
```

The operator keypair must equal the initial admin for this bootstrap tool. It never accepts or reads the Railway route-signer secret.

## Step 9 — initialize protocol state idempotently

Run:

```bash
npm --prefix tests/solana run devnet:bootstrap
```

The command uses:

```text
config/solana/devnet-generation-v1.json
```

as the canonical source for generation economics, route profiles, DEX profile, oracle profile, risk-cluster seed and initial pause flags.

It performs only missing or mismatched bootstrap actions:

1. initialize GlobalConfig when absent;
2. lock security defaults when not yet locked;
3. apply the canonical safe pause flags;
4. initialize the canonical GenerationConfig when absent;
5. initialize or synchronize the acceptance ClusterProfile;
6. fetch all accounts again and verify every authority, hash, economic field, self-binding and pause flag.

It writes:

```text
deployments/solana-devnet.protocol-state.json
```

The initial safe posture is:

- global pause: off;
- create pause: off for controlled acceptance;
- buy pause: on;
- sell pause: on;
- graduation pause: on;
- claims pause: on;
- route authorization required: on;
- authorized trading required: on;
- security defaults locked: true.

Do not enable bonding simply because create acceptance passes.

## Step 10 — independently verify protocol state

Run the read-only verification mode:

```bash
npm --prefix tests/solana run devnet:verify
```

Verification fails when:

- an account is missing;
- any authority differs;
- the Railway route signer differs;
- security defaults are unlocked;
- pause flags differ;
- generation economics differ;
- generation program or PDA self-binding differs;
- the canonical generation-manifest hash differs;
- cluster state differs.

## Step 11 — configure Railway disabled first

Use the exact environment names consumed by the current V4 backend:

```text
SOLANA_CLUSTER=devnet
SOLANA_RPC_URL=<APPROVED_DEVNET_RPC>
SOLANA_LAUNCHPAD_PROGRAM_ID=<PROGRAM_ID>
SOLANA_ROUTE_SIGNER_PUBLIC_KEY=<ROUTE_SIGNER_PUBLIC_KEY>
SOLANA_ROUTE_SIGNER_SECRET_KEY=<RAILWAY_SECRET_ONLY>
SOLANA_CREATE_AUTH_ENABLED=false
SOLANA_CREATE_AUTH_SCHEMA_VERSION=4
SOLANA_LAUNCHPAD_IDL_SHA256=<IDL_HASH>
SOLANA_LAUNCHPAD_PROGRAM_SHA256=<PROGRAM_HASH>
SOLANA_GENERATION_MANIFEST_HASH=<CANONICAL_GENERATION_MANIFEST_HASH>
SOLANA_CLUSTER_HASH_HEX=<APPROVED_CLUSTER_HASH>
```

Never place `SOLANA_ROUTE_SIGNER_SECRET_KEY` in Netlify, Vite variables, frontend files, deployment manifests, GitHub variables or pull-request workflow secrets.

## Step 12 — acceptance before enabling Railway

Verify on devnet:

1. deployed program is executable and owned by the BPF upgradeable loader;
2. ProgramData upgrade authority is the intended devnet authority;
3. GlobalConfig is owned by the deployed program;
4. all operator authorities match approved addresses;
5. route signer matches Railway public configuration;
6. security defaults are locked;
7. pause flags match the canonical manifest;
8. GenerationConfig is self-bound to the deployed program and its own PDA;
9. generation economics and manifest hash match deployment evidence;
10. controlled Draft Deploy Now succeeds;
11. Countdown Create succeeds and remains non-tradable before `launch_at`;
12. Direct Create remains blocked until canonical reservation creation is implemented;
13. all negative V4 authorization cases still fail.

Only then may `SOLANA_CREATE_AUTH_ENABLED` change to `true`.

## Stop conditions

Stop immediately when:

- program IDs disagree;
- placeholder program ID remains present;
- deployer, program, upgrade-authority or route-signer key material appears in git status;
- binary or IDL hash differs from the prepared manifest;
- canonical generation-manifest hash differs;
- upgrade authority is unexpected;
- GlobalConfig, GenerationConfig or ClusterProfile is owned by another program;
- route signer differs between chain and Railway;
- security defaults are unlocked;
- trading, graduation or claims are unpaused before implementation and acceptance.

## Next dependency after devnet create acceptance

Recalculate the build order after deployment and initialization evidence is complete. The likely highest-value implementation is the wallet transaction builder plus real devnet Draft Deploy Now and Countdown Create acceptance because it validates the complete backend-to-wallet-to-program boundary before bonding logic is introduced.

## P1 bonding trade smoke (after create acceptance)

Create acceptance intentionally leaves **buy/sell paused**. Do not treat create success as trade-ready.

Operator guide (plain language): [`docs/solana/devnet-trade-smoke.md`](./solana/devnet-trade-smoke.md)

```bash
export SOLANA_RPC_URL="https://api.devnet.solana.com"
export SOLANA_LAUNCHPAD_PROGRAM_ID="<PROGRAM_ID>"
export SOLANA_OPERATOR_KEYPAIR="$HOME/.config/memewarzone/solana-devnet/deployer.json"

# Read pause flags + whether IDL includes buy_tokens/sell_tokens
npm --prefix tests/solana run devnet:trade-ops -- status

# Profiles
npm --prefix tests/solana run devnet:trade-ops -- sync-creator <CREATOR>
npm --prefix tests/solana run devnet:trade-ops -- sync-risk <BUYER>

# After program upgrade with buy/sell: open trade window (grad/claims stay paused)
npm --prefix tests/solana run devnet:trade-ops -- unpause-trade

# Railway only after unpause: SOLANA_TRADE_AUTH_ENABLED=true
# Then buyer smoke on TokenDetails; when done:
npm --prefix tests/solana run devnet:trade-ops -- pause-trade
```

**Do not** re-run `devnet:bootstrap` while trading is unpaused — bootstrap re-applies canonical `buyPaused`/`sellPaused` from `config/solana/devnet-generation-v1.json`.
