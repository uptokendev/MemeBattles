#!/usr/bin/env bash
# Resume Solana devnet program upgrade after funding the deployer.
# Requires: rebuilt artifacts in target/deploy + target/idl (already present if ops continued).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

KP="${SOLANA_OPERATOR_KEYPAIR:-$HOME/.config/memewarzone/solana-devnet/deployer.json}"
RPC="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
PROGRAM_ID="${SOLANA_LAUNCHPAD_PROGRAM_ID:-3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt}"
SO="target/deploy/memewarzone_solana.so"
IDL="target/idl/memewarzone_solana.json"

if [[ ! -f "$KP" ]]; then
  echo "Missing operator keypair: $KP" >&2
  exit 1
fi
if [[ ! -s "$SO" || ! -s "$IDL" ]]; then
  echo "Missing build artifacts. Run anchor build + idl build first." >&2
  exit 1
fi

echo "Deployer: $(solana-keygen pubkey "$KP")"
BAL=$(solana balance --url "$RPC" --keypair "$KP" | awk '{print $1}')
echo "Balance: $BAL SOL"
# Buffer for ~732KB .so needs ~5.1 SOL temporarily
python3 - <<PY
bal=float("$BAL")
if bal < 5.2:
    raise SystemExit(
        f"Need >= 5.2 SOL liquid for buffer rent (have {bal}). "
        f"Fund via https://faucet.solana.com/ then re-run this script."
    )
print(f"Balance OK for upgrade buffer ({bal} SOL)")
PY

# Close any leftover buffers
if solana program show --buffers --url "$RPC" --keypair "$KP" 2>/dev/null | grep -q '^[1-9A-HJ-NP-Za-km-z]'; then
  echo "Closing leftover buffers..."
  solana program close --buffers --url "$RPC" --keypair "$KP" --bypass-warning || true
fi

export ANCHOR_WALLET="$KP"
export ANCHOR_PROVIDER_URL="$RPC"
echo "Deploying $SO → $PROGRAM_ID ..."
anchor deploy --provider.cluster devnet --provider.wallet "$KP"

echo "Program after deploy:"
solana program show "$PROGRAM_ID" --url "$RPC" | head -15

PROG_SHA=$(sha256sum "$SO" | awk '{print $1}')
IDL_SHA=$(sha256sum "$IDL" | awk '{print $1}')
echo
echo "=== Railway env updates (set these after deploy) ==="
echo "SOLANA_LAUNCHPAD_PROGRAM_ID=$PROGRAM_ID"
echo "SOLANA_LAUNCHPAD_PROGRAM_SHA256=$PROG_SHA"
echo "SOLANA_LAUNCHPAD_IDL_SHA256=$IDL_SHA"
echo "SOLANA_TRADE_AUTH_ENABLED=false   # enable only after unpause-trade"
echo
echo "Next:"
echo "  1) Update Railway hashes above"
echo "  2) npm --prefix tests/solana run devnet:trade-ops -- status"
echo "  3) npm --prefix tests/solana run devnet:trade-ops -- unpause-trade"
echo "  4) Railway: SOLANA_TRADE_AUTH_ENABLED=true"
echo "  5) Smoke buy/sell with a separate BUYER wallet"
