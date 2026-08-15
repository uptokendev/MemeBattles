import type { LeagueCabinet, LeagueCabinetMastery, LeagueCabinetWin } from "@/lib/leagueCabinet";

function normalizeApiBase(value: unknown): string {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  return `https://${raw}`;
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL);

function buildUrl(pathWithQuery: string): string {
  if (API_BASE) {
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

function isSolanaChain(chainId: number): boolean {
  const id = Number(chainId);
  return id === 101 || id === 102;
}

function emptyCabinet(): LeagueCabinet {
  return normalizeCabinet({ summary: {}, items: [], mastery: [] });
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
  const wallet = isSolanaChain(chainId) ? String(address || "").trim() : String(address || "").toLowerCase();
  if (!wallet) return emptyCabinet();

  const url = buildUrl(
    `/api/profileCabinet?chainId=${encodeURIComponent(String(chainId))}&address=${encodeURIComponent(wallet)}`
  );

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    if (res.status === 404) {
      return emptyCabinet();
    }
    const j = await readJson(res);
    throw new Error(j?.error || `Failed to load profile cabinet (${res.status})`);
  }

  const j = await readJson(res);
  return normalizeCabinet(j?.cabinet ?? { summary: {}, items: [], mastery: [] });
}
