import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

// LaunchFactory default graduation target is 50 BNB (see contracts/LaunchFactory.sol).
// Campaigns can override this, but until we persist per-campaign targets in DB,
// we treat this as the system default for progress/ETA on the homepage.
const DEFAULT_GRAD_TARGET_BNB = 50;

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toFloat(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeTab(v) {
  const t = String(v || "trending").toLowerCase();
  return t === "new" || t === "ending" || t === "dex" ? t : "trending";
}

function normalizeSort(v) {
  const s = String(v || "default").toLowerCase();
  return [
    "default",
    "created_desc",
    "created_asc",
    "mcap_desc",
    "mcap_asc",
    "votes_desc",
    "progress_desc",
  ].includes(s)
    ? s
    : "default";
}

function normalizeStatus(v) {
  const s = String(v || "all").toLowerCase();
  return s === "live" || s === "graduated" || s === "ended" ? s : "all";
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);

    const chainId = toInt(q.chainId, 97);
    const limit = clamp(toInt(q.limit, 24), 1, 50);
    const cursor = clamp(toInt(q.cursor, 0), 0, 1_000_000); // offset-based pagination

    const tab = normalizeTab(q.tab);
    const sort = normalizeSort(q.sort);
    const status = normalizeStatus(q.status);

    // Contract rule:
    // - /api/campaigns defaults to "all"
    // - "Ending Soon" is always Live-only
    // - "Trading on DEX" is always Graduated-only
    const effectiveStatus =
      tab === "ending" ? "live" : tab === "dex" ? "graduated" : status;
    const searchRaw = String(q.search || "").trim();
    const search = searchRaw ? `%${searchRaw}%` : null;

    // Optional filters
    const bnbUsd = Number.isFinite(Number(q.bnbUsd)) ? toFloat(q.bnbUsd, NaN) : null;
    const mcapMinUsd = Number.isFinite(Number(q.mcapMinUsd)) ? toFloat(q.mcapMinUsd, NaN) : null;
    const mcapMaxUsd = Number.isFinite(Number(q.mcapMaxUsd)) ? toFloat(q.mcapMaxUsd, NaN) : null;
    const progressMinPct = Number.isFinite(Number(q.progressMinPct)) ? toFloat(q.progressMinPct, NaN) : null;
    const progressMaxPct = Number.isFinite(Number(q.progressMaxPct)) ? toFloat(q.progressMaxPct, NaN) : null;

    const gradTargetBnb = clamp(toFloat(q.gradTargetBnb, DEFAULT_GRAD_TARGET_BNB), 0.0001, 10_000);

    // Deterministic ordering per tab/sort.
    const orderBy = (() => {
      if (sort === "created_desc") return "c.created_block desc, c.campaign_address asc";
      if (sort === "created_asc") return "c.created_block asc, c.campaign_address asc";
      if (sort === "mcap_desc") return "coalesce(ts.marketcap_bnb, 0) desc, c.created_block desc, c.campaign_address asc";
      if (sort === "mcap_asc") return "coalesce(ts.marketcap_bnb, 0) asc, c.created_block desc, c.campaign_address asc";
      if (sort === "votes_desc") return "coalesce(va.votes_24h, 0) desc, c.created_block desc, c.campaign_address asc";
      if (sort === "progress_desc") return "coalesce(calc.progress_pct, -1) desc, c.created_block desc, c.campaign_address asc";

      // Tab defaults
      if (tab === "new") return "c.created_block desc, c.campaign_address asc";
      if (tab === "ending") return "calc.eta_sec asc nulls last, calc.progress_pct desc nulls last, c.created_block desc, c.campaign_address asc";
      if (tab === "dex") return "c.graduated_block desc nulls last, c.created_block desc, c.campaign_address asc";

      // trending default
      return "calc.trending_score desc nulls last, c.created_block desc, c.campaign_address asc";
    })();

    const sql = `
      with base as (
        select
          c.chain_id,
          c.campaign_address,
          c.token_address,
          c.creator_address,
          c.name,
          c.symbol,
          c.logo_uri,
          c.created_block,
          c.created_at_chain,
          c.graduated_block,
          c.graduated_at_chain,
          c.is_active,
          ts.last_price_bnb,
          ts.sold_tokens,
          ts.marketcap_bnb,
          ts.vol_24h_bnb,
          va.votes_24h,
          va.votes_total,
          va.velocity_10m
        from public.campaigns c
        left join public.token_stats ts
          on ts.chain_id = c.chain_id and ts.campaign_address = c.campaign_address
        left join public.vote_aggregates va
          on va.chain_id = c.chain_id and va.campaign_address = c.campaign_address
        where c.chain_id = $1
          and ($3::text is null or (
            c.name ilike $3
            or c.symbol ilike $3
            or c.campaign_address::text ilike $3
          ))
          and (
            $4::text = 'all'
            or ($4::text = 'live' and c.is_active = true)
            or ($4::text = 'graduated' and c.graduated_at_chain is not null)
            or ($4::text = 'ended' and c.is_active = false and c.graduated_at_chain is null)
          )
          and (
            $5::text <> 'dex'
            or c.graduated_at_chain is not null
          )
      ),
      rt as (
        select
          b.chain_id,
          b.campaign_address,
          coalesce(
            sum(case when t.side = 'buy' then t.bnb_amount else -t.bnb_amount end)
            ,0
          ) as raised_total_bnb,
          coalesce(
            sum(case when t.side = 'buy' then t.bnb_amount else -t.bnb_amount end)
              filter (where t.block_time >= now() - interval '10 minutes')
            ,0
          ) as raised_10m_bnb
        from base b
        left join public.curve_trades t
          on t.chain_id = b.chain_id and t.campaign_address = b.campaign_address
        group by b.chain_id, b.campaign_address
      ),
      calc as (
        select
          b.*,
          rt.raised_total_bnb,
          rt.raised_10m_bnb,
          case
            when $2::numeric <= 0 then null
            else least(100, greatest(0, (rt.raised_total_bnb / $2::numeric) * 100))
          end as progress_pct,
          case
            when rt.raised_total_bnb >= $2::numeric then 0
            when rt.raised_10m_bnb <= 0 then null
            else (
              ($2::numeric - rt.raised_total_bnb)
              / (rt.raised_10m_bnb / 600.0)
            )
          end as eta_sec,
          (
            coalesce(b.vol_24h_bnb, 0) * 1000
            + coalesce(b.votes_24h, 0) * 10
            + coalesce(b.velocity_10m, 0) * 100
          ) as trending_score
        from base b
        join rt
          on rt.chain_id = b.chain_id and rt.campaign_address = b.campaign_address
      )
      select *
      from calc
      where 1=1
        and (
          $9::numeric is null
          or calc.progress_pct >= $9::numeric
        )
        and (
          $10::numeric is null
          or calc.progress_pct <= $10::numeric
        )
        and (
          $6::numeric is null
          or $7::numeric is null
          or (calc.marketcap_bnb is not null and (calc.marketcap_bnb * $6::numeric) >= $7::numeric)
        )
        and (
          $6::numeric is null
          or $8::numeric is null
          or (calc.marketcap_bnb is not null and (calc.marketcap_bnb * $6::numeric) <= $8::numeric)
        )
      order by ${orderBy}
      offset $11
      limit $12
    `;

    const r = await pool.query(sql, [
      chainId,
      gradTargetBnb,
      search,
      effectiveStatus,
      tab,
      bnbUsd,
      mcapMinUsd,
      mcapMaxUsd,
      progressMinPct,
      progressMaxPct,
      cursor,
      limit,
    ]);

    const items = (r.rows || []).map((row) => {
      const campaignAddress = String(row.campaign_address ?? "").toLowerCase();
      const graduatedAt = row.graduated_at_chain ? String(row.graduated_at_chain) : null;

      return {
        chainId: Number(row.chain_id),
        campaignAddress,
        tokenAddress: row.token_address ? String(row.token_address).toLowerCase() : null,
        creatorAddress: row.creator_address ? String(row.creator_address).toLowerCase() : null,
        name: row.name ?? null,
        symbol: row.symbol ?? null,
        logoUri: row.logo_uri ?? null,
        createdAtChain: row.created_at_chain ? String(row.created_at_chain) : null,
        graduatedAtChain: graduatedAt,
        isDexTrading: Boolean(graduatedAt),

        // canonical status (useful for UI)
        isActive: Boolean(row.is_active),
        status: graduatedAt ? "graduated" : row.is_active ? "live" : "ended",

        // stats
        lastPriceBnb: row.last_price_bnb != null ? String(row.last_price_bnb) : null,
        soldTokens: row.sold_tokens != null ? String(row.sold_tokens) : null,
        marketcapBnb: row.marketcap_bnb != null ? String(row.marketcap_bnb) : null,
        vol24hBnb: row.vol_24h_bnb != null ? String(row.vol_24h_bnb) : null,
        votes24h: row.votes_24h != null ? Number(row.votes_24h) : 0,
        votesAllTime: row.votes_total != null ? Number(row.votes_total) : 0,

        // derived
        raisedTotalBnb: row.raised_total_bnb != null ? String(row.raised_total_bnb) : "0",
        raised10mBnb: row.raised_10m_bnb != null ? String(row.raised_10m_bnb) : "0",
        progressPct: row.progress_pct != null ? Number(row.progress_pct) : null,
        etaSec: row.eta_sec != null ? Number(row.eta_sec) : null,
        gradTargetBnb,
      };
    });

    const nextCursor = items.length === limit ? cursor + limit : null;

    return json(res, 200, {
      items,
      nextCursor,
      pageSize: limit,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[api/campaigns]", e);
    return json(res, 500, { error: "Server error" });
  }
}
