function normalizeApiBase(value: unknown): string {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  return `https://${raw}`;
}

const EXPLICIT_APP_API_BASE = normalizeApiBase(
  import.meta.env.VITE_FRONTEND_API_BASE ||
    import.meta.env.VITE_RAILWAY_FRONTEND_API_BASE ||
    import.meta.env.RAILWAY_FRONTEND_API_BASE_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_BASE ||
    import.meta.env.VITE_RAILWAY_API_BASE ||
    ""
);

const EXPLICIT_REALTIME_API_BASE = normalizeApiBase(
  import.meta.env.VITE_TOKEN_API_BASE ||
    import.meta.env.VITE_RAILWAY_TOKEN_API_BASE ||
    import.meta.env.RAILWAY_TOKEN_API_BASE_URL ||
    import.meta.env.VITE_REALTIME_API_BASE ||
    ""
);

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

export const REALTIME_API_BASE = EXPLICIT_REALTIME_API_BASE || inferLocalRealtimeApiBase();

export function buildRealtimeApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (shouldUseAppApi(normalized)) {
    return EXPLICIT_APP_API_BASE ? `${EXPLICIT_APP_API_BASE}${normalized}` : normalized;
  }

  return REALTIME_API_BASE ? `${REALTIME_API_BASE}${normalized}` : normalized;
}
