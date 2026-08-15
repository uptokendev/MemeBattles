import { useCallback, useEffect, useState } from "react";
import {
  clearRecentlySearched,
  loadRecentlySearched,
  loadRecentlyViewed,
  recordRecentlySearched,
  type SearchHistoryItem,
} from "@/lib/searchHistory";

export function useSearchHistory(open: boolean) {
  const [searched, setSearched] = useState<SearchHistoryItem[]>([]);
  const [viewed, setViewed] = useState<SearchHistoryItem[]>([]);

  const refresh = useCallback(() => {
    setSearched(loadRecentlySearched());
    setViewed(loadRecentlyViewed());
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const remember = useCallback((item: SearchHistoryItem) => {
    recordRecentlySearched(item);
    refresh();
  }, [refresh]);

  const clearSearched = useCallback(() => {
    clearRecentlySearched();
    refresh();
  }, [refresh]);

  return { searched, viewed, remember, clearSearched };
}
