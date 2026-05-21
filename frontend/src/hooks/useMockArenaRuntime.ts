import { useEffect, useState } from "react";
import {
  getResolvedArenaState,
  resetMockArenaRuntime,
  rotateFeaturedPlacements,
  setFeaturedPlacement,
  subscribeToMockArenaRuntime,
  toggleSponsoredPlacement,
} from "@/features/postgrad/mockArenaRuntime";

export function useMockArenaState() {
  const [state, setState] = useState(() => getResolvedArenaState());

  useEffect(() => {
    return subscribeToMockArenaRuntime(() => {
      setState(getResolvedArenaState());
    });
  }, []);

  return {
    featuredTokens: state.featuredTokens,
    sponsoredTokenIds: state.sponsoredTokenIds,
    allTokens: state.allTokens,
    setFeaturedPlacement,
    rotateFeaturedPlacements,
    toggleSponsoredPlacement,
    resetMockArenaRuntime,
  };
}
