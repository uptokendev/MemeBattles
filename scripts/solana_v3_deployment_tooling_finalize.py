#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
OLD = 'config/solana/devnet-generation-v1.json'
NEW = 'config/solana/devnet-generation-v3.json'

TARGETS = [
    'tests/solana/devnet-protocol-state.cjs',
    'tests/solana/devnet-protocol-verify.cjs',
    'tests/solana/devnet-generation-manifest-diagnose.cjs',
    'tests/solana/verify-solana-devnet.cjs',
    'scripts/solana/prepare-devnet-deployment.mjs',
]

try:
    for rel in TARGETS:
        path = ROOT / rel
        text = path.read_text(encoding='utf-8')
        count = text.count(OLD)
        if count != 1:
            raise RuntimeError(f'{rel}: expected exactly one historical active-manifest reference, found {count}')
        path.write_text(text.replace(OLD, NEW, 1), encoding='utf-8')
        print(f'[v3-deployment-tooling] {rel}: {OLD} -> {NEW}')
    print('[v3-deployment-tooling] DONE')
except Exception as exc:
    print(f'[v3-deployment-tooling] ERROR: {exc}', file=sys.stderr)
    sys.exit(1)
