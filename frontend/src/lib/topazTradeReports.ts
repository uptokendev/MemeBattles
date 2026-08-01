import { ethers } from "ethers";
import { apiFetch } from "@/lib/apiBase";
import type { CurveTradePoint } from "@/hooks/useCurveTrades";

export type TopazTradeReportInput = {
  chainId: number;
  campaignAddress: string;
  side: "buy" | "sell";
  txHash: string;
  tokenAmountRaw: string;
  nativeAmountRaw: string;
  wallet?: string;
  pairAddress?: string | null;
  blockNumber?: number | null;
  logIndex?: number | null;
  blockTime?: string | null;
};

function parseAmountRaw(raw: unknown, decimals: number): bigint {
  const text = String(raw ?? "0").trim();
  if (!text) return 0n;
  if (/^\d+$/.test(text)) {
    try {
      return BigInt(text);
    } catch {
      return 0n;
    }
  }
  try {
    return ethers.parseUnits(text, decimals);
  } catch {
    return 0n;
  }
}

function toPoint(row: any, campaignAddress: string): CurveTradePoint | null {
  try {
    const txHash = String(row.tx_hash || row.txHash || "").toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(txHash)) return null;

    const tokensWei = parseAmountRaw(
      row.token_amount_raw ?? row.tokenAmountRaw ?? row.token_amount ?? row.tokenAmount,
      18,
    );
    const nativeWei = parseAmountRaw(
      row.bnb_amount_raw ?? row.native_amount_raw ?? row.nativeAmountRaw ?? row.bnb_amount ?? row.bnbAmount,
      18,
    );
    if (tokensWei <= 0n && nativeWei <= 0n) return null;

    const tokenAmount = Number(ethers.formatUnits(tokensWei, 18));
    const bnbAmount = Number(ethers.formatEther(nativeWei));
    const price =
      Number(row.price_bnb ?? row.priceBnb ?? 0) ||
      (tokenAmount > 0 && Number.isFinite(bnbAmount) ? bnbAmount / tokenAmount : 0);

    const blockTime = row.block_time || row.blockTime;
    const timestamp = blockTime
      ? Math.floor(new Date(blockTime).getTime() / 1000)
      : Number(row.timestamp || 0) || Math.floor(Date.now() / 1000);

    return {
      type: String(row.side || "buy").toLowerCase() === "sell" ? "sell" : "buy",
      from: String(row.wallet || row.from || "").toLowerCase(),
      to: String(campaignAddress || "").toLowerCase(),
      tokensWei,
      nativeWei,
      pricePerToken: Number.isFinite(price) ? price : 0,
      timestamp,
      txHash,
      blockNumber: Number(row.block_number ?? row.blockNumber ?? 0),
      logIndex: Number(row.log_index ?? row.logIndex ?? 0),
    };
  } catch {
    return null;
  }
}

export async function fetchTopazTradeReports(input: {
  chainId: number;
  campaignAddress: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<CurveTradePoint[]> {
  const campaign = String(input.campaignAddress || "").toLowerCase();
  const params = new URLSearchParams({
    chainId: String(input.chainId),
    campaignAddress: campaign,
    limit: String(input.limit ?? 100),
  });
  const response = await apiFetch(`/api/topaz-trades?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal: input.signal,
  });
  if (!response.ok) return [];
  const body = await response.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [];
  return items
    .map((row: any) => toPoint(row, campaign))
    .filter((row: CurveTradePoint | null): row is CurveTradePoint => Boolean(row));
}

export async function reportTopazTrade(input: TopazTradeReportInput): Promise<boolean> {
  try {
    const response = await apiFetch("/api/topaz-trades", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chainId: input.chainId,
        campaignAddress: input.campaignAddress,
        side: input.side,
        txHash: input.txHash,
        tokenAmountRaw: input.tokenAmountRaw,
        nativeAmountRaw: input.nativeAmountRaw,
        wallet: input.wallet,
        pairAddress: input.pairAddress,
        blockNumber: input.blockNumber,
        logIndex: input.logIndex ?? 0,
        blockTime: input.blockTime || new Date().toISOString(),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
