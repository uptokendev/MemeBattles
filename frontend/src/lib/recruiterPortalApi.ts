import { apiFetch } from "@/lib/apiBase";

export type SquadMemberRole = "creator" | "trader" | "both" | "legacy";

export type RecruiterPortalRecruiter = {
  id: number;
  name: string;
  x_handle: string;
  telegram_handle: string;
  wallet_address: string;
  status: string;
  focus: string | null;
  recruiter_code: string;
  squad_image_url?: string | null;
  squadImageUrl?: string | null;
  approved_at?: string | null;
};

export type RecruiterPortalSquadRow = {
  wallet_address: string;
  recruiter_id: number;
  recruiter_code: string;
  role: SquadMemberRole | string;
  source: string;
  bound_at: string;
};

export type RecruiterPortalData = {
  recruiter: RecruiterPortalRecruiter;
  squad: {
    imageUrl?: string | null;
    image_url?: string | null;
    counts: {
      total: number;
      creators: number;
      traders: number;
      both: number;
      legacyUnknown: number;
      unknown?: number;
    };
    rows: RecruiterPortalSquadRow[];
  };
};

export type RecruiterAuthNonceResponse = {
  nonce: string;
  message: string;
};

const PORTAL_CREDENTIALS: RequestCredentials = "include";
const PORTAL_TOKEN_KEY = "mwz:recruiterPortal:sessionToken";

function getPortalSessionToken(): string {
  try {
    return String(window.localStorage.getItem(PORTAL_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
}

function setPortalSessionToken(token: string) {
  try {
    if (token) window.localStorage.setItem(PORTAL_TOKEN_KEY, token);
  } catch {
    // ignore storage failures
  }
}

function clearPortalSessionToken() {
  try {
    window.localStorage.removeItem(PORTAL_TOKEN_KEY);
  } catch {
    // ignore storage failures
  }
}

function portalHeaders(extra?: HeadersInit): HeadersInit {
  const token = getPortalSessionToken();
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as any)?.ok === false) {
    throw new Error(String((json as any)?.error || (json as any)?.message || `Request failed (${res.status})`));
  }
  return json as any;
}

export function normalizeSquadRole(role?: string | null): SquadMemberRole {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "creator" || normalized === "trader" || normalized === "both") return normalized;
  return "legacy";
}

export function getSquadRoleLabel(role?: string | null): string {
  const normalized = normalizeSquadRole(role);
  if (normalized === "creator") return "Creator";
  if (normalized === "trader") return "Trader";
  if (normalized === "both") return "Both";
  return "Legacy";
}

export function getPortalSquadImageUrl(portal?: RecruiterPortalData | null): string {
  return String(
    portal?.squad?.imageUrl ||
    portal?.squad?.image_url ||
    portal?.recruiter?.squadImageUrl ||
    portal?.recruiter?.squad_image_url ||
    "",
  ).trim();
}

export async function fetchRecruiterPortal(): Promise<RecruiterPortalData | null> {
  const res = await apiFetch("/api/recruiter-portal", {
    credentials: PORTAL_CREDENTIALS,
    cache: "no-store",
    headers: portalHeaders(),
  });

  if (res.status === 401) return null;
  const json = await parseJson(res);
  return json as RecruiterPortalData;
}

export async function requestRecruiterAuthNonce(address: string): Promise<RecruiterAuthNonceResponse> {
  const res = await apiFetch(`/api/recruiter-auth-nonce?address=${encodeURIComponent(address)}`, {
    credentials: PORTAL_CREDENTIALS,
  });
  const json = await parseJson(res);
  if (!json?.nonce || !json?.message) throw new Error("Recruiter login challenge missing from response.");
  return { nonce: String(json.nonce), message: String(json.message) };
}

export async function verifyRecruiterAuth(address: string, signature: string) {
  const res = await apiFetch("/api/recruiter-auth-verify", {
    method: "POST",
    credentials: PORTAL_CREDENTIALS,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature }),
  });
  const json = await parseJson(res);
  if (json?.sessionToken) setPortalSessionToken(String(json.sessionToken));
  return json;
}

export async function updateRecruiterPortalCode(code: string): Promise<{ recruiter_code: string }> {
  const res = await apiFetch("/api/recruiter-portal", {
    method: "POST",
    credentials: PORTAL_CREDENTIALS,
    headers: portalHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "setCode", code }),
  });
  const json = await parseJson(res);
  return { recruiter_code: String(json?.recruiter_code || code) };
}

export async function updateRecruiterPortalSquadImage(imageUrl: string): Promise<{ squad_image_url: string }> {
  const res = await apiFetch("/api/recruiter-portal", {
    method: "POST",
    credentials: PORTAL_CREDENTIALS,
    headers: portalHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "setSquadImage", imageUrl }),
  });
  const json = await parseJson(res);
  return { squad_image_url: String(json?.squad_image_url || json?.squadImageUrl || imageUrl) };
}

export async function logoutRecruiterPortal() {
  clearPortalSessionToken();
  await apiFetch("/api/recruiter-logout", {
    method: "POST",
    credentials: PORTAL_CREDENTIALS,
    headers: portalHeaders(),
  }).catch(() => undefined);
}
