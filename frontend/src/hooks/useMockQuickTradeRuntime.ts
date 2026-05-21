import { useEffect, useState } from "react";
import {
  getResolvedQuickTradesForToken,
  resetMockQuickTradeRuntime,
  submitMockQuickTrade,
  subscribeToMockQuickTradeRuntime,
} from "@/features/postgrad/mockQuickTradeRuntime";

export function useMockQuickTrades(tokenId?: string) {
  const [trades, setTrades] = useState(() => getResolvedQuickTradesForToken(tokenId));

  useEffect(() => {
    setTrades(getResolvedQuickTradesForToken(tokenId));
  }, [tokenId]);

  useEffect(() => {
    return subscribeToMockQuickTradeRuntime(() => {
      setTrades(getResolvedQuickTradesForToken(tokenId));
    });
  }, [tokenId]);

  return {
    trades,
    submitMockQuickTrade,
    resetMockQuickTradeRuntime,
  };
}
