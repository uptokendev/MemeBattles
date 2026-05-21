import type { CampaignInfo } from "@/lib/launchpadClient";

export type WarRoomCampaignMetrics = {
  marketCapUsd: number;
  marketCapLabel: string;
  liquidityUsd: number;
  liquidityLabel: string;
  volumeUsd: number;
  volumeLabel: string;
  holdersCount: number;
  holdersLabel: string;
  athMarketCapUsd: number;
  athLabel: string;
  athProgressPct: number;
  status: "graduated" | "draft";
  ageSeconds: number;
  trendScore: number;
  hasRichStats: boolean;
};

export function parseCompactNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);

  const raw = String(value ?? "").trim();
  if (!raw || raw === "—") return 0;

  const normalized = raw.replace(/[$,\s]/g, "").toLowerCase();
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)([kmb])?/);
  if (!match) return 0;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;

  const multiplier = match[2] === "b" ? 1_000_000_000 : match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
  return amount * multiplier;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatCompactUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 1 : 2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatCompactCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)}K`;
  return value.toLocaleString();
}

function getAgeSeconds(campaign: CampaignInfo) {
  const createdAt = Number(campaign.createdAt ?? 0);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor(Date.now() / 1000) - createdAt);
}

export function getWarRoomCampaignStatus(campaign: CampaignInfo): "graduated" | "draft" {
  const rich = campaign as any;
  return rich.status === "graduated" || rich.isDexTrading || campaign.dexPairAddress || campaign.dexScreenerUrl ? "graduated" : "draft";
}

export function getWarRoomCampaignMetrics(campaign: CampaignInfo, bnbUsd = 0): WarRoomCampaignMetrics {
  const rich = campaign as any;
  const usd = Number.isFinite(Number(bnbUsd)) && Number(bnbUsd) > 0 ? Number(bnbUsd) : 0;

  const marketCapBnb = toNumber(rich.marketCapBnb ?? rich.marketcapBnb ?? rich.marketcap_bnb);
  const volumeBnb = toNumber(rich.volumeBnb ?? rich.vol24hBnb ?? rich.vol_24h_bnb);
  const raisedTotalBnb = toNumber(rich.raisedTotalBnb ?? rich.raised_total_bnb);
  const holdersCount = toNumber(rich.holdersCount ?? rich.holderCount ?? rich.holder_count) || parseCompactNumber(campaign.holders);
  const athMarketCapBnb = toNumber(rich.athMarketCapBnb ?? rich.athMarketcapBnb ?? rich.ath_marketcap_bnb);

  const marketCapUsd = marketCapBnb > 0 && usd > 0 ? marketCapBnb * usd : parseCompactNumber(campaign.marketCap);
  const volumeUsd = volumeBnb > 0 && usd > 0 ? volumeBnb * usd : parseCompactNumber(campaign.volume);
  const liquidityUsd = raisedTotalBnb > 0 && usd > 0 ? raisedTotalBnb * usd : marketCapUsd > 0 ? marketCapUsd * 0.12 : 0;
  const athMarketCapUsd = athMarketCapBnb > 0 && usd > 0 ? athMarketCapBnb * usd : marketCapUsd;
  const athProgressPct = athMarketCapUsd > 0 && marketCapUsd > 0 ? Math.min(100, Math.max(1, Math.round((marketCapUsd / athMarketCapUsd) * 100))) : 0;
  const ageSeconds = getAgeSeconds(campaign);
  const recencyBoost = ageSeconds === Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, 1_000_000 - ageSeconds) / 1_000_000;
  const votes24h = toNumber(rich.votes24h ?? rich.votes_24h);
  const trendScore = volumeUsd * 0.5 + marketCapUsd * 0.28 + holdersCount * 40 + votes24h * 25 + recencyBoost * 100_000;
  const hasRichStats = marketCapBnb > 0 || volumeBnb > 0 || holdersCount > 0 || raisedTotalBnb > 0;

  return {
    marketCapUsd,
    marketCapLabel: formatCompactUsd(marketCapUsd),
    liquidityUsd,
    liquidityLabel: formatCompactUsd(liquidityUsd),
    volumeUsd,
    volumeLabel: formatCompactUsd(volumeUsd),
    holdersCount,
    holdersLabel: formatCompactCount(holdersCount),
    athMarketCapUsd,
    athLabel: formatCompactUsd(athMarketCapUsd),
    athProgressPct,
    status: getWarRoomCampaignStatus(campaign),
    ageSeconds,
    trendScore,
    hasRichStats,
  };
}
