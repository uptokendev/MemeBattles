import type { DraftActionAuth, DraftAuthAction } from "@/lib/draftAuth";
import { apiFetch } from "@/lib/apiBase";

export type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toString: () => string } | null;
  connect?: (args?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString: () => string } }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, encoding?: "utf8") => Promise<{ signature: Uint8Array }>;
};

function getProvider(): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  const solana = (window as any).solana as SolanaProvider | undefined;
  if (solana?.isPhantom || solana?.connect || solana?.signMessage) return solana;
  return null;
}

function normalizePublicKey(value: string) {
  return String(value || "").trim();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function fetchNonce(chainId: number, walletAddress: string) {
  const qs = new URLSearchParams({ chainId: String(chainId), address: walletAddress });
  const res = await apiFetch(`/api/auth/nonce?${qs.toString()}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.nonce) throw new Error(String(json?.error || json?.message || "Could not create Solana auth nonce."));
  return String(json.nonce);
}

export function getSolanaProvider(): SolanaProvider | null {
  return getProvider();
}

export async function connectSolanaWallet(): Promise<string> {
  const provider = getProvider();
  if (!provider?.connect) throw new Error("Phantom wallet not detected.");
  const result = await provider.connect();
  const publicKey = normalizePublicKey(result?.publicKey?.toString?.() || provider.publicKey?.toString?.() || "");
  if (!publicKey) throw new Error("No Solana public key returned.");
  return publicKey;
}

export async function disconnectSolanaWallet(): Promise<void> {
  const provider = getProvider();
  if (!provider?.disconnect) return;
  await provider.disconnect();
}

export async function signSolanaDraftAction(input: {
  walletAddress: string;
  chainId: number;
  action: DraftAuthAction;
  draftId?: string | null;
}): Promise<DraftActionAuth & { walletType: "solana" }> {
  const provider = getProvider();
  if (!provider?.signMessage) throw new Error("Phantom message signing is unavailable.");

  const walletAddress = normalizePublicKey(input.walletAddress || provider.publicKey?.toString?.() || "");
  if (!walletAddress) throw new Error("Solana wallet not connected.");

  const nonce = await fetchNonce(input.chainId, walletAddress);
  const lines = [
    "MemeWarzone Prepare Mode",
    `Action: ${input.action}`,
    `Wallet: ${walletAddress}`,
    `Chain ID: ${Number(input.chainId)}`,
  ];
  if (input.draftId) lines.push(`Draft ID: ${input.draftId}`);
  lines.push(`Nonce: ${nonce}`);
  const message = lines.join("\n");
  const encoded = new TextEncoder().encode(message);
  const signed = await provider.signMessage(encoded, "utf8");

  return {
    action: input.action,
    walletType: "solana",
    walletAddress,
    chainId: Number(input.chainId),
    draftId: input.draftId || null,
    nonce,
    message,
    signature: bytesToBase64(signed.signature),
  };
}
