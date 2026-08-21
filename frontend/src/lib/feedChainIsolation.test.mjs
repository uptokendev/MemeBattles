import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

test("feed helpers keep campaign chain independent of the connected wallet", () => {
  const feed = fs.readFileSync(path.join(dir, "feedChainConfig.ts"), "utf8");
  const wallet = fs.readFileSync(path.join(dir, "activeWalletChain.ts"), "utf8");
  assert.match(feed, /if \(selected === 101\) return \[101/);
  assert.match(wallet, /if \(kind === "solana"\) return 101;/);
  assert.match(wallet, /if \(evmChainId === 56 \|\| evmChainId === 97\) return evmChainId/);
});
