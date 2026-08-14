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
    soldTokens: buf.length >= 670 ? buf.readBigUInt64LE(662) : 0n,
    curveTokenSupply: buf.length >= 436 ? buf.readBigUInt64LE(428) : 0n,
    netRaisedLamports: buf.length >= 678 ? buf.readBigUInt64LE(670) : 0n,
    graduationTargetUsdMicros: buf.length >= 416 ? buf.readBigUInt64LE(408) : 0n,
  };
}

async function fetchSolUsdMicros() {
  const override = String(process.env.SOLANA_GRADUATION_SOL_USD_MICROS || "").trim();
  if (override) return BigInt(override);
  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
    { headers: { accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
  const body = await response.json();
  const price = Number(body?.solana?.usd);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid SOL/USD");
  return BigInt(Math.round(price * 1_000_000));
}

function raiseTargetMet(flags, solUsdMicros) {
  if (flags.soldTokens >= flags.curveTokenSupply && flags.curveTokenSupply > 0n) return true;
  if (!solUsdMicros || solUsdMicros <= 0n || flags.graduationTargetUsdMicros <= 0n) return false;
  const nativeTarget = (flags.graduationTargetUsdMicros * 1_000_000_000n + solUsdMicros - 1n) / solUsdMicros;
  return flags.netRaisedLamports >= nativeTarget;
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
    let eligible = flags.curveClosed;
    if (!eligible) {
      try {
        eligible = raiseTargetMet(flags, await fetchSolUsdMicros());
      } catch (error) {
        console.warn("[keeper] oracle unavailable", error instanceof Error ? error.message : error);
      }
    }
    if (!eligible) {
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
