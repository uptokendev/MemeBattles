import { apiFetch } from "@/lib/apiBase";
import {
  buildRecruiterSignupMessage,
  fetchRecruiterSummaryByWallet,
  type RecruiterSignupNonceResponse,
  type RecruiterSignupPayload,
  type RecruiterSignupStatus,
  type RecruiterSummary,
} from "@/lib/recruiterApi";

function buildQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((json as any)?.error || (json as any)?.message || `Request failed (${res.status})`));
  }
  return json as any;
}

async function postJson(path: string, body: any) {
  return parseJson(
    await apiFetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function normalizeSolanaWallet(walletAddress: string) {
  return String(walletAddress || "").trim();
}

function normalizeRecruiterCode(code: string): string {
  return String(code || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildSolanaRecruiterSignupMessage(input: Parameters<typeof buildRecruiterSignupMessage>[0]) {
  return buildRecruiterSignupMessage({
    ...input,
    walletAddress: normalizeSolanaWallet(input.walletAddress),
    chainId: input.chainId ?? 101,
  });
}

export async function fetchSolanaRecruiterSignupStatus(walletAddress: string): Promise<RecruiterSignupStatus> {
  const normalized = normalizeSolanaWallet(walletAddress);
  const res = await apiFetch(`/api/solana/recruiter-signup/status${buildQuery({ walletAddress: normalized })}`);

  if (res.ok) {
    const json = await parseJson(res);
    const isRecruiter = Boolean(json?.isRecruiter);
    let recruiter = (json?.recruiter ?? null) as RecruiterSummary | null;

    if (isRecruiter && !recruiter) {
      recruiter = await fetchRecruiterSummaryByWallet(normalized).catch(() => null);
    }

    return {
      walletAddress: normalized,
      isRecruiter,
      recruiter,
      canStartSignup: Boolean(json?.canStartSignup ?? !isRecruiter),
      signupApiAvailable: true,
    };
  }

  if (res.status === 404) {
    return {
      walletAddress: normalized,
      isRecruiter: false,
      recruiter: null,
      canStartSignup: true,
      signupApiAvailable: true,
    };
  }

  await parseJson(res);
  return {
    walletAddress: normalized,
    isRecruiter: false,
    recruiter: null,
    canStartSignup: true,
    signupApiAvailable: false,
  };
}

export async function requestSolanaRecruiterSignupNonce(
  walletAddress: string,
  chainId = 101,
): Promise<RecruiterSignupNonceResponse> {
  const json = await postJson("/api/solana/recruiter-signup/nonce", {
    walletAddress: normalizeSolanaWallet(walletAddress),
    chainId,
  });
  if (!json?.nonce) throw new Error("Recruiter signup nonce missing from response.");
  return { nonce: String(json.nonce) };
}

export async function submitSolanaRecruiterSignup(payload: RecruiterSignupPayload) {
  return postJson("/api/solana/recruiter-signup", {
    ...payload,
    chainId: payload.chainId ?? 101,
    walletAddress: normalizeSolanaWallet(payload.walletAddress),
    desiredCode: normalizeRecruiterCode(payload.desiredCode),
  });
}
