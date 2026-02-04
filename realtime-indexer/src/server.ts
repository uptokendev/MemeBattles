import express from "express";
import cors from "cors";
import { ENV } from "./env.js";
import { pool } from "./db.js";
import { ablyRest, tokenChannel, leagueChannel } from "./ably.js";
import { runIndexerOnce } from "./indexer.js";
import { startTelemetryReporter, type TelemetrySnapshot } from "./telemetry.js";
import type { Request, Response, NextFunction, RequestHandler } from "express";

const app = express();

// ---------------------------------------------------------------------------
// Minimal in-process metrics (safe to expose)
// ---------------------------------------------------------------------------
let reqCount1m = 0;
let errCount1m = 0;

setInterval(() => {
  reqCount1m = 0;
  errCount1m = 0;
}, 60_000);

app.use((req, res, next) => {
  reqCount1m++;
  res.on("finish", () => {
    if (res.statusCode >= 500) errCount1m++;
  });
  next();
});

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "https://upmeme.vercel.app",
  "https://meme-battles.vercel.app",
]);

function isAllowedOrigin(origin?: string) {
  if (!origin) return true; // allow non-browser (curl, server-to-server)
  if (allowedOrigins.has(origin)) return true;

  // Allow Vercel preview deployments for this project:
  // e.g. https://upmeme-git-somebranch-uptokendev.vercel.app
  // If you have a custom pattern, adjust as needed.
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host.endsWith(".vercel.app") && (host.includes("upmeme") || host.includes("meme-battles"))) {
      return true;
    }
    if (host.includes("meme-battles")) return true;
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

// Extremely lightweight health (no DB). Safe for frequent monitoring.
app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

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
 *
 * TokenDetails (per-campaign): /api/ably/token?chainId=97&campaign=0x...
 * League (global):             /api/ably/token?chainId=97&scope=league
 */
app.get("/api/ably/token", async (req, res) => {
  try {
    const chainId = Number(req.query.chainId || 97);
    const scope = String(req.query.scope || "token");

    if (scope === "league") {
      const channel = leagueChannel(chainId);
      const capability = { [channel]: ["subscribe"] };

      const tokenRequest = await ablyRest.auth.createTokenRequest({
        clientId: "public",
        capability: JSON.stringify(capability),
        ttl: 60 * 60 * 1000, // 1 hour
      });

      return res.json(tokenRequest);
    }

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
      ttl: 60 * 60 * 1000, // 1 hour
    });

    return res.json(tokenRequest);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
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


// ---------------------------------------------
// UP Only League (objective leaderboards)
// ---------------------------------------------
// /api/league?chainId=97&category=straight_up|fastest_graduation|largest_buy&period=weekly|monthly|all_time&limit=50
app.get("/api/league", wrap(async (req, res) => {
  const chainId = Number(req.query.chainId || 97);
  const category = String(req.query.category || "fastest_graduation");
  const period = String(req.query.period || "weekly");
  const limit = Math.min(Number(req.query.limit || 50), 200);

  const periodFilterCampaign =
    period === "monthly"
      ? "c.graduated_at_chain >= date_trunc('month', now()) and c.graduated_at_chain < date_trunc('month', now()) + interval '1 month'"
      : period === "weekly"
      ? "c.graduated_at_chain >= date_trunc('week', now()) and c.graduated_at_chain < date_trunc('week', now()) + interval '1 week'"
      : "true";

  const periodFilterTrades =
    period === "monthly"
      ? "t.block_time >= date_trunc('month', now()) and t.block_time < date_trunc('month', now()) + interval '1 month'"
      : period === "weekly"
      ? "t.block_time >= date_trunc('week', now()) and t.block_time < date_trunc('week', now()) + interval '1 week'"
      : "true";

  if (category === "largest_buy") {
    // Largest single buy tx during bonding (measured in BNB, excludes creator/feeRecipient/campaign)
    const r = await pool.query(
      `select
         t.campaign_address,
         c.name,
         c.symbol,
         c.logo_uri,
         c.creator_address,
         c.fee_recipient_address,
         t.wallet as buyer_address,
         t.bnb_amount_raw as bnb_amount_raw,
         t.tx_hash,
         t.log_index,
         t.block_number,
         t.block_time
       from public.curve_trades t
       join public.campaigns c
         on c.chain_id=t.chain_id and c.campaign_address=t.campaign_address
       where t.chain_id=$1
         and t.side='buy'
         and ${periodFilterTrades}
         and lower(t.wallet) <> lower(c.creator_address)
         and (c.fee_recipient_address is null or lower(t.wallet) <> lower(c.fee_recipient_address))
         and lower(t.wallet) <> lower(c.campaign_address)
       order by (t.bnb_amount_raw::numeric) desc, t.block_number desc, t.log_index desc
       limit $2`,
      [chainId, limit]
    );

    return res.json({ chainId, category, period, items: r.rows });
  }

  const requireUniqueBuyers = category === "fastest_graduation";
  const extra: string[] = [];
  if (requireUniqueBuyers) extra.push("coalesce(s.unique_buyers,0) >= 25");
  if (category === "straight_up") extra.push("coalesce(s.sells_count,0) = 0");
  const extraWhere = extra.length ? `and ${extra.join(" and ")}` : "";

  const r = await pool.query(
    `with stats as (
       select
         t.chain_id,
         t.campaign_address,
         count(distinct case when t.side='buy' then t.wallet end) as unique_buyers,
         sum(case when t.side='sell' then 1 else 0 end) as sells_count,
         sum(case when t.side='buy' then (t.bnb_amount_raw::numeric) else 0 end) as buy_volume_raw
       from public.curve_trades t
       where t.chain_id=$1
       group by t.chain_id, t.campaign_address
     )
     select
       c.campaign_address,
       c.creator_address,
       c.fee_recipient_address,
       c.token_address,
       c.name,
       c.symbol,
       c.logo_uri,
       c.created_at_chain,
       c.graduated_at_chain,
       c.graduated_block,
       coalesce(s.unique_buyers,0)::int as unique_buyers,
       coalesce(s.sells_count,0)::int as sells_count,
       coalesce(s.buy_volume_raw,0)::text as buy_volume_raw,
       extract(epoch from (c.graduated_at_chain - c.created_at_chain))::bigint as duration_seconds
     from public.campaigns c
     left join stats s
       on s.chain_id=c.chain_id and s.campaign_address=c.campaign_address
     where c.chain_id=$1
       and c.created_at_chain is not null
       and c.graduated_at_chain is not null
       and ${periodFilterCampaign}
       ${extraWhere}
     order by duration_seconds asc nulls last, c.graduated_at_chain asc
     limit $2`,
    [chainId, limit]
  );

  return res.json({ chainId, category, period, items: r.rows });
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

// ---------------------------------------------
// Votes + Featured
// ---------------------------------------------

// /api/votes?chainId=97&campaignAddress=0x..&voter=0x..&limit=50
app.get("/api/votes", wrap(async (req, res) => {
  const chainId = Number(req.query.chainId || 97);
  const campaign = String(req.query.campaignAddress || "").toLowerCase();
  const voter = String(req.query.voter || "").toLowerCase();
  const limit = Math.min(Number(req.query.limit || 50), 200);

  const where: string[] = ["chain_id=$1", "status='confirmed'"];
  const params: any[] = [chainId];
  let p = 2;

  if (campaign) {
    where.push(`campaign_address=$${p++}`);
    params.push(campaign);
  }
  if (voter) {
    where.push(`voter_address=$${p++}`);
    params.push(voter);
  }

  const r = await pool.query(
    `select
       chain_id,campaign_address,voter_address,asset_address,amount_raw,
       tx_hash,log_index,block_number,block_timestamp,meta
     from public.votes
     where ${where.join(" and ")}
     order by block_number desc, log_index desc
     limit $${p}`,
    [...params, limit]
  );

  res.json(r.rows);
}));

// /api/featured?chainId=97&sort=trending|24h|7d|all&limit=50
app.get("/api/featured", wrap(async (req, res) => {
  const chainId = Number(req.query.chainId || 97);
  const sort = String(req.query.sort || "trending");
  const limit = Math.min(Number(req.query.limit || 50), 200);

  const orderBy =
    sort === "24h" ? "votes_24h desc" :
    sort === "7d" ? "votes_7d desc" :
    sort === "all" ? "votes_all_time desc" :
    "trending_score desc";

  const r = await pool.query(
    `select
       chain_id,campaign_address,
       votes_1h,votes_24h,votes_7d,votes_all_time,
       trending_score,last_vote_at,updated_at
     from public.vote_aggregates
     where chain_id=$1
     order by ${orderBy}, campaign_address asc
     limit $2`,
    [chainId, limit]
  );

  res.json(r.rows);
}));
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("API error:", err);
  res.status(500).json({ ok: false, error: err?.message || String(err) });
});
// Start server (Railway requires 0.0.0.0:PORT) :contentReference[oaicite:1]{index=1}
app.listen(ENV.PORT, "0.0.0.0", () => {
  console.log(`realtime-indexer listening on 0.0.0.0:${ENV.PORT}`);
});

// ---------------------------------------------------------------------------
// Telemetry snapshot (optional)
// ---------------------------------------------------------------------------
let lastIndexerRunAt = 0;
let lastIndexerErrorAt = 0;
let lastIndexerErrorMsg: string | null = null;

async function getLastIndexedBlock(chainId: number): Promise<number | null> {
  try {
    const r = await pool.query(
      `select cursor,last_indexed_block from public.indexer_state where chain_id=$1 and cursor in ('factory','votes')`,
      [chainId]
    );
    if (!r.rowCount) return null;
    // Conservative: take min of known cursors so lag isn't understated
    const vals = r.rows.map((x: any) => Number(x.last_indexed_block)).filter((n: any) => Number.isFinite(n));
    if (!vals.length) return null;
    return Math.min(...vals);
  } catch {
    return null;
  }
}

async function getRpcHeadBlock(): Promise<number | null> {
  const first = String(ENV.BSC_RPC_HTTP_97 || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)[0];
  if (!first) return null;
  try {
    const body = { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] };
    const resp = await fetch(first, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    const j: any = await resp.json();
    const hex = j?.result;
    if (typeof hex !== "string" || !hex.startsWith("0x")) return null;
    return parseInt(hex, 16);
  } catch {
    return null;
  }
}

startTelemetryReporter(async () => {
  const ts = Math.floor(Date.now() / 1000);
  const head = await getRpcHeadBlock();
  const last = await getLastIndexedBlock(97);
  const lag = head != null && last != null ? Math.max(0, head - last) : null;

  const snap: TelemetrySnapshot = {
    service: "realtime-indexer",
    ts,
    ok: true,
    rps_1m: reqCount1m / 60,
    errors_1m: errCount1m,
    head_block: head ?? undefined,
    last_indexed_block: last ?? undefined,
    lag_blocks: lag ?? undefined,
    last_indexer_run_ms_ago: lastIndexerRunAt ? Date.now() - lastIndexerRunAt : undefined,
    last_indexer_error_ms_ago: lastIndexerErrorAt ? Date.now() - lastIndexerErrorAt : undefined,
  };

  // If we have a recent error, mark ok=false but keep reporting.
  if (lastIndexerErrorAt && Date.now() - lastIndexerErrorAt < 5 * 60_000) {
    snap.ok = false;
  }

  return snap;
});

// Indexer loop
// NOTE: Keep this conservative for public RPCs. We also avoid overlap.
let running = false;
const INTERVAL_MS = ENV.INDEXER_INTERVAL_MS;

setInterval(async () => {
  if (running) return;
  running = true;
  try {
    lastIndexerRunAt = Date.now();
    await runIndexerOnce();
  } catch (e) {
    console.error("indexer loop error", e);
    lastIndexerErrorAt = Date.now();
    lastIndexerErrorMsg = String((e as any)?.message || e);
  } finally {
    running = false;
  }
}, INTERVAL_MS);
