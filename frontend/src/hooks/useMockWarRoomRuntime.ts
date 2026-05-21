import { useEffect, useState } from "react";
import {
  getResolvedMockTokenById,
  getResolvedWarRoomState,
  resetMockWarRoomRuntime,
  setMockWarRoomFilters as applyMockWarRoomFilters,
  subscribeToMockWarRoomRuntime,
  toggleMockWarRoomWatchlist,
  type ResolvedMockTokenProfile,
} from "@/features/postgrad/mockWarRoomRuntime";

export function useMockWarRoomState() {
  const [state, setState] = useState(() => getResolvedWarRoomState());

  useEffect(() => {
    return subscribeToMockWarRoomRuntime(() => {
      setState(getResolvedWarRoomState());
    });
  }, []);

  return {
    filters: state.filters,
    tokens: state.tokens,
    watchlistTokenIds: state.watchlistTokenIds,
    setMockWarRoomFilters: applyMockWarRoomFilters,
    toggleMockWarRoomWatchlist,
    resetMockWarRoomRuntime,
  };
}

export function useMockWarRoomToken(tokenId?: string) {
  const [token, setToken] = useState<ResolvedMockTokenProfile | null>(() => getResolvedMockTokenById(tokenId));

  useEffect(() => {
    setToken(getResolvedMockTokenById(tokenId));
  }, [tokenId]);

  useEffect(() => {
    return subscribeToMockWarRoomRuntime(() => {
      setToken(getResolvedMockTokenById(tokenId));
    });
  }, [tokenId]);

  return {
    token,
    toggleMockWarRoomWatchlist,
    resetMockWarRoomRuntime,
  };
}
