const EXPLICIT_REALTIME_API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "")
  .trim()
  .replace(/\/$/, "");

const NETLIFY_OWNED_API_PREFIXES = [
  "/api/airdrops",
  "/api/attribution",
  "/api/drafts",
  "/api/internal/rewards",
  "/api/prepare",
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

  // Railway still owns legacy realtime/indexer-style routes when VITE_REALTIME_API_BASE
  // is configured, but reward/recruiter/squad/Prepare Mode APIs live on the Netlify
  // API function. Keep those same-origin so they do not 404 on Railway.
  if (shouldUseSameOriginApi(normalized)) return normalized;

  return REALTIME_API_BASE ? `${REALTIME_API_BASE}${normalized}` : normalized;
}
