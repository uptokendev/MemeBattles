import { pool } from "../server/db.js";
import { badMethod, getQuery, isAddress, json } from "../server/http.js";

const TIER_STEPS = [
  { tier: "Bronze", minWins: 1 },
  { tier: "Silver", minWins: 3 },
  { tier: "Gold", minWins: 5 },
  { tier: "Platinum", minWins: 10 },
  { tier: "Diamond", minWins: 25 },
  { tier: "Legend", minWins: 50 },
];

function getTierInfo(wins) {
  const totalWins = Number.isFinite(Number(wins)) ? Math.max(0, Math.trunc(Number(wins))) : 0;
  let current = null;
  let next = null;

  for (const step of TIER_STEPS) {
    if (totalWins >= step.minWins) current = step;
    else {
      next = step;
      break;
    }
  }

  if (!current && next) {
    return {
      tier: "Unranked",
      currentMinWins: 0,
      nextTier: next.tier,
      nextThreshold: next.minWins,
      progressPercent: 0,
    };
  }

  if (!current) {
    return {
      tier: "Unranked",
      currentMinWins: 0,
      nextTier: null,
      nextThreshold: null,
      progressPercent: 0,
    };
  }

  if (!next) {
    return {
      tier: current.tier,
      currentMinWins: current.minWins,
      nextTier: null,
      nextThreshold: null,
      progressPercent: 100,
    };
  }

  const span = Math.max(1, next.minWins - current.minWins);
  const progressPercent = Math.max(0, Math.min(100, ((totalWins - current.minWins) / span) * 100));

  return {
    tier: current.tier,
    currentMinWins: current.minWins,
    nextTier: next.tier,
    nextThreshold: next.minWins,
    progressPercent,
  };
}

function preferredPeriodFor(items) {
  const weekly = items.filter((x) => x.period === "weekly").length;
  const monthly = items.length - weekly;
  if (weekly === monthly) return items[0]?.period ?? "weekly";
  return weekly > monthly ? "weekly" : "monthly";
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId);
    const address = String(q.address ?? "").trim().toLowerCase();

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!isAddress(address)) return json(res, 400, { error: "Invalid address" });

    let rows;
    try {
      ({ rows } = await pool.query(
        `SELECT chain_id AS "chainId",
                period,
                epoch_start AS "epochStart",
                epoch_end AS "epochEnd",
                category,
                rank,
                recipient_address AS "recipientAddress",
                amount_raw::text AS "amountRaw",
                expires_at AS "expiresAt",
                meta
           FROM public.league_epoch_winners
          WHERE chain_id = $1
            AND lower(recipient_address) = $2
          ORDER BY epoch_end DESC NULLS LAST, epoch_start DESC, category ASC, rank ASC
          LIMIT 500`,
        [chainId, address]
      ));
    } catch (e) {
      if (e?.code !== "42703") throw e;
      ({ rows } = await pool.query(
        `SELECT chain_id AS "chainId",
                period,
                epoch_start AS "epochStart",
                epoch_end AS "epochEnd",
                category,
                rank,
                recipient_address AS "recipientAddress",
                amount_raw::text AS "amountRaw",
                expires_at AS "expiresAt",
                payload AS meta
           FROM public.league_epoch_winners
          WHERE chain_id = $1
            AND lower(recipient_address) = $2
          ORDER BY epoch_end DESC NULLS LAST, epoch_start DESC, category ASC, rank ASC
          LIMIT 500`,
        [chainId, address]
      ));
    }

    const items = rows.map((row) => ({
      id: `${row.period}:${row.epochStart instanceof Date ? row.epochStart.toISOString() : String(row.epochStart)}:${row.category}:${row.rank}`,
      chainId: Number(row.chainId),
      period: row.period,
      epochStart: row.epochStart instanceof Date ? row.epochStart.toISOString() : String(row.epochStart),
      epochEnd: row.epochEnd instanceof Date ? row.epochEnd.toISOString() : String(row.epochEnd),
      category: String(row.category),
      rank: Number(row.rank),
      recipientAddress: String(row.recipientAddress).toLowerCase(),
      amountRaw: String(row.amountRaw ?? "0"),
      expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt ? String(row.expiresAt) : null,
      isTitle: Number(row.rank) === 1,
      meta: row.meta ?? {},
    }));

    const masteryMap = new Map();
    for (const item of items) {
      const existing = masteryMap.get(item.category) ?? {
        category: item.category,
        wins: 0,
        titles: 0,
        bestRank: null,
        latestEpochEnd: null,
        periods: [],
      };

      existing.wins += 1;
      if (item.rank === 1) existing.titles += 1;
      existing.bestRank = existing.bestRank == null ? item.rank : Math.min(existing.bestRank, item.rank);
      existing.latestEpochEnd = !existing.latestEpochEnd || item.epochEnd > existing.latestEpochEnd ? item.epochEnd : existing.latestEpochEnd;
      existing.periods.push(item);
      masteryMap.set(item.category, existing);
    }

    const mastery = Array.from(masteryMap.values())
      .map((entry) => {
        const tierInfo = getTierInfo(entry.wins);
        return {
          category: entry.category,
          wins: entry.wins,
          titles: entry.titles,
          bestRank: entry.bestRank,
          latestEpochEnd: entry.latestEpochEnd,
          dominantPeriod: preferredPeriodFor(entry.periods),
          tier: tierInfo.tier,
          nextTier: tierInfo.nextTier,
          nextThreshold: tierInfo.nextThreshold,
          progressPercent: tierInfo.progressPercent,
        };
      })
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.titles !== a.titles) return b.titles - a.titles;
        return String(a.category).localeCompare(String(b.category));
      });

    const topMastery = mastery[0] ?? null;
    const summary = {
      totalWins: items.length,
      totalTitles: items.filter((x) => x.rank === 1).length,
      uniqueLeagues: mastery.length,
      latestWinAt: items[0]?.epochEnd ?? null,
      favoriteLeague: topMastery?.category ?? null,
      bestTier: topMastery?.tier ?? null,
    };

    return json(res, 200, { cabinet: { summary, items, mastery } });
  } catch (e) {
    const code = e?.code;
    console.error("[api/profileCabinet GET]", e);
    if (code === "42P01" || code === "42703") {
      return json(res, 200, {
        cabinet: {
          summary: {
            totalWins: 0,
            totalTitles: 0,
            uniqueLeagues: 0,
            latestWinAt: null,
            favoriteLeague: null,
            bestTier: null,
          },
          items: [],
          mastery: [],
        },
        warning: "DB schema missing league winners tables/columns",
      });
    }
    return json(res, 500, { error: "Server error" });
  }
}
