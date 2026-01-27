import express from "express";
import cors from "cors";
import { ENV } from "./env.js";
import { pool } from "./db.js";
import { ablyRest, tokenChannel } from "./ably.js";
import { runIndexerOnce } from "./indexer.js";
import type { Request, Response, NextFunction, RequestHandler } from "express";

const app = express();

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "https://upmeme.vercel.app",
]);

function isAllowedOrigin(origin?: string) {
  if (!origin) return true; // allow non-browser (curl, server-to-server)
  if (allowedOrigins.has(origin)) return true;

  // Allow Vercel preview deployments for this project:
  // e.g. https://upmeme-git-somebranch-uptokendev.vercel.app
  // If you have a custom pattern, adjust as needed.
  try {
    const u = new URL(origin);
    if (u.hostname.endsWith(".vercel.app") && u.hostname.includes("upmeme")) return true;
  } catch {
    // ignore invalid origin
  }

  return false;
}

app.use(
  cors({
    origin: (origin, cb) => {
      cb(null, isAllowedOrigin(origin));
    },
    credentials: false,
  })
);
app.options("*", cors());
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
      // IMPORTANT: clientId MUST be stable across re-auth on an existing connection.
      // Using a random clientId triggers Ably 40102 (mismatched clientId).
      clientId: "public",
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
app.get("/api/token/:campaign/summary", wrap(async (req, res) => {
  const campaign = String(req.params.campaign || "").toLowerCase();
  const chainId = Number(req.query.chainId || 97);

  const r = await pool.query(
    `select * from public.token_stats where chain_id=$1 and campaign_address=$2`,
    [chainId, campaign]
  );
  res.json(r.rows[0] || null);
}));

app.get("/api/token/:campaign/trades", wrap(async (req, res) => {
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
}));

app.get("/api/token/:campaign/candles", wrap(async (req, res) => {
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

  res.json(r.rows.reverse());
}));
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("API error:", err);
  res.status(500).json({ ok: false, error: err?.message || String(err) });
});
// Start server (Railway requires 0.0.0.0:PORT) :contentReference[oaicite:1]{index=1}
app.listen(ENV.PORT, "0.0.0.0", () => {
  console.log(`realtime-indexer listening on 0.0.0.0:${ENV.PORT}`);
});

// Indexer loop
// NOTE: Keep this conservative for public RPCs. We also avoid overlap.
let running = false;
const INTERVAL_MS = ENV.INDEXER_INTERVAL_MS;

setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await runIndexerOnce();
  } catch (e) {
    console.error("indexer loop error", e);
  } finally {
    running = false;
  }
}, INTERVAL_MS);
