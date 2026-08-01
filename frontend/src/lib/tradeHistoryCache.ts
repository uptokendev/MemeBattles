import type { CurveTradePoint } from "@/hooks/useCurveTrades";

const PREFIX = "mwz:trade-history:v1:";
const MAX = 120;

type Stored = {
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

function key(chainId: number, campaign: string) {
  return `${PREFIX}${Number(chainId)}:${String(campaign || "").toLowerCase()}`;
}

function toStored(p: CurveTradePoint): Stored | null {
  const txHash = String(p.txHash || "").toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) return null;
  return {
    type: p.type === "sell" ? "sell" : "buy",
    from: String(p.from || "").toLowerCase(),
    to: String(p.to || "").toLowerCase(),
    tokensWei: String(p.tokensWei ?? 0n),
    nativeWei: String(p.nativeWei ?? 0n),
    pricePerToken: Number(p.pricePerToken || 0),
    timestamp: Number(p.timestamp || 0),
    txHash,
    blockNumber: Number(p.blockNumber || 0),
    logIndex: Number(p.logIndex || 0),
  };
}

function fromStored(s: Stored): CurveTradePoint | null {
  try {
    return {
      type: s.type === "sell" ? "sell" : "buy",
      from: String(s.from || "").toLowerCase(),
      to: String(s.to || "").toLowerCase(),
      tokensWei: BigInt(s.tokensWei || "0"),
      nativeWei: BigInt(s.nativeWei || "0"),
      pricePerToken: Number(s.pricePerToken || 0),
      timestamp: Number(s.timestamp || 0),
      txHash: String(s.txHash || "").toLowerCase(),
      blockNumber: Number(s.blockNumber || 0),
      logIndex: Number(s.logIndex || 0),
    };
  } catch {
    return null;
  }
}

export function loadCachedTradeHistory(chainId: number, campaign: string): CurveTradePoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(key(chainId, campaign));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Stored[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(fromStored).filter((x): x is CurveTradePoint => Boolean(x)).slice(-MAX);
  } catch {
    return [];
  }
}

export function saveCachedTradeHistory(chainId: number, campaign: string, trades: CurveTradePoint[]) {
  if (typeof window === "undefined") return;
  try {
    const map = new Map<string, Stored>();
    for (const t of trades) {
      const s = toStored(t);
      if (!s) continue;
      map.set(`${s.txHash}:${s.logIndex}`, s);
    }
    const rows = Array.from(map.values())
      .sort((a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
      .slice(-MAX);
    window.sessionStorage.setItem(key(chainId, campaign), JSON.stringify(rows));
  } catch {
    // ignore
  }
}
