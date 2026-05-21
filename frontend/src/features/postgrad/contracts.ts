import { z } from "zod";

export const graduatedTokenSchema = z.object({
  id: z.string(),
  campaignAddress: z.string(),
  name: z.string(),
  symbol: z.string(),
  logoUri: z.string().url().or(z.string().startsWith("/")).optional(),
  graduatedAt: z.string(),
  marketCapUsd: z.number().nonnegative(),
  liquidityUsd: z.number().nonnegative(),
  holders: z.number().int().nonnegative(),
  battleEligible: z.boolean(),
  tacticalTags: z.array(z.string()).default([]),
});

export const mockTokenProfileSchema = graduatedTokenSchema.extend({
  thesis: z.string(),
  commanderNotes: z.array(z.string()).default([]),
  socials: z.object({
    website: z.string(),
    x: z.string(),
    telegram: z.string(),
  }),
  watchlistCount: z.number().int().nonnegative(),
  sentiment: z.enum(["heating_up", "stable", "volatile"]),
  battleStyle: z.enum(["momentum", "holder_grind", "whale_surge", "community_swarm"]),
  mockTrades: z.array(
    z.object({
      timeLabel: z.string(),
      side: z.enum(["buy", "sell"]),
      sizeLabel: z.string(),
      traderLabel: z.string(),
    }),
  ).default([]),
});

export const battleStateSchema = z.enum([
  "draft",
  "open_for_battle",
  "pending",
  "accepted",
  "live",
  "completed",
  "settled",
  "cancelled",
]);

export const battleParticipantSchema = z.object({
  tokenId: z.string(),
  tokenName: z.string(),
  symbol: z.string(),
  score: z.number().nonnegative(),
  priceChangePct: z.number(),
  volumeUsd: z.number().nonnegative(),
  uniqueTraders: z.number().int().nonnegative(),
  holdersDelta: z.number().int(),
});

export const battleSchema = z.object({
  id: z.string(),
  state: battleStateSchema,
  format: z.enum(["duel", "rumble", "event_match"]),
  startedAt: z.string().optional(),
  endsAt: z.string().optional(),
  settlementAt: z.string().optional(),
  featured: z.boolean().default(false),
  arenaLane: z.enum(["live_battles", "open_for_battle", "events_and_leagues"]),
  participants: z.array(battleParticipantSchema).min(2),
});

export const warPoolEntrySchema = z.object({
  battleId: z.string(),
  sideTokenId: z.string(),
  amountUsd: z.number().positive(),
  enteredAt: z.string(),
  payoutEligible: z.boolean(),
});

export const warPoolSchema = z.object({
  battleId: z.string(),
  state: z.enum(["open", "locked", "settling", "paid"]),
  totalPotUsd: z.number().nonnegative(),
  cutoffAt: z.string(),
  routingBreakdown: z.object({
    winnersUsd: z.number().nonnegative(),
    protocolUsd: z.number().nonnegative(),
    featuredUsd: z.number().nonnegative(),
  }),
  entries: z.array(warPoolEntrySchema).default([]),
});

export const eventTypeSchema = z.enum([
  "battle_weekend",
  "battle_night",
  "featured_rivalry",
  "tournament",
  "seasonal_league",
]);

export const eventStatusSchema = z.enum(["scheduled", "deploying", "live", "completed"]);
export const tournamentBracketStageSchema = z.enum(["registration", "quarterfinals", "semifinals", "finals", "completed"]);
export const leagueDivisionSchema = z.enum(["bronze", "silver", "gold", "apex"]);
export const leagueMovementSchema = z.enum(["promoted", "safe", "relegated"]);
export const leagueSeasonStateSchema = z.enum(["preseason", "live", "playoffs", "completed"]);
export const quickTradeSideSchema = z.enum(["buy", "sell"]);
export const quickTradeStatusSchema = z.enum(["queued", "filled", "rejected"]);
export const weeklyRewardStatusSchema = z.enum(["locked", "claimable", "claimed"]);
export const weeklyRewardTierSchema = z.enum(["watchlist_boost", "fee_rebate", "featured_slot_draw", "war_pool_credit"]);

export const eventSchema = z.object({
  id: z.string(),
  type: eventTypeSchema,
  title: z.string(),
  status: eventStatusSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  participantCount: z.number().int().nonnegative(),
  summary: z.string(),
});

export const rankingEntrySchema = z.object({
  rank: z.number().int().positive(),
  tokenId: z.string(),
  label: z.string(),
  metricLabel: z.string(),
  metricValue: z.string(),
  deltaLabel: z.string().optional(),
});

export const rankingPayloadSchema = z.object({
  key: z.enum(["trending", "volume", "battle_activity", "league_table"]),
  generatedAt: z.string(),
  entries: z.array(rankingEntrySchema),
});

export const leagueEntrySchema = z.object({
  tokenId: z.string(),
  tokenName: z.string(),
  symbol: z.string(),
  division: leagueDivisionSchema,
  points: z.number().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  streak: z.number().int(),
  movement: leagueMovementSchema,
});

export const leagueSeasonSchema = z.object({
  id: z.string(),
  label: z.string(),
  state: leagueSeasonStateSchema,
  week: z.number().int().positive(),
  rewardPoolUsd: z.number().nonnegative(),
  resetAt: z.string(),
  divisions: z.array(leagueDivisionSchema),
  entries: z.array(leagueEntrySchema),
});

export const tradeRoomFilterSchema = z.object({
  search: z.string().default(""),
  watchlistOnly: z.boolean().default(false),
  minimumLiquidityUsd: z.number().nonnegative().default(0),
  sort: z.enum(["heat", "volume", "holders", "watchers"]).default("heat"),
  postGradOnly: z.boolean().default(true),
});

export const quickTradeRequestSchema = z.object({
  tokenId: z.string(),
  side: quickTradeSideSchema,
  amountUsd: z.number().positive(),
  source: z.enum(["war_room", "token_profile"]).default("war_room"),
});

export const quickTradeResultSchema = quickTradeRequestSchema.extend({
  id: z.string(),
  status: quickTradeStatusSchema,
  createdAt: z.string(),
  executionPriceLabel: z.string(),
  estimatedImpactBps: z.number().int().nonnegative(),
  statusDetail: z.string(),
});

export const commanderWeeklyRewardSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  tier: weeklyRewardTierSchema,
  unlockAtDays: z.number().int().positive(),
  status: weeklyRewardStatusSchema,
});

export const commanderStreakStateSchema = z.object({
  currentStreakDays: z.number().int().nonnegative(),
  bestStreakDays: z.number().int().nonnegative(),
  weekProgressDays: z.number().int().nonnegative(),
  weeklyGoalDays: z.number().int().positive(),
  rewardCycle: z.number().int().nonnegative(),
  claimedRewardsCount: z.number().int().nonnegative(),
  nextCheckInAt: z.string(),
  activeReward: commanderWeeklyRewardSchema,
  lastClaimedRewardLabel: z.string().optional(),
  lastClaimedAt: z.string().optional(),
});

export const realtimeBattleUpdateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("battle.state"),
    battleId: z.string(),
    state: battleStateSchema,
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal("battle.score"),
    battleId: z.string(),
    timestamp: z.string(),
    scores: z.array(
      z.object({
        tokenId: z.string(),
        score: z.number().nonnegative(),
      }),
    ),
  }),
  z.object({
    type: z.literal("battle.timer"),
    battleId: z.string(),
    timestamp: z.string(),
    secondsRemaining: z.number().int().nonnegative(),
  }),
]);

export const POST_GRAD_BATTLE_TRANSITIONS: Record<z.infer<typeof battleStateSchema>, z.infer<typeof battleStateSchema>[]> = {
  draft: ["open_for_battle", "cancelled"],
  open_for_battle: ["pending", "cancelled"],
  pending: ["accepted", "cancelled"],
  accepted: ["live", "cancelled"],
  live: ["completed"],
  completed: ["settled"],
  settled: [],
  cancelled: [],
};

export const POST_GRAD_EVENT_TRANSITIONS: Record<z.infer<typeof eventStatusSchema>, z.infer<typeof eventStatusSchema>[]> = {
  scheduled: ["deploying", "live"],
  deploying: ["live"],
  live: ["completed"],
  completed: [],
};

export const TOURNAMENT_BRACKET_STAGES: z.infer<typeof tournamentBracketStageSchema>[] = [
  "registration",
  "quarterfinals",
  "semifinals",
  "finals",
  "completed",
];

export type GraduatedToken = z.infer<typeof graduatedTokenSchema>;
export type MockTokenProfile = z.infer<typeof mockTokenProfileSchema>;
export type BattleState = z.infer<typeof battleStateSchema>;
export type BattleParticipant = z.infer<typeof battleParticipantSchema>;
export type Battle = z.infer<typeof battleSchema>;
export type WarPool = z.infer<typeof warPoolSchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type TournamentBracketStage = z.infer<typeof tournamentBracketStageSchema>;
export type LeagueDivision = z.infer<typeof leagueDivisionSchema>;
export type LeagueMovement = z.infer<typeof leagueMovementSchema>;
export type LeagueSeasonState = z.infer<typeof leagueSeasonStateSchema>;
export type QuickTradeSide = z.infer<typeof quickTradeSideSchema>;
export type QuickTradeStatus = z.infer<typeof quickTradeStatusSchema>;
export type WeeklyRewardStatus = z.infer<typeof weeklyRewardStatusSchema>;
export type WeeklyRewardTier = z.infer<typeof weeklyRewardTierSchema>;
export type EventCardContract = z.infer<typeof eventSchema>;
export type RankingEntry = z.infer<typeof rankingEntrySchema>;
export type RankingPayload = z.infer<typeof rankingPayloadSchema>;
export type LeagueEntry = z.infer<typeof leagueEntrySchema>;
export type LeagueSeason = z.infer<typeof leagueSeasonSchema>;
export type TradeRoomFilter = z.infer<typeof tradeRoomFilterSchema>;
export type QuickTradeRequest = z.infer<typeof quickTradeRequestSchema>;
export type QuickTradeResult = z.infer<typeof quickTradeResultSchema>;
export type CommanderWeeklyReward = z.infer<typeof commanderWeeklyRewardSchema>;
export type CommanderStreakState = z.infer<typeof commanderStreakStateSchema>;
export type RealtimeBattleUpdate = z.infer<typeof realtimeBattleUpdateSchema>;
