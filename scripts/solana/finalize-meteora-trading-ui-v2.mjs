import fs from "node:fs";
import { pathToFileURL } from "node:url";

const sourcePath = "scripts/solana/finalize-meteora-trading-ui.mjs";
let script = fs.readFileSync(sourcePath, "utf8");

function replaceOnce(before, after, label) {
  const count = script.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  script = script.replace(before, after);
}

function replaceExactCount(before, after, expected, label) {
  const count = script.split(before).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  script = script.split(before).join(after);
}

// Normalize the indentation snapshot used by the original finalizer.
replaceExactCount(
  "`              setEffectiveTokenWei(0n);\\n              setEffectiveBnbWei(0n);\\n              setQuoteWei(null);",
  "`            setEffectiveTokenWei(0n);\\n            setEffectiveBnbWei(0n);\\n            setQuoteWei(null);",
  2,
  "empty quote indentation",
);
replaceExactCount(
  "\\n              setQuoteError(null);`",
  "\\n            setQuoteError(null);`",
  2,
  "empty quote error indentation",
);
replaceOnce(
  "\\n              setSolanaMeteoraQuote(null);",
  "\\n            setSolanaMeteoraQuote(null);",
  "empty quote Meteora indentation",
);

// The four-line reset exists twice in current TokenDetails. The empty-input path
// is uniquely followed by setQuoteLoading(false), so bind both finalizer templates
// to that fifth line instead of weakening replaceOnce semantics.
replaceOnce(
  "`            setEffectiveTokenWei(0n);\\n            setEffectiveBnbWei(0n);\\n            setQuoteWei(null);\\n            setQuoteError(null);`",
  "`            setEffectiveTokenWei(0n);\\n            setEffectiveBnbWei(0n);\\n            setQuoteWei(null);\\n            setQuoteError(null);\\n            setQuoteLoading(false);`",
  "empty quote before uniqueness",
);
replaceOnce(
  "`            setEffectiveTokenWei(0n);\\n            setEffectiveBnbWei(0n);\\n            setQuoteWei(null);\\n            setSolanaMeteoraQuote(null);\\n            setQuoteError(null);`",
  "`            setEffectiveTokenWei(0n);\\n            setEffectiveBnbWei(0n);\\n            setQuoteWei(null);\\n            setSolanaMeteoraQuote(null);\\n            setQuoteError(null);\\n            setQuoteLoading(false);`",
  "empty quote after uniqueness",
);

// Escape nested TSX template literals held inside the finalizer's outer template.
replaceOnce(
  "description: `Minimum received: ${",
  "description: \\`Minimum received: \\${",
  "minimum received template opening",
);
replaceOnce(
  "            }.`,\\n          });",
  "            }.\\`,\\n          });",
  "minimum received template closing",
);
replaceOnce(
  "description: `Tx: ${result.signature.slice(0, 12)}…`,",
  "description: \\`Tx: \\${result.signature.slice(0, 12)}…\\`,",
  "transaction signature template",
);

const fixedPath = "/tmp/mw-finalize-meteora-trading-ui-fixed.mjs";
fs.writeFileSync(fixedPath, script);
await import(`${pathToFileURL(fixedPath).href}?v=${Date.now()}`);
console.log("[meteora-trading-ui-v2] exact empty-input path bound; nested TSX templates escaped");
