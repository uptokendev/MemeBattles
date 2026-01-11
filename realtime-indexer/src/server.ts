import express from "express";
import cors from "cors";
import { ENV } from "./env.js";
import { pool } from "./db.js";
import { ablyRest, tokenChannel } from "./ably.js";
import { runIndexerOnce } from "./indexer.js";

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://upmeme.vercel.app"
  ],
  credentials: false
}));

app.get("/health", async (_req, res) => {
  try {
    const r = await pool.query("select 1 as ok");
    res.json({ ok: true, db: r.rows[0].ok });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * Ably token auth endpoint
 * Request: /api/ably/token?chainId=97&campaign=0x...
 * Issues a TokenRequest limited to subscribe on that token’s channel.
 */
app.get("/api/ably/token", async (req, res) => {
  try {
    const chainId = Number(req.query.chainId || 97);
    const campaign = String(req.query.campaign || "").toLowerCase();

    if (!/^0x[a-f0-9]{40}$/.test(campaign)) {
      return res.status(400).json({ error: "Invalid campaign address" });
    }

    const channel = tokenChannel(chainId, campaign);
    const capability = { [channel]: ["subscribe"] };

    const tokenRequest = await ablyRest.auth.createTokenRequest({
      clientId: `anon-${Math.random().toString(16).slice(2)}`,
      capability: JSON.stringify(capability),
      ttl: 60 * 60 * 1000 // 1 hour
    });

    res.json(tokenRequest);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/**
 * Snapshot endpoints for TokenDetails
 */
app.get("/api/token/:campaign/summary", async (req, res) => {
  const campaign = String(req.params.campaign || "").toLowerCase();
  const chainId = Number(req.query.chainId || 97);

  const r = await pool.query(
    `select * from public.token_stats where chain_id=$1 and campaign_address=$2`,
    [chainId, campaign]
  );
  res.json(r.rows[0] || null);
});

app.get("/api/token/:campaign/trades", async (req, res) => {
  const campaign = String(req.params.campaign || "").toLowerCase();
  const chainId = Number(req.query.chainId || 97);
  const limit = Math.min(Number(req.query.limit || 50), 200);

  const r = await pool.query(
    `select
       tx_hash, log_index, block_number, block_time,
       side, wallet, token_amount, bnb_amount, price_bnb
     from public.curve_trades
     where chain_id=$1 and campaign_address=$2
     order by block_number desc, log_index desc
     limit $3`,
    [chainId, campaign, limit]
  );

  res.json(r.rows);
});

app.get("/api/token/:campaign/candles", async (req, res) => {
  const campaign = String(req.params.campaign || "").toLowerCase();
  const chainId = Number(req.query.chainId || 97);
  const tf = String(req.query.tf || "5s");
  const limit = Math.min(Number(req.query.limit || 200), 2000);

  const r = await pool.query(
    `select bucket_start, o,h,l,c,volume_bnb,trades_count
     from public.token_candles
     where chain_id=$1 and campaign_address=$2 and timeframe=$3
     order by bucket_start desc
     limit $4`,
    [chainId, campaign, tf, limit]
  );

  // Return ascending for chart
  res.json(r.rows.reverse());
});

// Start server (Railway requires 0.0.0.0:PORT) :contentReference[oaicite:1]{index=1}
app.listen(ENV.PORT, "0.0.0.0", () => {
  console.log(`realtime-indexer listening on 0.0.0.0:${ENV.PORT}`);
});

// Indexer loop (MVP)
// For “hot tokens” we’ll tune batching and concurrency after this is stable.
setInterval(async () => {
  try {
    await runIndexerOnce();
  } catch (e) {
    console.error("indexer loop error", e);
  }
}, 3000);
