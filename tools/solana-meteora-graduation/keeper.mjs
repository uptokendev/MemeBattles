import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Connection, PublicKey } from "@solana/web3.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RPC = "https://api.devnet.solana.com";
const GRADUATE = path.join(HERE, "graduate.mjs");

function fail(message) {
  throw new Error(`[solana-meteora-graduation-keeper] ${message}`);
}

function parseArgs(argv) {
  const campaigns = [];
  let once = false;
  let intervalMs = 2_000;
  for (const raw of argv) {
    if (raw === "--once") {
      once = true;
      continue;
    }
    if (raw === "--watch") {
      once = false;
      continue;
    }
    if (raw.startsWith("--interval=")) {
      intervalMs = Math.max(5_000, Number(raw.slice("--interval=".length)) || 20_000);
      continue;
    }
    if (raw.startsWith("-")) fail(`unknown flag: ${raw}`);
    campaigns.push(raw);
  }
  const fromEnv = String(process.env.SOLANA_GRADUATION_CAMPAIGNS || process.env.SOLANA_GRADUATION_CAMPAIGN || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return { campaigns: [...new Set([...campaigns, ...fromEnv])], once, intervalMs };
}

function decodeFlags(data) {
  const buf = Buffer.from(data);
  if (buf.length < 714) fail(`campaign account too short (${buf.length})`);
  return {
    graduated: buf.readUInt8(713) === 1,
    curveClosed: buf.length >= 719 ? buf.readUInt8(714) === 1 : false,
  };
}

function runGraduate(campaign) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [GRADUATE, campaign], {
      cwd: HERE,
      env: process.env,
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", (error) => {
      console.error("[keeper] graduate spawn failed", campaign, error);
      resolve(false);
    });
  });
}

async function scanOnce(connection, campaigns) {
  let submitted = 0;
  let skipped = 0;
  let failed = 0;
  for (const campaign of campaigns) {
    const info = await connection.getAccountInfo(new PublicKey(campaign), "confirmed");
    if (!info?.data) {
      console.warn("[keeper] missing campaign", campaign);
      failed += 1;
      continue;
    }
    const flags = decodeFlags(info.data);
    if (flags.graduated) {
      console.log("[keeper] already graduated", campaign);
      skipped += 1;
      continue;
    }
    if (!flags.curveClosed) {
      console.log("[keeper] still bonding", campaign);
      skipped += 1;
      continue;
    }
    console.log("[keeper] submitting graduation", campaign);
    const ok = await runGraduate(campaign);
    if (ok) submitted += 1;
    else failed += 1;
  }
  return { submitted, skipped, failed };
}

async function main() {
  const { campaigns, once, intervalMs } = parseArgs(process.argv.slice(2));
  if (!campaigns.length) {
    fail("usage: node keeper.mjs [--once|--watch] [--interval=20000] <CAMPAIGN_PDA> [...]");
  }
  const rpcUrl = process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const connection = new Connection(rpcUrl, "confirmed");
  const run = async () => {
    const result = await scanOnce(connection, campaigns);
    console.log("[keeper] pass", result);
    return result;
  };
  await run();
  if (once) return;
  setInterval(() => {
    run().catch((error) => console.error("[keeper] pass failed", error));
  }, intervalMs);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
