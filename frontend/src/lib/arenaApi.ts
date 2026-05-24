import { apiJson } from "@/lib/apiBase";

export type ArenaFeedItem = {
  campaignAddress: string;
  tokenAddress?: string | null;
  creatorAddress?: string | null;
  name: string;
  symbol: string;
  logoUri?: string | null;
  status?: string | null;
  marketcapBnb?: string | null;
  vol24hBnb?: string | null;
  votes24h?: number | null;
  votesAllTime?: number | null;
  createdAtChain?: string | null;
};

export type ArenaSummaryItem = {
  id: string;
  label: string;
  href: string;
  status?: string;
  meta?: string;
};

export type ArenaOverviewResponse = {
  sponsored: ArenaFeedItem[];
  featured: ArenaFeedItem[];
  liveBattles: ArenaFeedItem[];
  openForBattle: ArenaFeedItem[];
  eventsAndLeagues: ArenaSummaryItem[];
  updatedAt: string;
  warning?: string;
};

export type ArenaEventsResponse = {
  active: ArenaSummaryItem[];
  upcoming: ArenaSummaryItem[];
  tournaments: ArenaSummaryItem[];
  updatedAt: string;
  warning?: string;
};

export async function fetchArenaOverview(chainId = 97): Promise<ArenaOverviewResponse> {
  return apiJson<ArenaOverviewResponse>(`/api/arena-overview?chainId=${chainId}`);
}

export async function fetchArenaEvents(chainId = 97): Promise<ArenaEventsResponse> {
  return apiJson<ArenaEventsResponse>(`/api/arena-events?chainId=${chainId}`);
}
