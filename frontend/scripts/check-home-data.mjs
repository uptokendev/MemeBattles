import "../api/load-local-env.mjs";
import { pool } from "../server/db.js";

const chainId = Number(process.env.CHAIN_ID || process.env.VITE_DEFAULT_CHAIN_ID || 97);
const apiBase = String(process.env.LOCAL_API_BASE || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");

async function getJson(path) {
  const url = `${apiBase}${path}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { parseError: text.slice(0, 160) };
    }
    return { url, ok: res.ok, status: res.status, body };
  } catch (error) {
    return { url, ok: false, status: 0, body: { error: error?.message || String(error) } };
  }
}

async function count(label, sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    const rows = result.rows || [];
    console.log(`\n${label}`);
    console.table(rows);
    return rows;
  } catch (error) {
    console.log(`\n${label}`);
    console.error(error?.message || String(error));
    return [];
  }
}

function summarizeEndpoint(name, result) {
  const items = Array.isArray(result.body?.items) ? result.body.items : null;
  console.log(`\n${name}`);
  console.log(`${result.status} ${result.url}`);
  if (!result.ok) {
    console.dir(result.body, { depth: 4 });
    return;
  }
  if (items) {
    console.log(`items: ${items.length}`);
    if (items[0]) console.dir(items[0], { depth: 2 });
  } else {
    console.dir(result.body, { depth: 4 });
  }
}

console.log("MemeWarzone local home data check");
console.log(`chainId: ${chainId}`);
console.log(`apiBase: ${apiBase}`);

await count(
  "campaigns by status",
  `select
     count(*)::int as total,
     count(*) filter (where is_active = true)::int as live,
     count(*) filter (where graduated_at_chain is not null)::int as graduated,
     count(*) filter (where is_active = false and graduated_at_chain is null)::int as ended
   from public.campaigns
   where chain_id = $1`,
  [chainId]
);

await count(
  "featured candidates",
  `select
     count(*)::int as vote_aggregate_rows,
     count(*) filter (where c.campaign_address is not null and c.graduated_at_chain is null)::int as joined_live_candidates
   from public.vote_aggregates va
   left join public.campaigns c
     on c.chain_id = va.chain_id
    and c.campaign_address = va.campaign_address
   where va.chain_id = $1`,
  [chainId]
);

await count(
  "drafts by visibility/status",
  `select
     visibility,
     status,
     count(*)::int as count
   from public.campaign_drafts
   where chain_id = $1
   group by visibility, status
   order by visibility, status`,
  [chainId]
);

await count(
  "public discoverable drafts",
  `select
     count(*)::int as count
   from public.campaign_drafts
   where chain_id = $1
     and visibility = 'public'
     and status = any($2::text[])`,
  [chainId, ["promotion_published", "ready_to_launch", "scheduled"]]
);

const health = await getJson("/healthz");
summarizeEndpoint("GET /healthz", health);

const featured = await getJson(`/api/featured?chainId=${chainId}&sort=activity&limit=20`);
summarizeEndpoint("GET /api/featured", featured);

const campaigns = await getJson(`/api/campaigns?chainId=${chainId}&limit=24&tab=trending&sort=default&status=all`);
summarizeEndpoint("GET /api/campaigns", campaigns);

const drafts = await getJson(`/api/drafts?chainId=${chainId}&limit=50`);
summarizeEndpoint("GET /api/drafts", drafts);

console.log("\nInterpretation:");
console.log("- featured needs rows in vote_aggregates joined to non-graduated campaigns.");
console.log("- campaign grid needs rows in campaigns for the selected chainId.");
console.log("- draft grid only shows visibility=public and status in promotion_published, ready_to_launch, scheduled.");
console.log("- If DB counts are non-zero but API items are zero, we debug route logic. If DB counts are zero, the missing batch/seed/indexer data is the cause.");

await pool.end().catch(() => {});
