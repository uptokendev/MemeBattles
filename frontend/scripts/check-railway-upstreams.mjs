import "../api/load-local-env.mjs";

const DEFAULT_FRONTEND_BASE = "https://memewarzonefrontend-production.up.railway.app";
const DEFAULT_TOKEN_BASE = "https://memebattles-production.up.railway.app";

function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

function firstEnv(names, fallback = "") {
  for (const name of names) {
    const value = normalizeUrl(process.env[name]);
    if (value) return { name, value };
  }
  return { name: "default", value: fallback };
}

const frontend = firstEnv(
  ["RAILWAY_FRONTEND_API_BASE_URL", "FRONTEND_RAILWAY_API_BASE_URL", "MEMEWARZONE_FRONTEND_API_BASE_URL", "RAILWAY_API_BASE_URL"],
  DEFAULT_FRONTEND_BASE,
);
const token = firstEnv(
  ["RAILWAY_TOKEN_API_BASE_URL", "TOKEN_RAILWAY_API_BASE_URL", "RAILWAY_INDEXER_URL"],
  DEFAULT_TOKEN_BASE,
);

const checks = [
  ["frontend", frontend, "/healthz"],
  ["frontend", frontend, "/api/campaigns?chainId=97&limit=1"],
  ["frontend", frontend, "/api/drafts?chainId=97&limit=5"],
  ["frontend", frontend, "/api/token-metadata?chainId=97&address=0x0000000000000000000000000000000000000000"],
  ["frontend", frontend, "/api/epochPools?chainId=97"],
  ["frontend", frontend, "/api/prepare-notifications?limit=1"],
  ["token", token, "/healthz"],
];

async function probe(label, upstream, path) {
  const url = `${upstream.value}${path}`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const preview = text.replace(/\s+/g, " ").slice(0, 180);
    console.log(`${label.padEnd(8)} ${String(res.status).padEnd(3)} ${path}`);
    console.log(`  base: ${upstream.value} (${upstream.name})`);
    console.log(`  type: ${res.headers.get("content-type") || "unknown"}; ${Date.now() - startedAt}ms`);
    if (preview) console.log(`  body: ${preview}`);
  } catch (error) {
    console.log(`${label.padEnd(8)} ERR ${path}`);
    console.log(`  base: ${upstream.value} (${upstream.name})`);
    console.log(`  error: ${error?.message || String(error)}`);
  }
}

console.log("Railway upstream diagnostic");
console.log(`frontend: ${frontend.value} (${frontend.name})`);
console.log(`token:    ${token.value} (${token.name})`);
console.log("");

for (const [label, upstream, path] of checks) {
  await probe(label, upstream, path);
}
