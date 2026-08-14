import { apiFetch } from "@/lib/apiBase";

export type PendingSolanaDexTrade = {
  campaignAddress: string;
  mint: string;
  side: "buy" | "sell";
  amountInRaw: string;
  displayAmount: string;
  tokenDecimals: number;
  createdAt: number;
};

const PENDING_KEY = "mwz:solana-pending-dex-trade:v1";

export function stashPendingSolanaDexTrade(trade: PendingSolanaDexTrade) {
  if (typeof window === "undefined" || !trade.campaignAddress || !trade.amountInRaw) return;
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(trade));
  } catch {
    // Best-effort only.
  }
}

export function peekPendingSolanaDexTrade(campaignAddress?: string): PendingSolanaDexTrade | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSolanaDexTrade>;
    const campaign = String(parsed.campaignAddress || "").trim();
    const amountInRaw = String(parsed.amountInRaw || "").trim();
    const side = parsed.side === "sell" ? "sell" : parsed.side === "buy" ? "buy" : "";
    if (!campaign || !amountInRaw || !side) return null;
    if (campaignAddress && campaign !== campaignAddress && campaign.toLowerCase() !== campaignAddress.toLowerCase()) {
      return null;
    }
    if (Date.now() - Number(parsed.createdAt || 0) > 5 * 60 * 1000) {
      window.sessionStorage.removeItem(PENDING_KEY);
      return null;
    }
    return {
      campaignAddress: campaign,
      mint: String(parsed.mint || "").trim(),
      side,
      amountInRaw,
      displayAmount: String(parsed.displayAmount || "").trim(),
      tokenDecimals: Number(parsed.tokenDecimals || 6),
      createdAt: Number(parsed.createdAt || 0),
    };
  } catch {
    return null;
  }
}

export function takePendingSolanaDexTrade(campaignAddress?: string): PendingSolanaDexTrade | null {
  const pending = peekPendingSolanaDexTrade(campaignAddress);
  if (!pending) return null;
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
  return pending;
}

export function isSolanaCurveClosedError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || error || "");
  const code = String((error as { code?: string })?.code || "");
  return (
    code === "SOLANA_CURVE_CLOSED" ||
    /SOLANA_CURVE_CLOSED|CurveClosed|awaiting Meteora|threshold reached/i.test(message)
  );
}

export async function requestSolanaGraduationHandoff(campaignAddress: string): Promise<{
  status: string;
} | null> {
  const campaign = String(campaignAddress || "").trim();
  if (!campaign) return null;
  try {
    const res = await apiFetch("/api/solana/graduation-handoff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignAddress: campaign, chainId: 101 }),
    });
    const payload = await res.json().catch(() => null);
    return payload && typeof payload === "object" ? payload : { status: "handoff" };
  } catch {
    return { status: "handoff" };
  }
}
