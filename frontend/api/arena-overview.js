import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

function mapCampaign(row) {
  return {
    campaignAddress: String(row.campaign_address || "").toLowerCase(),
    tokenAddress: row.token_address ? String(row.token_address).toLowerCase() : null,
    creatorAddress: row.creator_address ? String(row.creator_address).toLowerCase() : null,
    name: row.name || "Unknown",
    symbol: row.symbol || "",
    logoUri: row.logo_uri || "/placeholder.svg",
    marketcapBnb: row.marketcap_bnb != null ? String(row.marketcap_bnb) : null,
    vol24hBnb: row.vol_24h_bnb != null ? String(row.vol_24h_bnb) : null,
    votes24h: row.votes_24h != null ? Number(row.votes_24h) : 0,
    votesAllTime: row.votes_all_time != null ? Number(row.votes_all_time) : 0,
    createdAtChain: row.created_at_chain ? String(row.created_at_chain) : null,
  };
}

async function loadSponsored(chainId) {
  try {
    const { rows } = await pool.query(
      `select
         c.campaign_address,
         c.token_address,
         c.creator_address,
         c.name,
         c.symbol,
         c.logo_uri,
         c.created_at_chain,
         ts.marketcap_bnb,
         ts.vol_24h_bnb
       from public.sponsored_campaigns sc
       join public.campaigns c
         on c.chain_id = sc.chain_id
        and c.campaign_address = sc.campaign_address
       left join public.token_stats ts
         on ts.chain_id = c.chain_id
        and ts.campaign_address = c.campaign_address
       where sc.chain_id = $1
         and coalesce(sc.is_active, true) = true
       order by coalesce(sc.priority, 0) desc, sc.created_at desc
       limit 8`,
      [chainId],
    );
    return rows.map(mapCampaign);
  } catch (error) {
    console.warn("[api/arena-overview] sponsored feed unavailable", error);
    return [];
  }
}

async function loadFeatured(chainId) {
  const { rows } = await pool.query(
    `select
       c.campaign_address,
       c.token_address,
       c.creator_address,
       c.name,
       c.symbol,
       c.logo_uri,
       c.created_at_chain,
       ts.marketcap_bnb,
       ts.vol_24h_bnb,
       va.votes_24h,
       va.votes_all_time
     from public.vote_aggregates va
     join public.campaigns c
       on c.chain_id = va.chain_id
      and c.campaign_address = va.campaign_address
     left join public.token_stats ts
       on ts.chain_id = c.chain_id
      and ts.campaign_address = c.campaign_address
     where va.chain_id = $1
       and c.graduated_at_chain is null
     order by coalesce(va.votes_24h, 0) desc, coalesce(va.votes_all_time, 0) desc, c.created_block desc nulls last
     limit 10`,
    [chainId],
  );

  return rows.map(mapCampaign);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 97);
    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });

    const [sponsored, featured] = await Promise.all([loadSponsored(chainId), loadFeatured(chainId)]);

    return json(res, 200, {
      sponsored,
      featured,
      liveBattles: [],
      openForBattle: [],
      eventsAndLeagues: [
        {
          id: "league-fastest-finish",
          label: "Fastest Finish",
          href: "/arena/leagues",
          status: "Live",
          meta: "Real standings live under Leagues.",
        },
        {
          id: "league-crowd-favorite",
          label: "Crowd Favorite",
          href: "/arena/leagues",
          status: "Live",
          meta: "UpVote-driven leaderboard is now the source of truth.",
        },
        {
          id: "events-hub",
          label: "Events Hub",
          href: "/arena/events",
          status: "Soon",
          meta: "Active and upcoming event cards land in the Events page.",
        },
      ],
      updatedAt: new Date().toISOString(),
      warning: "Battle and event runtime feeds are still being connected; featured and league links are live now.",
    });
  } catch (error) {
    console.error("[api/arena-overview]", error);
    return json(res, 200, {
      sponsored: [],
      featured: [],
      liveBattles: [],
      openForBattle: [],
      eventsAndLeagues: [],
      updatedAt: new Date().toISOString(),
      warning: "Arena overview feed is temporarily unavailable.",
    });
  }
}
