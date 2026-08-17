import { apiFetch } from "@/lib/apiBase";
import { getRecruiterSession } from "@/lib/recruiterApi";

const MEMBER_ROLE_KEY = "mwz:recruiter:memberRole";

export type RecruiterJoinRole = "creator" | "trader" | "both";

function normalizeRole(value?: string | null): RecruiterJoinRole | null {
  const role = String(value || "").trim().toLowerCase();
  return role === "creator" || role === "trader" || role === "both" ? role : null;
}

export function getRecruiterJoinRole(): RecruiterJoinRole | null {
  try {
    return normalizeRole(window.localStorage.getItem(MEMBER_ROLE_KEY));
  } catch {
    return null;
  }
}

export function setRecruiterJoinRole(role: RecruiterJoinRole) {
  try {
    window.localStorage.setItem(MEMBER_ROLE_KEY, role);
  } catch {
    // Storage is convenience only; the selected React state remains authoritative.
  }
}

export function clearRecruiterJoinRole() {
  try {
    window.localStorage.removeItem(MEMBER_ROLE_KEY);
  } catch {
    // ignore storage failures
  }
}

export async function syncRecruiterJoinRole(walletAddress: string, role: RecruiterJoinRole) {
  const session = getRecruiterSession();
  const response = await apiFetch("/api/attribution/wallet-connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      sessionToken: session.sessionToken,
      clientFingerprint: session.clientFingerprint,
      memberRole: role,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(json?.error || json?.message || `Request failed (${response.status})`));
  }
  if (json?.linked) clearRecruiterJoinRole();
  return json;
}
