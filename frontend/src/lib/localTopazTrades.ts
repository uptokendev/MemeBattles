import type { CurveTradePoint } from "@/hooks/useCurveTrades";

const STORAGE_PREFIX = "mwz:local-topaz-trades:v1:";
const MAX_TRADES = 40;

type StoredTrade = {
  type: "buy" | "sell";
  from: string;
  to: string;
  tokensWei: string;
  nativeWei: string;
  pricePerToken: number;
  timestamp: number;
  txHash: string;
  blockNumber: number;
  logIndex: number;
};

function storageKey(chainId: number, campaignAddress: string) {
  return `${STORAGE_PREFIX}${Number(chainId)}:${String(campaignAddress || "").toLowerCase()}`;
}

function serialize(point: CurveTradePoint): StoredTrade | null {
  const txHash = String(point.txHash || "").toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) return null;
  return {
    type: point.type === "sell" ? "sell" : "buy",
    from: String(point.from || "").toLowerCase(),
    to: String(point.to || "").toLowerCase(),
    tokensWei: String(point.tokensWei ?? 0n),
    nativeWei: String(point.nativeWei ?? 0n),
    pricePerToken: Number(point.pricePerToken || 0),
    timestamp: Number(point.timestamp || 0),
    txHash,
    logIndex: Number(point.logIndex || 0),
    blockNumber: Number(point.blockNumber || 0),
  };
}

function deserialize(row: StoredTrade): CurveTradePoint | null {
  try {
    if (!row?.txHash) return null;
    return {
      type: row.type === "sell" ? "sell" : "buy",
      from: String(row.from || "").toLowerCase(),
      to: String(row.to || "").toLowerCase(),
      tokensWei: BigInt(row.tokensWei || "0"),
      nativeWei: BigInt(row.nativeWei || "0"),
      pricePerToken: Number(row.pricePerToken || 0),
      timestamp: Number(row.timestamp || 0),
      txHash: String(row.txHash).toLowerCase(),
      blockNumber: Number(row.blockNumber || 0),
      logIndex: Number(row.logIndex || 0),
    };
  } catch {
    return null;
  }
}

export function loadLocalTopazTrades(chainId: number, campaignAddress: string): CurveTradePoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(storageKey(chainId, campaignAddress));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredTrade[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(deserialize)
      .filter((row): row is CurveTradePoint => Boolean(row))
      .slice(-MAX_TRADES);
  } catch {
    return [];
  }
}

export function saveLocalTopazTrades(chainId: number, campaignAddress: string, trades: CurveTradePoint[]) {
  if (typeof window === "undefined") return;
  try {
    const byHash = new Map<string, StoredTrade>();
    for (const trade of trades) {
      const stored = serialize(trade);
      if (!stored) continue;
      byHash.set(`${stored.txHash}:${stored.logIndex}`, stored);
    }
    const rows = Array.from(byHash.values())
      .sort((a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber)
      .slice(-MAX_TRADES);
    window.sessionStorage.setItem(storageKey(chainId, campaignAddress), JSON.stringify(rows));
  } catch {
    // ignore quota / private mode
  }
}

export function appendLocalTopazTrade(chainId: number, campaignAddress: string, trade: CurveTradePoint) {
  const existing = loadLocalTopazTrades(chainId, campaignAddress);
  saveLocalTopazTrades(chainId, campaignAddress, [...existing, trade]);
  return loadLocalTopazTrades(chainId, campaignAddress);
}
