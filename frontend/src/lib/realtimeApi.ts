const EXPLICIT_REALTIME_API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "")
  .trim()
  .replace(/\/$/, "");

const NETLIFY_OWNED_API_PREFIXES = [
  // Core app / CC / draft / profile flows — must stay same-origin so Netlify /api/* proxy
  // sends them to the memewarzonefrontend Railway service (not the memebattles realtime-indexer).
  "/api/activity",
  "/api/airdrops",
  "/api/attribution",
  "/api/auth",
  "/api/campaigns",           // CC / list contexts
  "/api/drafts",
  "/api/follows",
  "/api/internal/rewards",
  "/api/prepare",
  "/api/prepare-notifications",
  "/api/profile",
  "/api/profileCabinet",
  "/api/recruiter-routing",
  "/api/recruiter-signup",
  "/api/recruiters",
  "/api/rewards/me",
  "/api/routing",
  "/api/squads",
  "/internal/rewards",
];

function isLoopbackHost(hostname: string): boolean {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function inferLocalRealtimeApiBase(): string {
  if (typeof window === "undefined") return "";

  try {
    const { protocol, hostname } = window.location;
    if (!isLoopbackHost(hostname)) return "";
    return `${protocol}//${hostname}:3000`;
  } catch {
    return "";
  }
}

function shouldUseSameOriginApi(path: string): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return NETLIFY_OWNED_API_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export const REALTIME_API_BASE = EXPLICIT_REALTIME_API_BASE || inferLocalRealtimeApiBase();

export function buildRealtimeApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;

  // Railway/indexer-only routes may use VITE_REALTIME_API_BASE, but app-owned
  // frontend APIs should stay same-origin so Vite/Netlify can proxy them locally
  // and Railway can serve them under the unified /api gateway.
  if (shouldUseSameOriginApi(normalized)) return normalized;

  return REALTIME_API_BASE ? `${REALTIME_API_BASE}${normalized}` : normalized;
}
