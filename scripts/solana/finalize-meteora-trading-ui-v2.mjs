import fs from "node:fs";
import { pathToFileURL } from "node:url";

const sourcePath = "scripts/solana/finalize-meteora-trading-ui.mjs";
let script = fs.readFileSync(sourcePath, "utf8");

function replaceOnce(before, after, label) {
  const count = script.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  script = script.replace(before, after);
}

// The finalizer itself uses template literals to hold injected TSX. Escape the two
// TSX template interpolations so they survive as source instead of executing while
// the finalizer runs. Match only the stable prefix so physical line breaks do not
// affect the safety check.
replaceOnce(
  'description: `Minimum received: ${',
  'description: `Minimum received: \\${',
  "minimum received interpolation",
);
replaceOnce(
  'description: `Tx: ${',
  'description: `Tx: \\${',
  "transaction signature interpolation",
);

const fixedPath = "/tmp/mw-finalize-meteora-trading-ui-fixed.mjs";
fs.writeFileSync(fixedPath, script);
await import(`${pathToFileURL(fixedPath).href}?v=${Date.now()}`);
console.log("[meteora-trading-ui-v2] nested source interpolation escaped");
