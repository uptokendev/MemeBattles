import fs from "node:fs";
import path from "node:path";

const CAMPAIGN = String(process.env.CERT_CAMPAIGN || process.env.BSC_CERT_CAMPAIGN || "0xECD05aC87007D5aE7a13407B59Db32B8030EAB3C");
const TOKEN_API = String(process.env.TOKEN_API_BASE || "https://memebattles-production-dca0.up.railway.app").replace(/\/+$/, "");

function fail(message: string): never {
  throw new Error(`[bsc-continuity] ${message}`);
}

async function main() {
  const evidenceFile = process.env.TOPAZ_ACCEPTANCE_INPUT || path.join("reports", "bnb-lifecycle-certification-testnet.json");
  if (!fs.existsSync(evidenceFile)) fail(`evidence file missing: ${evidenceFile}`);
  const evidence = JSON.parse(fs.readFileSync(evidenceFile, "utf8"));
  const campaign = evidence.campaign || CAMPAIGN;

  const [stateRes, tradesRes, candlesRes] = await Promise.all([
    fetch(`${TOKEN_API}/api/token/${campaign}/market-state?chainId=97`),
    fetch(`${TOKEN_API}/api/token/${campaign}/market-trades?chainId=97&limit=50`),
    fetch(`${TOKEN_API}/api/token/${campaign}/market-candles?chainId=97&resolution=1m&limit=200`),
  ]);
  const state = await stateRes.json();
  const trades = await tradesRes.json();
  const candles = await candlesRes.json();
  const items = Array.isArray(trades?.items) ? trades.items : [];
  const candleItems = Array.isArray(candles?.items) ? candles.items : [];
  const bonding = items.some((row: any) => /bond/i.test(String(row?.source || row?.venue || "")))
    || candleItems.some((row: any) => Number(row?.bonding_trade_count || 0) > 0);
  const topaz = items.some((row: any) => /topaz|dex|swap/i.test(String(row?.source || row?.venue || "")))
    || candleItems.some((row: any) => Number(row?.dex_trade_count || 0) > 0);

  if (state?.marketStage !== "TOPAZ_ACTIVE") fail(`marketStage=${state?.marketStage}`);
  if (!bonding) fail("bonding history missing from indexer trades/candles");
  if (!topaz) fail("Topaz trades missing from indexer trades/candles");
  if (!evidence.frontendBuyTx || !evidence.frontendSellTx) fail("MemeWarzone topazV2Trade BUY/SELL txs missing");
  if (!evidence.directBuyTx || !evidence.directSellTx) fail("direct router BUY/SELL txs missing");
  if (evidence.bondingBuyAfterGraduationReverted !== "Finalized") fail("bonding BUY after graduation did not revert Finalized");

  console.log("[bsc-continuity] PASS", {
    campaign,
    marketStage: state.marketStage,
    pairAddress: state.pairAddress,
    frontendBuyTx: evidence.frontendBuyTx,
    frontendSellTx: evidence.frontendSellTx,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
