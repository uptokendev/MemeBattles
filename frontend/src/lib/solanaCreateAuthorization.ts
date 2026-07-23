import { SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { apiFetch } from "@/lib/apiBase";

export type SolanaCreateMetadata = {
  name: string;
  symbol: string;
  logoURI: string;
  website?: string;
  xAccount?: string;
  telegram?: string;
  discord?: string;
  extraLink?: string;
  category?: string;
  description?: string;
};

export type SolanaCreatePreflight = {
  allowed: boolean;
  chainId: number;
  reasons: string[];
  warnings: string[];
  protocolStatus: "ready" | "protocol_pending";
  code: string;
  creator: { wallet: string } | null;
  metadata: SolanaCreateMetadata;
  generation: {
    generationIdHex: string;
    generationId: number[];
  };
  route: {
    version: string;
    programId: string | null;
    routeSigner: string | null;
    routeAuthorizationMode: string;
  };
};

export type SolanaCreateAuthorization = {
  chainId: number;
  programId: string;
  routeSigner: string;
  routeAuthorizationMode: string;
  generationIdHex: string;
  generationId: number[];
  campaignIdHex: string;
  campaignId: number[];
  metadataHashHex: string;
  metadataHash: number[];
  routeProfileHashHex: string;
  routeProfileHash: number[];
  nonceHex: string;
  nonce: number[];
  deadline: number;
  validUntil: string;
  routeProfile: Record<string, unknown>;
};

export type SolanaCreateAuthorizationPreview = {
  ok: boolean;
  code: string | null;
  error: string | null;
  authorization: SolanaCreateAuthorization | null;
  preflight: SolanaCreatePreflight | null;
};

function normalizeSolanaMetadata(metadata: SolanaCreateMetadata): SolanaCreateMetadata {
  return {
    name: String(metadata.name || "").trim(),
    symbol: String(metadata.symbol || "").trim().toUpperCase(),
    logoURI: String(metadata.logoURI || "").trim(),
    website: String(metadata.website || "").trim(),
    xAccount: String(metadata.xAccount || "").trim(),
    telegram: String(metadata.telegram || "").trim(),
    discord: String(metadata.discord || "").trim(),
    extraLink: String(metadata.extraLink || "").trim(),
    category: String(metadata.category || "meme").trim() || "meme",
    description: String(metadata.description || "").trim(),
  };
}

function responseErrorMessage(json: any, status: number): string {
  return String(json?.error || json?.message || json?.preflight?.reasons?.[0] || `Solana create authorization failed (${status})`);
}

export async function requestSolanaCreateAuthorizationPreview(params: {
  creatorWallet: string;
  metadata: SolanaCreateMetadata;
}): Promise<SolanaCreateAuthorizationPreview> {
  const res = await apiFetch("/api/routing/create-authorization", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chainId: SOLANA_CHAIN_ID,
      walletAddress: params.creatorWallet,
      creatorWallet: params.creatorWallet,
      metadata: normalizeSolanaMetadata(params.metadata),
    }),
  });

  const json = await res.json().catch(() => ({} as any));
  const code = String(json?.code || json?.preflight?.code || "").trim() || null;

  if (!res.ok && code !== "SOLANA_PROTOCOL_PENDING") {
    throw new Error(responseErrorMessage(json, res.status));
  }

  return {
    ok: res.ok,
    code,
    error: json?.error ? String(json.error) : null,
    authorization: json?.authorization ?? null,
    preflight: json?.preflight ?? null,
  };
}
