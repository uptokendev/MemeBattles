import { apiFetch } from "@/lib/apiBase";

export type RecruiterPortalRecruiter = {
  id: number;
  name: string;
  x_handle: string;
  telegram_handle: string;
  wallet_address: string;
  status: string;
  focus: string | null;
  recruiter_code: string;
  approved_at?: string | null;
};

export type RecruiterPortalSquadRow = {
  wallet_address: string;
  recruiter_id: number;
  recruiter_code: string;
  role: string;
  source: string;
  bound_at: string;
};

export type RecruiterPortalData = {
  recruiter: RecruiterPortalRecruiter;
  squad: {
    counts: {
      total: number;
      creators: number;
      traders: number;
      unknown: number;
    };
    rows: RecruiterPortalSquadRow[];
  };
};

export type RecruiterAuthNonceResponse = {
  nonce: string;
  message: string;
};

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as any)?.ok === false) {
    throw new Error(String((json as any)?.error || (json as any)?.message || `Request failed (${res.status})`));
  }
  return json as any;
}

export async function fetchRecruiterPortal(): Promise<RecruiterPortalData | null> {
  const res = await apiFetch("/api/recruiter-portal", {
    credentials: "same-origin",
    cache: "no-store",
  });

  if (res.status === 401) return null;
  const json = await parseJson(res);
  return json as RecruiterPortalData;
}

export async function requestRecruiterAuthNonce(address: string): Promise<RecruiterAuthNonceResponse> {
  const res = await apiFetch(`/api/recruiter-auth-nonce?address=${encodeURIComponent(address)}`, {
    credentials: "same-origin",
  });
  const json = await parseJson(res);
  if (!json?.nonce || !json?.message) throw new Error("Recruiter login challenge missing from response.");
  return { nonce: String(json.nonce), message: String(json.message) };
}

export async function verifyRecruiterAuth(address: string, signature: string) {
  const res = await apiFetch("/api/recruiter-auth-verify", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature }),
  });
  return parseJson(res);
}

export async function updateRecruiterPortalCode(code: string): Promise<{ recruiter_code: string }> {
  const res = await apiFetch("/api/recruiter-portal", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "setCode", code }),
  });
  const json = await parseJson(res);
  return { recruiter_code: String(json?.recruiter_code || code) };
}

export async function logoutRecruiterPortal() {
  await apiFetch("/api/recruiter-logout", {
    method: "POST",
    credentials: "same-origin",
  }).catch(() => undefined);
}
