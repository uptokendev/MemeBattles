import type { LeagueCabinet, LeagueCabinetMastery, LeagueCabinetWin } from "@/lib/leagueCabinet";

const rawBase = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();
const API_BASE = rawBase.replace(/\/$/, "");

function buildUrl(pathWithQuery: string): string {
  if (API_BASE && /^https?:\/\//i.test(API_BASE)) {
    return `${API_BASE}${pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`}`;
  }
  return new URL(pathWithQuery, window.location.origin).toString();
}

async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeCabinet(raw: any): LeagueCabinet {
  const summary = raw?.summary ?? {};
  const items = Array.isArray(raw?.items) ? raw.items : [];
  const mastery = Array.isArray(raw?.mastery) ? raw.mastery : [];

  return {
    summary: {
      totalWins: Number(summary.totalWins ?? 0),
      totalTitles: Number(summary.totalTitles ?? 0),
      uniqueLeagues: Number(summary.uniqueLeagues ?? 0),
      latestWinAt: (summary.latestWinAt ?? null) as string | null,
      favoriteLeague: (summary.favoriteLeague ?? null) as any,
      bestTier: (summary.bestTier ?? null) as string | null,
    },
    items: items.map((item: any): LeagueCabinetWin => ({
      id: String(item.id),
      chainId: Number(item.chainId),
      period: item.period,
      epochStart: String(item.epochStart),
      epochEnd: String(item.epochEnd),
      category: item.category,
      rank: Number(item.rank),
      recipientAddress: String(item.recipientAddress),
      amountRaw: String(item.amountRaw ?? "0"),
      expiresAt: item.expiresAt == null ? null : String(item.expiresAt),
      isTitle: Boolean(item.isTitle),
      meta: item.meta ?? {},
    })),
    mastery: mastery.map((entry: any): LeagueCabinetMastery => ({
      category: entry.category,
      wins: Number(entry.wins ?? 0),
      titles: Number(entry.titles ?? 0),
      bestRank: entry.bestRank == null ? null : Number(entry.bestRank),
      latestEpochEnd: entry.latestEpochEnd == null ? null : String(entry.latestEpochEnd),
      dominantPeriod: entry.dominantPeriod,
      tier: String(entry.tier ?? "Unranked"),
      nextTier: entry.nextTier == null ? null : String(entry.nextTier),
      nextThreshold: entry.nextThreshold == null ? null : Number(entry.nextThreshold),
      progressPercent: Number(entry.progressPercent ?? 0),
    })),
  };
}

export async function fetchLeagueCabinet(chainId: number, address: string): Promise<LeagueCabinet> {
  const url = buildUrl(
    `/api/profileCabinet?chainId=${encodeURIComponent(String(chainId))}&address=${encodeURIComponent(address.toLowerCase())}`
  );

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    if (res.status === 404) {
      return normalizeCabinet({ summary: {}, items: [], mastery: [] });
    }
    const j = await readJson(res);
    throw new Error(j?.error || `Failed to load profile cabinet (${res.status})`);
  }

  const j = await readJson(res);
  return normalizeCabinet(j?.cabinet ?? { summary: {}, items: [], mastery: [] });
}
