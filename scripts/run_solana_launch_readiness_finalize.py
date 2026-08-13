#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import solana_launch_readiness_finalize as finalizer

_original = finalizer.replace_once


def strict_with_known_duplicate(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if label == "TokenDetails Solana price fixed notation":
        if count != 2:
            raise RuntimeError(f"{label}: expected exactly two known formatter matches, found {count}")
        return text.replace(old, new, 2)
    if label == "TokenDetails Solana native fixed notation" and count == 0:
        # The two identical tiny-value formatter bodies were already replaced by
        # the preceding explicitly-two-match transform.
        return text
    return _original(text, old, new, label)


finalizer.replace_once = strict_with_known_duplicate

try:
    finalizer.main()
except Exception as exc:
    print(f"[solana-launch-readiness] ERROR: {exc}", file=sys.stderr)
    sys.exit(1)
