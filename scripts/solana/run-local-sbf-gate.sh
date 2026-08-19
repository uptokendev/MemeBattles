#!/usr/bin/env bash
# Load the compiled MemeWarzone .so into a local validator at the mainnet
# program ID and run create + bonding lifecycle. Nothing touches mainnet.
#
#   git checkout fix/solana-create-stack-overflow
#   bash scripts/solana/run-local-sbf-gate.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PROGRAM_ID="3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt"
SO="$ROOT/target/deploy/memewarzone_solana.so"
WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"

if ! command -v anchor >/dev/null 2>&1; then
  echo "anchor CLI is required (run inside WSL with the Solana toolchain)" >&2
  exit 1
fi
if ! command -v solana-test-validator >/dev/null 2>&1; then
  echo "solana-test-validator is required" >&2
  exit 1
fi

echo "==> building memewarzone_solana"
anchor build -p memewarzone_solana
if [[ ! -f "$SO" ]]; then
  echo "missing $SO" >&2
  exit 1
fi

HASH="$(sha256sum "$SO" | awk '{print $1}')"
BYTES="$(wc -c < "$SO" | tr -d ' ')"
echo "==> SBF artifact"
echo "    program_id=$PROGRAM_ID"
echo "    bytes=$BYTES"
echo "    sha256=$HASH"
echo "$HASH" > "$ROOT/target/deploy/memewarzone_solana.sha256"

echo "==> starting solana-test-validator with this exact .so"
solana-test-validator \
  --reset \
  --bpf-program "$PROGRAM_ID" "$SO" \
  --quiet \
  >/tmp/mwz-local-validator.log 2>&1 &
VALIDATOR_PID=$!
cleanup() {
  kill "$VALIDATOR_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  if solana cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

export ANCHOR_PROVIDER_URL="http://127.0.0.1:8899"
export ANCHOR_WALLET="$WALLET"
if [[ ! -f "$WALLET" ]]; then
  echo "ANCHOR_WALLET not found: $WALLET" >&2
  echo "Create one with: solana-keygen new -o $WALLET" >&2
  exit 1
fi
PAYER="$(solana-keygen pubkey "$WALLET")"
echo "==> funding test payer $PAYER"
solana airdrop 100 "$PAYER" --url http://127.0.0.1:8899
solana balance "$PAYER" --url http://127.0.0.1:8899

echo "==> create acceptance"
npm --prefix tests/solana test -- --grep "authorization V4 local-validator acceptance"

echo "==> bonding lifecycle (simulate then send)"
npm --prefix tests/solana run test:lifecycle

echo "==> GATE PASS"
echo "    sha256=$HASH"
echo "    Deploy this exact file: $SO"
echo "    Then set Coolify/Railway SOLANA_LAUNCHPAD_PROGRAM_SHA256=$HASH"
