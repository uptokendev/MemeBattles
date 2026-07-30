import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const env = { ...process.env };
const aliases = [
  ["CREATOR_CLUSTER_CHAIN_ID", "CREATOR_FUNDING_CHAIN_ID"],
  ["CREATOR_CLUSTER_RPC_URLS", "CREATOR_FUNDING_RPC_URLS"],
  ["CREATOR_CLUSTER_RPC_TIMEOUT_MS", "CREATOR_FUNDING_RPC_TIMEOUT_MS"],
  ["CREATOR_CLUSTER_FALLBACK_FINALITY_BLOCKS", "CREATOR_FUNDING_CONFIRMATIONS"],
  ["CREATOR_CLUSTER_START_BLOCK", "CREATOR_FUNDING_START_BLOCK"],
  ["CREATOR_CLUSTER_INITIAL_BACKFILL_BLOCKS", "CREATOR_FUNDING_INITIAL_BACKFILL_BLOCKS"],
  ["CREATOR_CLUSTER_MAX_BLOCKS_PER_TICK", "CREATOR_FUNDING_BATCH_BLOCKS"],
  ["CREATOR_CLUSTER_POLL_INTERVAL_MS", "CREATOR_FUNDING_POLL_INTERVAL_MS"],
  ["CREATOR_CLUSTER_CREATOR_REFRESH_MS", "CREATOR_FUNDING_CREATOR_REFRESH_MS"],
  ["CREATOR_CLUSTER_FUNDING_LOOKBACK_DAYS", "CREATOR_FUNDING_LOOKBACK_DAYS"],
  ["CREATOR_CLUSTER_MIN_FUNDING_WEI", "CREATOR_FUNDING_MIN_WEI"],
];

for (const [canonical, alias] of aliases) {
  if (!String(env[canonical] || "").trim() && String(env[alias] || "").trim()) {
    env[canonical] = env[alias];
  }
}

const indexerPath = fileURLToPath(new URL("./run-creator-funding-indexer.mjs", import.meta.url));
const child = spawn(process.execPath, [indexerPath], {
  stdio: "inherit",
  env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error(`[creator-funding-worker] failed to start: ${error?.stack || error?.message || error}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[creator-funding-worker] indexer exited after ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
