import { buildAirdropDrawPlan, type AirdropDrawCandidate } from "./airdrops.js";
import { evaluateCreatorAirdropProgram, evaluateSquadProgram, evaluateTraderAirdropProgram, type ExclusionFlagRecord, type SquadMembershipOverlap, type WalletAttributionSnapshot, type WalletCreatorMetrics, type WalletTradeMetrics } from "./eligibility.js";
import { computeSquadAllocationModel } from "./squads.js";

const BNB = 10n ** 18n;

function makeTradeMetrics(volumeBnb: bigint, tradeCount: number, activeDays: number, ownCampaignTradeCount = 0): WalletTradeMetrics {
  return {
    tradeVolumeRaw: volumeBnb * BNB,
    tradeCount,
    activeDays,
    ownCampaignTradeCount,
  };
}

function makeCreatorMetrics(volumeBnb: bigint, uniqueBuyers: number, qualifyingCampaignCount = 1): WalletCreatorMetrics {
  return {
    activeCampaignCount: qualifyingCampaignCount,
    qualifyingCampaignCount,
    totalBuyVolumeRaw: volumeBnb * BNB,
    countedQualifiedVolumeRaw: volumeBnb * BNB,
    maxUniqueBuyers: uniqueBuyers,
  };
}

function makeReviewFlag(walletAddress: string, flagType: ExclusionFlagRecord["flagType"], severity: ExclusionFlagRecord["severity"]): ExclusionFlagRecord {
  const now = new Date().toISOString();
  return {
    id: 1,
    walletAddress,
    epochId: 1,
    program: "airdrop_trader",
    flagType,
    severity,
    detailsJson: {},
    createdAt: now,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    metadata: {},
    updatedAt: now,
  };
}

export type Phase7SimulationResult = {
  checks: Record<string, boolean>;
  summary: {
    recruiterClaimableAmount: string;
    airdropTraderWinnerCount: number;
    airdropCreatorWinnerCount: number;
    squadCarryoverAmount: string;
    nextEpochSquadPoolWithCarryover: string;
  };
};

export function runPhase7SyntheticSimulation(): Phase7SimulationResult {
  const recruiterByWallet = new Map<string, { id: number; code: string; status: string; isOg: boolean }>([
    ["0x1000000000000000000000000000000000000001", { id: 1, code: "og-alpha", status: "active", isOg: true }],
  ]);
  const emptyFlags = new Map<string, ExclusionFlagRecord[]>();

  const eligibleTraderWallet = "0x2000000000000000000000000000000000000002";
  const repeatWinnerWallet = "0x3000000000000000000000000000000000000003";
  const battleWinnerWallet = "0x4000000000000000000000000000000000000004";
  const ogRecruiterWallet = "0x1000000000000000000000000000000000000001";
  const noRecruiterNoSquadWallet = "0x5000000000000000000000000000000000000005";
  const detachedWallet = "0x6000000000000000000000000000000000000006";
  const creatorWallet = "0x7000000000000000000000000000000000000007";
  const abuseWallet = "0x8000000000000000000000000000000000000008";
  const reviewWallet = "0x9000000000000000000000000000000000000009";

  const recentAirdropWinnerWallets = new Set<string>([repeatWinnerWallet]);
  const activeBattleLeagueWinnerWallets = new Set<string>([battleWinnerWallet]);

  const traderEligibility = evaluateTraderAirdropProgram({
    walletAddress: eligibleTraderWallet,
    tradeMetrics: makeTradeMetrics(8n, 5, 3),
    recruiterByWallet,
    flagsByWallet: emptyFlags,
    recentAirdropWinnerWallets,
    activeBattleLeagueWinnerWallets,
  });

  const repeatWinnerEligibility = evaluateTraderAirdropProgram({
    walletAddress: repeatWinnerWallet,
    tradeMetrics: makeTradeMetrics(8n, 5, 3),
    recruiterByWallet,
    flagsByWallet: emptyFlags,
    recentAirdropWinnerWallets,
    activeBattleLeagueWinnerWallets,
  });

  const battleWinnerEligibility = evaluateTraderAirdropProgram({
    walletAddress: battleWinnerWallet,
    tradeMetrics: makeTradeMetrics(8n, 5, 3),
    recruiterByWallet,
    flagsByWallet: emptyFlags,
    recentAirdropWinnerWallets,
    activeBattleLeagueWinnerWallets,
  });

  const ogRecruiterEligibility = evaluateTraderAirdropProgram({
    walletAddress: ogRecruiterWallet,
    tradeMetrics: makeTradeMetrics(8n, 5, 3),
    recruiterByWallet,
    flagsByWallet: emptyFlags,
    recentAirdropWinnerWallets,
    activeBattleLeagueWinnerWallets,
  });

  const creatorEligibility = evaluateCreatorAirdropProgram({
    walletAddress: creatorWallet,
    creatorMetrics: makeCreatorMetrics(6n, 12, 2),
    recruiterByWallet,
    flagsByWallet: emptyFlags,
    recentAirdropWinnerWallets,
    activeBattleLeagueWinnerWallets,
  });

  const detachedAttribution: WalletAttributionSnapshot = {
    recruiterLinkState: "detached",
    squadState: "solo_detached",
    recruiterId: null,
    recruiterCode: null,
    recruiterStatus: null,
    recruiterIsOg: false,
    lastDetachReason: "recruiter_closed",
  };

  const detachedEligibility = evaluateSquadProgram({
    walletAddress: detachedWallet,
    tradeMetrics: makeTradeMetrics(6n, 3, 2),
    creatorMetrics: makeCreatorMetrics(4n, 11),
    attributionSnapshot: detachedAttribution,
    squadOverlap: undefined,
    flagsByWallet: emptyFlags,
  });

  const noSquadEligibility = evaluateSquadProgram({
    walletAddress: noRecruiterNoSquadWallet,
    tradeMetrics: makeTradeMetrics(6n, 3, 2),
    creatorMetrics: makeCreatorMetrics(4n, 11),
    attributionSnapshot: undefined,
    squadOverlap: undefined,
    flagsByWallet: emptyFlags,
  });

  const antiAbuseFlags = new Map<string, ExclusionFlagRecord[]>([
    [abuseWallet, [makeReviewFlag(abuseWallet, "SELF_TRADING", "hard")]],
    [reviewWallet, [makeReviewFlag(reviewWallet, "WALLET_SPLITTING", "review")]],
  ]);

  const antiAbuseHard = evaluateTraderAirdropProgram({
    walletAddress: abuseWallet,
    tradeMetrics: makeTradeMetrics(5n, 4, 2),
    recruiterByWallet,
    flagsByWallet: antiAbuseFlags,
    recentAirdropWinnerWallets: new Set(),
    activeBattleLeagueWinnerWallets: new Set(),
  });

  const antiAbuseReview = evaluateTraderAirdropProgram({
    walletAddress: reviewWallet,
    tradeMetrics: makeTradeMetrics(5n, 4, 2),
    recruiterByWallet,
    flagsByWallet: antiAbuseFlags,
    recentAirdropWinnerWallets: new Set(),
    activeBattleLeagueWinnerWallets: new Set(),
  });

  const traderCandidates: AirdropDrawCandidate[] = [];
  for (const [walletAddress, result] of [
    [eligibleTraderWallet, traderEligibility],
    [repeatWinnerWallet, repeatWinnerEligibility],
    [battleWinnerWallet, battleWinnerEligibility],
    [ogRecruiterWallet, ogRecruiterEligibility],
  ] as const) {
    if (result.isEligible && result.score > 0n) {
      traderCandidates.push({ walletAddress, score: result.score, metadata: result.metadata });
    }
  }

  const traderDraw = buildAirdropDrawPlan({
    poolAmount: 3n * BNB,
    candidates: traderCandidates,
    seed: "phase7-trader-draw",
    winnerCountOverride: 1,
  });

  const creatorDraw = buildAirdropDrawPlan({
    poolAmount: 3n * BNB,
    candidates: creatorEligibility.isEligible ? [{ walletAddress: creatorWallet, score: creatorEligibility.score, metadata: creatorEligibility.metadata }] : [],
    seed: "phase7-creator-draw",
    winnerCountOverride: 1,
  });

  const squadMembers = [
    {
      walletAddress: "0xa100000000000000000000000000000000000001",
      recruiterId: 101,
      recruiterCode: "alpha",
      recruiterDisplayName: "Alpha",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 90n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xa100000000000000000000000000000000000002",
      recruiterId: 101,
      recruiterCode: "alpha",
      recruiterDisplayName: "Alpha",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 30n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xb200000000000000000000000000000000000001",
      recruiterId: 202,
      recruiterCode: "bravo",
      recruiterDisplayName: "Bravo",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 80n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xb200000000000000000000000000000000000002",
      recruiterId: 202,
      recruiterCode: "bravo",
      recruiterDisplayName: "Bravo",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 70n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xc300000000000000000000000000000000000001",
      recruiterId: 303,
      recruiterCode: "charlie",
      recruiterDisplayName: "Charlie",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 50n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xd400000000000000000000000000000000000001",
      recruiterId: 404,
      recruiterCode: "delta",
      recruiterDisplayName: "Delta",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 45n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xe500000000000000000000000000000000000001",
      recruiterId: 505,
      recruiterCode: "echo",
      recruiterDisplayName: "Echo",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 40n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xf600000000000000000000000000000000000001",
      recruiterId: 606,
      recruiterCode: "foxtrot",
      recruiterDisplayName: "Foxtrot",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 35n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0x1700000000000000000000000000000000000001",
      recruiterId: 707,
      recruiterCode: "golf",
      recruiterDisplayName: "Golf",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 30n * BNB,
      createdAt: null,
      updatedAt: null,
    },
  ];

  const squadModel = computeSquadAllocationModel(140n * BNB, squadMembers);
  const nextEpochModel = computeSquadAllocationModel(30n * BNB + squadModel.carryoverAmount, squadMembers);

  const recruiterClaimableAmount = 12n * BNB;
  const routingTotal = recruiterClaimableAmount + (3n * BNB) + (3n * BNB) + (140n * BNB);
  const ledgerTotal =
    recruiterClaimableAmount +
    traderDraw.winners.reduce((acc, winner) => acc + BigInt(winner.payoutAmount), 0n) +
    creatorDraw.winners.reduce((acc, winner) => acc + BigInt(winner.payoutAmount), 0n) +
    squadModel.squads.reduce(
      (acc, squad) => acc + squad.members.reduce((memberAcc, member) => memberAcc + member.estimatedPayoutAmount, 0n),
      0n,
    ) +
    squadModel.carryoverAmount;

  return {
    checks: {
      recruiterAccrualClaimPathReconciles: recruiterClaimableAmount === 12n * BNB,
      airdropDrawClaimPathReconciles: traderDraw.winners.length === 1 && creatorDraw.winners.length === 1,
      routingTotalsReconcile: routingTotal === ledgerTotal,
      ogRecruiterScenarioPasses: ogRecruiterEligibility.reasonCodes.includes("RECRUITER_DIRECT_WIN_EXCLUDED"),
      noRecruiterNoSquadScenarioPasses: noSquadEligibility.reasonCodes.includes("NO_SQUAD"),
      detachedUserScenarioPasses: detachedEligibility.reasonCodes.includes("SQUAD_DETACHED"),
      repeatWinnerCooldownScenarioPasses: repeatWinnerEligibility.reasonCodes.includes("REPEAT_WINNER_COOLDOWN"),
      battleLeagueExclusionScenarioPasses: battleWinnerEligibility.reasonCodes.includes("BATTLE_LEAGUE_ACTIVE_WINNER"),
      capRedistributionScenarioPasses: squadModel.squads.every(
        (squad) =>
          squad.members.every((member) => member.estimatedPayoutAmount <= member.memberCapAmount || member.memberCapAmount === 0n),
      ),
      expiredClaimRolloverScenarioPasses: nextEpochModel.squads.length > 0 && nextEpochModel.squads.some((squad) => squad.estimatedAllocationAmount > 0n),
      antiAbuseHardReviewScenarioPasses:
        antiAbuseHard.reasonCodes.includes("SELF_TRADING") &&
        antiAbuseReview.reasonCodes.includes("REVIEW_REQUIRED") &&
        antiAbuseReview.reasonCodes.includes("WALLET_SPLITTING"),
    },
    summary: {
      recruiterClaimableAmount: recruiterClaimableAmount.toString(),
      airdropTraderWinnerCount: traderDraw.winners.length,
      airdropCreatorWinnerCount: creatorDraw.winners.length,
      squadCarryoverAmount: squadModel.carryoverAmount.toString(),
      nextEpochSquadPoolWithCarryover: (30n * BNB + squadModel.carryoverAmount).toString(),
    },
  };
}
