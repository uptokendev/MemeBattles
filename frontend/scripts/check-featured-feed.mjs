import "../api/load-local-env.mjs";

const DEFAULT_BASE = "http://127.0.0.1:3001";

function normalizeBase(raw) {
  const value = String(raw || "").trim();
  if (!value) return DEFAULT_BASE;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

function parseChainId() {
  const raw = process.env.CHECK_FEATURED_CHAIN_ID || process.env.VITE_FEATURED_FEED_CHAIN_ID || process.env.VITE_CAMPAIGN_FEED_CHAIN_ID || "97";
  const chainId = Number(raw);
  return Number.isFinite(chainId) && chainId > 0 ? chainId : 97;
}

function getItems(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.items)) return json.items;
  return [];
}

function campaignAddressOf(item) {
  return String(item?.campaignAddress ?? item?.campaign_address ?? item?.campaign ?? item?.campaign?.campaignAddress ?? "").trim().toLowerCase();
}

function summarizeItems(items) {
  const withAddress = items.filter((item) => /^0x[a-f0-9]{40}$/.test(campaignAddressOf(item))).length;
  const preview = items.slice(0, 3).map((item) => ({
    chainId: item?.chainId ?? item?.chain_id ?? item?.campaign?.chainId ?? item?.campaign?.chain_id ?? null,
    campaignAddress: campaignAddressOf(item),
    name: item?.name ?? item?.campaign?.name ?? null,
    symbol: item?.symbol ?? item?.ticker ?? item?.campaign?.symbol ?? null,
  }));

  return { count: items.length, withAddress, preview };
}

async function probe(base, path) {
  const startedAt = Date.now();
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    const items = getItems(json);
    const summary = summarizeItems(items);
    console.log(`${res.status} ${path}`);
    console.log(`  type: ${res.headers.get("content-type") || "unknown"}; ${Date.now() - startedAt}ms`);
    console.log(`  upstream: ${res.headers.get("x-mwz-api-upstream") || "none"}`);
    console.log(`  upstream path: ${res.headers.get("x-mwz-api-upstream-path") || "none"}`);
    console.log(`  fallback: ${res.headers.get("x-mwz-api-upstream-fallback") || "none"}`);
    console.log(`  items: ${summary.count}; usable campaign addresses: ${summary.withAddress}`);
    if (summary.preview.length) console.log(`  preview: ${JSON.stringify(summary.preview)}`);
    if (!json) console.log(`  body: ${text.replace(/\s+/g, " ").slice(0, 220)}`);
    return { ok: res.ok, items, summary };
  } catch (error) {
    console.log(`ERR ${path}`);
    console.log(`  error: ${error?.message || String(error)}`);
    return { ok: false, items: [], summary: { count: 0, withAddress: 0, preview: [] } };
  }
}

const base = normalizeBase(process.env.CHECK_FEATURED_BASE_URL || process.env.VITE_DEV_API_PROXY_TARGET || process.env.LOCAL_API_BASE_URL);
const chainId = parseChainId();

console.log("Featured feed diagnostic");
console.log(`base:  ${base}`);
console.log(`chain: ${chainId}`);
console.log("");

const featured = await probe(base, `/api/featured?chainId=${chainId}&sort=activity&limit=20&_r=${Date.now()}`);
console.log("");
const campaigns = await probe(base, `/api/campaigns?chainId=${chainId}&limit=20&tab=trending&sort=default&status=all&_r=${Date.now()}`);

console.log("");
if (featured.summary.withAddress > 0) {
  console.log("Featured feed has usable campaign rows.");
} else if (campaigns.summary.withAddress > 0) {
  console.log("Featured feed is empty/unusable, but campaign fallback has usable rows. The UI should render fallback campaign rows.");
} else {
  console.log("Neither featured nor campaign fallback returned usable campaign rows for this chain.");
  process.exitCode = 1;
}
