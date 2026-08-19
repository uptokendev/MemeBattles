from pathlib import Path

source_path = Path(".github/scripts/apply-solana-preflight-final.py")
source = source_path.read_text(encoding="utf-8")
needle = '''    if count != 1:\n        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:160]!r}")\n'''
replacement = '''    if count not in (1, 2):\n        raise SystemExit(f"{path}: expected one or paired BUY/SELL matches, found {count}: {old[:160]!r}")\n'''
if source.count(needle) != 1:
    raise SystemExit("Could not locate replace_once strictness guard in Solana patch script")
source = source.replace(needle, replacement, 1)
exec(compile(source, str(source_path), "exec"), {"__name__": "__main__", "__file__": str(source_path)})
