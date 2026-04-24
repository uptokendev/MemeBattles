import { formatEther } from "ethers";
import { ENV } from "../env.js";
import { listRecruiterSummaries, type RecruiterSummaryRecord } from "./readModels.js";

export type RecruiterLeaderboardWeights = {
  linkedWallets: number;
  linkedCreators: number;
  linkedTraders: number;
  routedVolumeBnb: number;
  totalEarnedBnb: number;
};

export type RecruiterLeaderboardEntry = RecruiterSummaryRecord & {
  weightedScore: number;
};

function toBnb(raw: string): number {
  try {
    return Number(formatEther(BigInt(raw || "0")));
  } catch {
    return 0;
  }
}

function compareNumericStrings(a: string, b: string): number {
  const left = BigInt(a || "0");
  const right = BigInt(b || "0");
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

export function getRecruiterLeaderboardWeights(): RecruiterLeaderboardWeights {
  return {
    linkedWallets: ENV.RECRUITER_LEADERBOARD_WEIGHT_LINKED_WALLETS,
    linkedCreators: ENV.RECRUITER_LEADERBOARD_WEIGHT_LINKED_CREATORS,
    linkedTraders: ENV.RECRUITER_LEADERBOARD_WEIGHT_LINKED_TRADERS,
    routedVolumeBnb: ENV.RECRUITER_LEADERBOARD_WEIGHT_ROUTED_VOLUME_BNB,
    totalEarnedBnb: ENV.RECRUITER_LEADERBOARD_WEIGHT_TOTAL_EARNED_BNB,
  };
}

export function computeRecruiterLeaderboardScore(
  recruiter: RecruiterSummaryRecord,
  weights: RecruiterLeaderboardWeights = getRecruiterLeaderboardWeights(),
): number {
  return (
    recruiter.linkedWalletCount * weights.linkedWallets +
    recruiter.linkedCreatorsCount * weights.linkedCreators +
    recruiter.linkedTradersCount * weights.linkedTraders +
    toBnb(recruiter.referredVolumeRaw) * weights.routedVolumeBnb +
    toBnb(recruiter.totalEarnedRaw) * weights.totalEarnedBnb
  );
}

export async function listRecruiterLeaderboard(filters: {
  status?: string | null;
  limit?: number;
}): Promise<{ recruiters: RecruiterLeaderboardEntry[]; weights: RecruiterLeaderboardWeights }> {
  const limit = Math.max(1, Math.min(200, Math.trunc(filters.limit ?? 100) || 100));
  const recruiters = await listRecruiterSummaries({ status: filters.status ?? null, limit: 500 });
  const weights = getRecruiterLeaderboardWeights();

  const entries = recruiters
    .map((recruiter) => ({
      ...recruiter,
      weightedScore: computeRecruiterLeaderboardScore(recruiter, weights),
    }))
    .sort((a, b) => {
      if (a.weightedScore !== b.weightedScore) return b.weightedScore - a.weightedScore;

      const earnedCmp = compareNumericStrings(a.totalEarnedRaw, b.totalEarnedRaw);
      if (earnedCmp !== 0) return -earnedCmp;

      if (a.linkedWalletCount !== b.linkedWalletCount) return b.linkedWalletCount - a.linkedWalletCount;
      return a.recruiterId - b.recruiterId;
    })
    .slice(0, limit);

  return { recruiters: entries, weights };
}
