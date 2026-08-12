# MemeWarzone Solana Devnet Deployment Runbook

Status: S0 deterministic-deployment recovery  
Target branch: `devpostgrad`  
Network: Solana devnet  
Golden implementation: completed BNB product

## Purpose

This runbook is the operator path for Phase S0 of the Solana BNB-parity plan. Its job is to make the active Solana deployment deterministic before create/buy/sell parity is marked verified.

The deployment is not healthy merely because the program exists on devnet. The program, ProgramData account, generated IDL, generation manifest, GlobalConfig, GenerationConfig, frontend, backend authorization service and active pause state must all identify the same deployment.

The current repository program identity is `3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt`. Treat any disagreement with that identity as a hard failure until the repository is intentionally upgraded to a new program identity.

## S0 rules

1. Do not repair an active environment by re-running bootstrap blindly.
2. Do not manually replace PDAs, hashes or program IDs after a failed create/trade.
3. A program upgrade is not complete until deployment identity and generation identity are reverified.
4. `verify-solana-devnet` is the S0 gate. A lower-level diagnostic command does not replace it.
5. Create, buy and sell must all be unpaused for the S0 smoke gate.
6. Generated deployment evidence is local/operator evidence and is ignored by git. Do not commit secrets or keypairs to make verification easier.

## Toolchain

Use the pinned toolchain already accepted by the repository:

- Anchor CLI `0.30.1`;
- Solana CLI `1.18.26`;
- Rust `1.79.0` for SBF builds;
- Rust `nightly-2024-05-09` for IDL generation;
- Node.js compatible with `tests/solana/package.json`.

Use a dedicated devnet deployer. Never put the deployer, program keypair, upgrade-authority private key or Railway route-signer secret in the repository, frontend, Netlify or ordinary CI logs.

## Step 1 — reconcile static program identity before building

The same public program ID must appear in:

- `programs/memewarzone_solana/src/lib.rs` (`declare_id!`);
- `Anchor.toml` localnet entry;
- `Anchor.toml` devnet entry;
- generated IDL address;
- frontend configuration;
- backend/Railway configuration.

Run the static readiness check:

```bash
node scripts/solana/check-devnet-readiness.mjs
```

A mismatch is a hard stop. Do not patch around it with a temporary environment variable.

## Step 2 — build the authoritative artifacts

Build from the exact commit that will be recorded as deployment evidence:

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

Do not deploy artifacts from an uncommitted or unknown source tree.

## Step 3 — prepare deployment evidence before deploy/upgrade

```bash
npm run prepare-solana-devnet -- \
  --program-id 3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt \
  --rpc-url https://api.devnet.solana.com \
  --commit <GIT_COMMIT_SHA>
```

This writes `deployments/solana-devnet.prepared.json` with the local program, IDL, V4 binding, generation-manifest, source and Anchor hashes. It is preparation evidence, not proof that those bytes are deployed.

After every upgrade, regenerate this evidence from the new build. Never carry the old program or IDL hash forward manually.

## Step 4 — deploy/upgrade and capture public loader identity

Deploy with the intended devnet authority, then inspect the program:

```bash
solana program show 3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt \
  --url https://api.devnet.solana.com
```

Record the public values:

- program ID;
- ProgramData address;
- last deployed slot;
- upgrade authority;
- deployment signature.

The S0 verifier independently reads the program and ProgramData accounts. It does not trust a copied `solana program show` result as proof.

## Step 5 — export verification inputs

At minimum, provide the active public configuration and operator keypair path used by the existing protocol-state verifier:

```bash
export SOLANA_RPC_URL="https://api.devnet.solana.com"
export SOLANA_LAUNCHPAD_PROGRAM_ID="3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt"
export SOLANA_OPERATOR_KEYPAIR="$HOME/.config/memewarzone/solana-devnet/deployer.json"
export SOLANA_ROUTE_SIGNER_PUBLIC_KEY="<ROUTE_SIGNER_PUBLIC_KEY>"
export SOLANA_UPGRADE_AUTHORITY_PUBLIC_KEY="<EXPECTED_UPGRADE_AUTHORITY>"
```

If the program is intentionally immutable, set:

```bash
export SOLANA_UPGRADE_AUTHORITY_PUBLIC_KEY="none"
```

Optional hard assertions for a frozen deployment are:

```bash
export SOLANA_PROGRAMDATA_ADDRESS="<EXPECTED_PROGRAMDATA_ADDRESS>"
export SOLANA_DEPLOYMENT_SLOT="<EXPECTED_DEPLOYMENT_SLOT>"
export SOLANA_LAUNCHPAD_PROGRAM_SHA256="<EXPECTED_PROGRAM_SHA256>"
export SOLANA_LAUNCHPAD_IDL_SHA256="<EXPECTED_IDL_SHA256>"
export SOLANA_GENERATION_MANIFEST_HASH="<EXPECTED_GENERATION_MANIFEST_SHA256>"
```

Provide the frontend and backend identity sources so the gate can compare them instead of silently skipping them:

```bash
export VITE_SOLANA_LAUNCHPAD_PROGRAM_ID="3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt"
export SOLANA_BACKEND_ENV_FILE="<PATH_TO_EXPORTED_RAILWAY_ENV>"
export SOLANA_AUTH_HEALTHCHECK_URL="<DEPLOYED_SOLANA_AUTH_OR_STATUS_HEALTH_URL>"
```

The backend env/health evidence must expose enough information to verify the backend program ID, route-signer public key and generation-manifest hash. `SOLANA_ROUTE_SIGNER_SECRET_KEY` remains Railway/server-only.

## Step 6 — bootstrap safely

For a new, uninitialized environment:

```bash
npm run bootstrap-solana-devnet
```

Bootstrap initializes missing protocol accounts and security defaults from `config/solana/devnet-generation-v1.json`.

### Existing environment safety

Normal bootstrap **does not silently restore pause flags on an already initialized environment**. If live pause flags differ from the canonical bootstrap defaults, bootstrap refuses to continue and reports the mismatch.

That behavior is intentional. It prevents a recovery/bootstrap command from turning working create/buy/sell back off.

Only when you deliberately want to restore the canonical bootstrap pause posture may you run:

```bash
npm run bootstrap-solana-devnet:allow-pause-reset
```

Treat that command as an explicit state change, not as a generic repair command.

Use dedicated state commands for normal trade-window changes:

```bash
npm --prefix tests/solana run devnet:trade-ops -- status
npm --prefix tests/solana run devnet:trade-ops -- unpause-trade
npm --prefix tests/solana run devnet:trade-ops -- pause-trade
```

Do not use bootstrap to pause or unpause create, buy, sell, claims or graduation during normal operation.

## Step 7 — put the current S0 smoke state in place

Before running the S0 gate, the active deployment must be ready for the core smoke journey:

- global pause: off;
- create pause: off;
- buy pause: off;
- sell pause: off;
- route authorization required: on;
- authorized trading required: on.

Graduation and claims remain outside the S0 smoke requirement and should stay in their approved safe state until their later parity phases.

The corresponding deployed backend flags must agree with the live program state. In particular, create and trade authorization cannot be disabled while the gate expects create/buy/sell to work.

## Step 8 — run the canonical S0 verifier

Run from the repository root:

```bash
npm run verify-solana-devnet
```

The command now performs two read-only verification layers and then writes one merged current manifest.

### Deployment identity layer

It verifies:

- RPC reachable;
- static program IDs agree;
- program account exists and is executable;
- program is owned by the upgradeable loader;
- ProgramData address is decoded from the program account;
- ProgramData is owned by the upgradeable loader;
- deployment slot is decoded from ProgramData;
- upgrade authority equals `SOLANA_UPGRADE_AUTHORITY_PUBLIC_KEY`;
- the deployed program-byte prefix is byte-for-byte identical to `target/deploy/memewarzone_solana.so`;
- deployed SHA-256 equals the local/configured program SHA-256.

It writes:

```text
deployments/solana-devnet.deployment-identity.json
```

### Protocol/generation layer

It verifies the existing GlobalConfig/GenerationConfig/cluster invariants, including:

- GlobalConfig exists;
- GenerationConfig exists and is self-bound to this program and PDA;
- generation ID and canonical generation-manifest hash match;
- economics version and generation settings match;
- route signer matches;
- security defaults remain locked;
- create, buy and sell are all unpaused for the S0 smoke gate;
- frontend program ID agrees;
- backend program ID agrees;
- backend route signer and manifest hash agree;
- the configured backend auth/status health endpoint is healthy.

It writes:

```text
deployments/solana-devnet.protocol-state.json
```

### Canonical current deployment manifest

Only after both layers pass, the wrapper writes:

```text
deployments/solana-devnet.current.json
```

This is the single generated current-state manifest for the verification run. It combines program ID/hash, IDL hash, ProgramData address, deployment slot, upgrade authority, GlobalConfig, GenerationConfig, generation ID/hash, authorities, economics/settings, pause flags, frontend/backend agreement and backend health evidence.

All `deployments/*.json` files are ignored by git. Archive the verified current manifest with the operator/release evidence for the exact deployment; never commit secrets to the repository.

A verifier failure is a hard stop. Fix the source mismatch, redeploy/reconfigure if necessary, then rerun the full command.

## Step 9 — S0 browser/wallet exit gate

After `verify-solana-devnet` passes, run the user-level smoke against the same frozen deployment:

1. clean browser/session;
2. select Solana;
3. connect creator;
4. Direct-create a brand-new token;
5. land on the correct TokenDetails campaign;
6. connect a second wallet;
7. buy `0.01 SOL`;
8. confirm expected token balance;
9. refresh and confirm campaign/mint/vault state still resolves;
10. buy again;
11. partial sell;
12. second buy;
13. full sell;
14. restart/redeploy the API;
15. buy again and confirm it still works.

No manual database edits, PDA replacement, hash edits or bootstrap reruns are allowed during this sequence.

Create, buy and sell remain `IMPLEMENTED / RETEST REQUIRED` until this user-level smoke passes end-to-end on the frozen deployment.

## Failure tracing order

For the first failing action, trace exactly this order and stop at the first divergence:

```text
Frontend
→ authorization API
→ generated instruction
→ program ID
→ GenerationConfig
→ PDAs
→ transaction simulation
→ transaction logs
→ on-chain state
→ database
```

Repair the root cause. Do not repair downstream state by hand and call the feature verified.

## Stop conditions

Stop the S0 gate immediately if any of the following occurs:

- static program IDs disagree;
- deployed bytes differ from the build artifact;
- ProgramData owner or upgrade authority is unexpected;
- IDL or generation-manifest hash differs;
- GlobalConfig/GenerationConfig is missing or owned by another program;
- route signer differs between chain and backend;
- frontend and backend do not point to the same program;
- create, buy or sell is paused;
- backend auth/status health is unavailable or reports unhealthy;
- bootstrap requests a pause reset that was not intentionally requested.

Do not begin S1/S2 repair beyond the core smoke path, and do not begin S3 indexer/Ably work, until the S0 exit gate is green.
