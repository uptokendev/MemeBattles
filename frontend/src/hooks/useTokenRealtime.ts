import { useEffect, useMemo, useRef, useState } from "react";
import Ably from "ably";

const API_BASE = import.meta.env.VITE_REALTIME_API_BASE as string;
const ABLY_AUTH_BASE = import.meta.env.VITE_ABLY_AUTH_BASE as string;

export type RealtimeTrade = {
  type: "trade";
  chainId: number;
  token: string; // campaign
  txHash: string;
  logIndex: number;
  side: "buy" | "sell";
  wallet: string;
  tokenAmount: string;
  bnbAmount: string;
  priceBnb: string | null;
  ts: number; // seconds
  blockNumber: number;
};

export type StatsPatch = {
  type: "stats_patch";
  lastPriceBnb: string | null;
  marketcapBnb: string | null;
  vol24hBnb: string | null;
};

export type CandleUpsert = {
  type: "candle_upsert";
  tf: string;
  bucket: number;
  c?: string;
  v?: string;
};

type Msg = RealtimeTrade | StatsPatch | CandleUpsert;

function tokenChannel(chainId: number, campaign: string) {
  return `token:${chainId}:${campaign.toLowerCase()}`;
}

// simple batching to prevent render storms
function useBatchedQueue<T>(flushMs = 250) {
  const queueRef = useRef<T[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (queueRef.current.length > 0) setTick((x) => x + 1);
    }, flushMs);
    return () => clearInterval(id);
  }, [flushMs]);

  return queueRef;
}

export function useTokenRealtime(chainId: number, campaign: string) {
  const [connected, setConnected] = useState(false);
  const [messagesTick, setMessagesTick] = useState(0);

  const tradesRef = useRef<Map<string, RealtimeTrade>>(new Map());
  const lastStatsRef = useRef<StatsPatch | null>(null);

  const queueRef = useBatchedQueue<Msg>(250);

  // expose stable arrays for UI
  const trades = useMemo(() => {
    // on each tick, rebuild sorted array
    const arr = Array.from(tradesRef.current.values());
    arr.sort((a, b) => (b.blockNumber - a.blockNumber) || (b.logIndex - a.logIndex));
    return arr;
  }, [messagesTick]);

  const stats = useMemo(() => lastStatsRef.current, [messagesTick]);

  useEffect(() => {
    if (!API_BASE || !campaign) return;

    void API_BASE;
    const authBase = String(ABLY_AUTH_BASE || (typeof window !== "undefined" ? window.location.origin : "") || "").replace(/\/$/, "");
    if (!authBase) return;
    const client = new Ably.Realtime({
      authUrl: `${authBase}/api/ably/token?chainId=${chainId}&campaign=${campaign.toLowerCase()}`,
      authMethod: "GET",
    });

    const chName = tokenChannel(chainId, campaign);
    const channel = client.channels.get(chName);

    // connection state
    client.connection.on((stateChange) => {
      setConnected(stateChange.current === "connected");
    });

    // Rewind last ~2 minutes of messages to avoid missing on refresh/reconnect
    // Ably supports rewind on attach via channel params.
    // If you prefer a fixed message count, use `rewind=100`.
    channel.setOptions({ params: { rewind: "120s" } });

    const applyMsg = (msg: Msg) => {
      if (msg.type === "trade") {
        const key = `${msg.txHash.toLowerCase()}:${msg.logIndex}`;
        tradesRef.current.set(key, msg);
      } else if (msg.type === "stats_patch") {
        lastStatsRef.current = msg;
      }
      // candles are handled by your chart component; we’ll wire that next
    };

    const flush = () => {
      const q = queueRef.current;
      if (q.length === 0) return;
      const batch = q.splice(0, q.length);
      for (const m of batch) applyMsg(m);
      setMessagesTick((x) => x + 1);
    };

    const flushId = setInterval(flush, 250);

    channel.subscribe((message) => {
      const data = message.data as Msg;
      if (!data || typeof data !== "object") return;
      queueRef.current.push(data);
    });

    channel.attach();

    return () => {
      clearInterval(flushId);
      channel.unsubscribe();
      client.close();
    };
  }, [chainId, campaign]);

  return { connected, trades, stats };
}