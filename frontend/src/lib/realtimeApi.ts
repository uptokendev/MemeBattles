function normalizeApiBase(value: unknown): string {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  return `https://${raw}`;
}

function looksLikeIndexerBase(url: string): boolean {
  const host = String(url || "").toLowerCase();
  return (
    host.includes("memebattles-production") ||
    host.includes("memewarzone-production") ||
    host.includes("-dca0") ||
    host.includes("indexer") ||
    host.includes("realtime-indexer")
  );
}

// Never use VITE_API_BASE here — that is the indexer in production.
const EXPLICIT_APP_API_BASE = (() => {
  for (const candidate of [
    import.meta.env.VITE_FRONTEND_API_BASE,
    import.meta.env.VITE_RAILWAY_FRONTEND_API_BASE,
    import.meta.env.RAILWAY_FRONTEND_API_BASE_URL,
  ]) {
    const normalized = normalizeApiBase(candidate);
    if (normalized && !looksLikeIndexerBase(normalized)) return normalized;
  }
  return "";
})();

const EXPLICIT_REALTIME_API_BASE = (() => {
  for (const candidate of [
    import.meta.env.VITE_TOKEN_API_BASE,
    import.meta.env.VITE_RAILWAY_TOKEN_API_BASE,
    import.meta.env.RAILWAY_TOKEN_API_BASE_URL,
    import.meta.env.VITE_REALTIME_API_BASE,
    import.meta.env.VITE_API_BASE,
    import.meta.env.VITE_API_BASE_URL,
  ]) {
    const normalized = normalizeApiBase(candidate);
    if (normalized) return normalized;
  }
  return "";
})();

const NETLIFY_OWNED_API_PREFIXES = [
  "/api/activity",
  "/api/airdrops",
  "/api/attribution",
  "/api/drafts",
  "/api/auth",
  "/api/prepare",
  "/api/recruiter-routing",
  "/api/recruiter-signup",
  "/api/recruiters",
  "/api/rewards",
  "/api/rewards/me",
  "/api/routing",
  "/api/squads",
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

function shouldUseAppApi(path: string): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return NETLIFY_OWNED_API_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function shouldUseLocalApiGateway(path: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (!isLoopbackHost(window.location.hostname)) return false;
  } catch {
    return false;
  }
  return path === "/api" || path.startsWith("/api/") || path === "/internal" || path.startsWith("/internal/");
}

export const REALTIME_API_BASE = EXPLICIT_REALTIME_API_BASE || inferLocalRealtimeApiBase();

export function buildRealtimeApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (shouldUseLocalApiGateway(normalized)) {
    return normalized;
  }

  if (shouldUseAppApi(normalized)) {
    return EXPLICIT_APP_API_BASE ? `${EXPLICIT_APP_API_BASE}${normalized}` : normalized;
  }

  return REALTIME_API_BASE ? `${REALTIME_API_BASE}${normalized}` : normalized;
}
