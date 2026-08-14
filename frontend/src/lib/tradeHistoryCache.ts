import type { CurveTradePoint } from "@/hooks/useCurveTrades";
import { isSolanaChainId } from "@/lib/chainConfig";
import { normalizeTradeTxHash } from "@/lib/tradeDedupe";

const PREFIX = "mwz:trade-history:v1:";
const MAX = 120;

type Stored = {
  type: "buy" | "sell";
  from: string;
  to: string;
  tokensWei: string;
  nativeWei: string;
  pricePerToken: number;
  soldTokensAfterRaw?: string | null;
  timestamp: number;
  txHash: string;
  blockNumber: number;
  logIndex: number;
};

function normalizeAddress(chainId: number, value: unknown) {
  const raw = String(value || "").trim();
  return isSolanaChainId(chainId) ? raw : raw.toLowerCase();
}

function key(chainId: number, campaign: string) {
  return `${PREFIX}${Number(chainId)}:${normalizeAddress(chainId, campaign)}`;
}

function storageFor(chainId: number): Storage | null {
  if (typeof window === "undefined") return null;
  return isSolanaChainId(chainId) ? window.localStorage : window.sessionStorage;
}

function toStored(p: CurveTradePoint, chainId: number): Stored | null {
  const txHash = normalizeTradeTxHash(p.txHash);
  if (!txHash) return null;
  return {
    type: p.type === "sell" ? "sell" : "buy",
    from: normalizeAddress(chainId, p.from),
    to: normalizeAddress(chainId, p.to),
    tokensWei: String(p.tokensWei ?? 0n),
    nativeWei: String(p.nativeWei ?? 0n),
    pricePerToken: Number(p.pricePerToken || 0),
    soldTokensAfterRaw:
      p.soldTokensAfterRaw != null
        ? String(p.soldTokensAfterRaw)
        : null,
    timestamp: Number(p.timestamp || 0),
    txHash,
    blockNumber: Number(p.blockNumber || 0),
    logIndex: Number(p.logIndex || 0),
  };
}

function fromStored(s: Stored, chainId: number): CurveTradePoint | null {
  try {
    const txHash = normalizeTradeTxHash(s.txHash);
    if (!txHash) return null;
    return {
      type: s.type === "sell" ? "sell" : "buy",
      from: normalizeAddress(chainId, s.from),
      to: normalizeAddress(chainId, s.to),
      tokensWei: BigInt(s.tokensWei || "0"),
      nativeWei: BigInt(s.nativeWei || "0"),
      pricePerToken: Number(s.pricePerToken || 0),
      soldTokensAfterRaw:
        s.soldTokensAfterRaw != null && String(s.soldTokensAfterRaw).trim() !== ""
          ? BigInt(String(s.soldTokensAfterRaw))
          : null,
      timestamp: Number(s.timestamp || 0),
      txHash,
      blockNumber: Number(s.blockNumber || 0),
      logIndex: Number(s.logIndex || 0),
    };
  } catch {
    return null;
  }
}

export function loadCachedTradeHistory(chainId: number, campaign: string): CurveTradePoint[] {
  const storage = storageFor(chainId);
  if (!storage) return [];
  try {
    const raw = storage.getItem(key(chainId, campaign));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Stored[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => fromStored(row, chainId)).filter((x): x is CurveTradePoint => Boolean(x)).slice(-MAX);
  } catch {
    return [];
  }
}

export function saveCachedTradeHistory(chainId: number, campaign: string, trades: CurveTradePoint[]) {
  const storage = storageFor(chainId);
  if (!storage) return;
  try {
    const map = new Map<string, Stored>();
    for (const t of trades) {
      const s = toStored(t, chainId);
      if (!s) continue;
      map.set(`${s.txHash}:${s.logIndex}`, s);
    }
    const rows = Array.from(map.values())
      .sort((a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
      .slice(-MAX);
    storage.setItem(key(chainId, campaign), JSON.stringify(rows));
  } catch {
    // ignore
  }
}
