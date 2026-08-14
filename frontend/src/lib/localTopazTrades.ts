import type { CurveTradePoint } from "@/hooks/useCurveTrades";
import { isSolanaChainId } from "@/lib/chainConfig";
import { mergeTradePoints, normalizeTradeTxHash } from "@/lib/tradeDedupe";

const STORAGE_PREFIX = "mwz:local-topaz-trades:v1:";
const MAX_TRADES = 40;

type StoredTrade = {
  type: "buy" | "sell";
  from: string;
  to: string;
  tokensWei: string;
  nativeWei: string;
  pricePerToken: number;
  soldTokensAfterRaw?: string | null;
  venue?: "curve" | "dex";
  timestamp: number;
  txHash: string;
  blockNumber: number;
  logIndex: number;
};

function normalizeAddress(chainId: number, value: unknown) {
  const raw = String(value || "").trim();
  return isSolanaChainId(chainId) ? raw : raw.toLowerCase();
}

function storageKey(chainId: number, campaignAddress: string) {
  return `${STORAGE_PREFIX}${Number(chainId)}:${normalizeAddress(chainId, campaignAddress)}`;
}

function storageFor(chainId: number): Storage | null {
  if (typeof window === "undefined") return null;
  // Keep Solana optimistic history across reloads/tabs until the persistent
  // indexer catches up. Preserve legacy EVM session behavior unchanged.
  return isSolanaChainId(chainId) ? window.localStorage : window.sessionStorage;
}

function serialize(point: CurveTradePoint, chainId: number): StoredTrade | null {
  const txHash = normalizeTradeTxHash(point.txHash);
  if (!txHash) return null;
  return {
    type: point.type === "sell" ? "sell" : "buy",
    from: normalizeAddress(chainId, point.from),
    to: normalizeAddress(chainId, point.to),
    tokensWei: String(point.tokensWei ?? 0n),
    nativeWei: String(point.nativeWei ?? 0n),
    pricePerToken: Number(point.pricePerToken || 0),
    soldTokensAfterRaw:
      point.soldTokensAfterRaw != null ? String(point.soldTokensAfterRaw) : null,
    venue: point.venue === "dex" || point.venue === "curve" ? point.venue : undefined,
    timestamp: Number(point.timestamp || 0),
    txHash,
    logIndex: Number(point.logIndex || 0),
    blockNumber: Number(point.blockNumber || 0),
  };
}

function deserialize(row: StoredTrade, chainId: number): CurveTradePoint | null {
  try {
    const txHash = normalizeTradeTxHash(row?.txHash);
    if (!txHash) return null;
    return {
      type: row.type === "sell" ? "sell" : "buy",
      from: normalizeAddress(chainId, row.from),
      to: normalizeAddress(chainId, row.to),
      tokensWei: BigInt(row.tokensWei || "0"),
      nativeWei: BigInt(row.nativeWei || "0"),
      pricePerToken: Number(row.pricePerToken || 0),
      soldTokensAfterRaw:
        row.soldTokensAfterRaw != null && String(row.soldTokensAfterRaw).trim() !== ""
          ? BigInt(String(row.soldTokensAfterRaw))
          : null,
      venue: row.venue === "dex" || row.venue === "curve" ? row.venue : undefined,
      timestamp: Number(row.timestamp || 0),
      txHash,
      blockNumber: Number(row.blockNumber || 0),
      logIndex: Number(row.logIndex || 0),
    };
  } catch {
    return null;
  }
}

export function loadLocalTopazTrades(chainId: number, campaignAddress: string): CurveTradePoint[] {
  const storage = storageFor(chainId);
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey(chainId, campaignAddress));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredTrade[];
    if (!Array.isArray(parsed)) return [];
    return mergeTradePoints(
      parsed.map((row) => deserialize(row, chainId)).filter((row): row is CurveTradePoint => Boolean(row)),
    ).slice(-MAX_TRADES);
  } catch {
    return [];
  }
}

export function saveLocalTopazTrades(chainId: number, campaignAddress: string, trades: CurveTradePoint[]) {
  const storage = storageFor(chainId);
  if (!storage) return;
  try {
    const deduped = mergeTradePoints(trades);
    const rows = deduped
      .map((point) => serialize(point, chainId))
      .filter((row): row is StoredTrade => Boolean(row))
      .slice(-MAX_TRADES);
    storage.setItem(storageKey(chainId, campaignAddress), JSON.stringify(rows));
  } catch {
    // ignore quota / private mode
  }
}

export function appendLocalTopazTrade(chainId: number, campaignAddress: string, trade: CurveTradePoint) {
  const existing = loadLocalTopazTrades(chainId, campaignAddress);
  saveLocalTopazTrades(chainId, campaignAddress, [...existing, trade]);
  return loadLocalTopazTrades(chainId, campaignAddress);
}
