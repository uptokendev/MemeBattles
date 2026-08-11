#!/usr/bin/env bash
# Resume economics-v2 program upgrade + generation activate once deployer has ~8 SOL.
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
SECRETS="${SOLANA_DEVNET_SECRETS:-$HOME/.config/memewarzone/solana-devnet}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PROGRAM_ID="${SOLANA_LAUNCHPAD_PROGRAM_ID:-3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt}"
DEPLOYER_KP="$SECRETS/deployer.json"
DEPLOYER=$(solana-keygen pubkey "$DEPLOYER_KP")
BAL=$(solana balance "$DEPLOYER" --url https://api.devnet.solana.com | awk '{print $1}')
echo "Deployer $DEPLOYER balance: $BAL SOL"
python3 - <<PY
bal=float("$BAL")
if bal < 7.5:
    raise SystemExit(
        f"Need ~8 SOL on deployer for buffer+upgrade (have {bal}). "
        "Fund https://faucet.solana.com then re-run this script."
    )
print("Balance OK")
PY

cp -f target/sbf-solana-solana/release/memewarzone_solana.so target/deploy/memewarzone_solana.so
cp -f "$SECRETS/memewarzone_solana-keypair.json" target/deploy/memewarzone_solana-keypair.json
chmod 600 target/deploy/memewarzone_solana-keypair.json

echo "=== program deploy/upgrade ==="
solana program deploy target/deploy/memewarzone_solana.so \
  --program-id "$PROGRAM_ID" \
  --url https://api.devnet.solana.com \
  --keypair "$DEPLOYER_KP" \
  --upgrade-authority "$DEPLOYER_KP"

solana program show "$PROGRAM_ID" --url https://api.devnet.solana.com

export SOLANA_RPC_URL="https://api.devnet.solana.com"
export SOLANA_LAUNCHPAD_PROGRAM_ID="$PROGRAM_ID"
export SOLANA_OPERATOR_KEYPAIR="$DEPLOYER_KP"
export SOLANA_ROUTE_SIGNER_PUBLIC_KEY="$(solana-keygen pubkey "$SECRETS/route-signer.json")"

echo "=== activate v2 generation ==="
# Refresh IDL after build if present
if [[ -f target/idl/memewarzone_solana.json ]]; then
  node tests/solana/devnet-activate-v2.cjs
else
  echo "WARN: target/idl/memewarzone_solana.json missing — run anchor build first"
  exit 1
fi

echo "=== unpause trade ==="
npm --prefix tests/solana run devnet:trade-ops -- unpause-trade

npm --prefix tests/solana run devnet:trade-ops -- status
echo "DONE — Direct-deploy a NEW mint (old TESTSOL stays v1)."
