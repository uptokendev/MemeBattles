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

    # The V3 generation regression test must use the fixture names already
    # defined by lib.rs. Assert the generated references before correcting them.
    lib_path = ROOT / "programs/memewarzone_solana/src/lib.rs"
    lib_source = lib_path.read_text(encoding="utf-8")
    if lib_source.count("let global = sample_global();") != 1:
        raise RuntimeError("Rust V3 fixture patch: expected one sample_global reference")
    if lib_source.count("let mut settings = sample_generation();") != 1:
        raise RuntimeError("Rust V3 fixture patch: expected one sample_generation reference")
    lib_source = lib_source.replace("let global = sample_global();", "let global = test_global_config();", 1)
    lib_source = lib_source.replace(
        "let mut settings = sample_generation();",
        "let mut settings = test_generation_settings();",
        1,
    )
    lib_path.write_text(lib_source, encoding="utf-8")
except Exception as exc:
    print(f"[solana-launch-readiness] ERROR: {exc}", file=sys.stderr)
    sys.exit(1)
