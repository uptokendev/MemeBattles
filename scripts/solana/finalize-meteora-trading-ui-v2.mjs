import fs from "node:fs";
import { pathToFileURL } from "node:url";

const sourcePath = "scripts/solana/finalize-meteora-trading-ui.mjs";
let script = fs.readFileSync(sourcePath, "utf8");

function replaceOnce(before, after, label) {
  const count = script.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  script = script.replace(before, after);
}

// The finalizer itself uses a template literal to hold injected TSX. Escape the
// two nested TSX template literals completely (opening backtick, interpolation,
// and closing backtick) so the finalizer parses while the generated TSX remains
// unchanged.
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
console.log("[meteora-trading-ui-v2] nested TSX templates escaped");
