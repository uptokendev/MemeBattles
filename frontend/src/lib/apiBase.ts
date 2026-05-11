const EXPLICIT_API_BASE = String(
  import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_BASE ||
    ""
)
  .trim()
  .replace(/\/$/, "");

const EXPLICIT_REALTIME_API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "")
  .trim()
  .replace(/\/$/, "");

// TokenDetails / launchpad read data belongs to the realtime-indexer Railway
// service, not the frontend Railway service. Keep command-center/profile/draft
// APIs on VITE_API_BASE_URL, but route token/campaign read endpoints through
// VITE_REALTIME_API_BASE when it is configured.
const REALTIME_INDEXER_API_PREFIXES = [
  "/api/campaigns",
  "/api/featured",
  "/api/league",
  "/api/leaguePayouts",
  "/api/leagueRoot",
  "/api/token/",
  "/api/token-metadata",
  "/api/votes",
  "/api/vote_counts",
];

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function shouldUseRealtimeIndexer(path: string): boolean {
  return REALTIME_INDEXER_API_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) return path.startsWith(prefix);
    return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
  });
}

export function apiUrl(path: string): string {
  if (isHttpUrl(path)) return path;
  const normalized = normalizePath(path);

  if (EXPLICIT_REALTIME_API_BASE && shouldUseRealtimeIndexer(normalized)) {
    return `${EXPLICIT_REALTIME_API_BASE}${normalized}`;
  }

  return EXPLICIT_API_BASE ? `${EXPLICIT_API_BASE}${normalized}` : normalized;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}

export async function apiJson<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(String(json?.error || json?.message || `Request failed (${res.status})`));
  }
  return json as T;
}
