import type { CampaignInfo, CampaignMetrics } from "@/lib/launchpadClient";
import type { LaunchpadPreflight } from "@/lib/recruiterApi";

export type TxResult = {
  hash?: string;
  transactionHash?: string;
  receipt?: unknown;
  raw?: unknown;
};

export type CreateTokenInput = {
  name: string;
  symbol: string;
  logoURI: string;
  xAccount: string;
  website: string;
  extraLink: string;
  basePriceWei?: bigint;
  priceSlopeWei?: bigint;
  graduationTargetWei?: bigint;
  lpReceiver?: string;
};

export type TradeInput = {
  tokenId: string;
  amountWei: bigint;
  maxCostWei?: bigint;
  minAmountWei?: bigint;
};

export type TokenState = {
  campaign: CampaignInfo | null;
  metrics: CampaignMetrics | null;
};

export type CreatorProfile = {
  wallet: string;
  tier: string;
  trustScore: number;
  liveBondingCount: number;
  cooldownEndsAt: string | null;
  creatorBuyLockEndsAt: string | null;
  creatorBuyCapBnb: number;
  clusterWallets: number;
  restricted: boolean;
  manualReviewRequired: boolean;
};

export type EligibilityResult = LaunchpadPreflight;

export type QuoteInput = {
  tokenId: string;
  amountWei: bigint;
  side: "buy" | "sell";
};

export type QuoteResult = {
  amountWei: bigint;
  estimatedCostWei?: bigint;
  estimatedReturnWei?: bigint;
  warnings: string[];
};

export interface LaunchpadAdapter {
  chain: "bnb" | "solana";
  createToken(input: CreateTokenInput): Promise<TxResult>;
  buy(input: TradeInput): Promise<TxResult>;
  sell(input: TradeInput): Promise<TxResult>;
  getTokenState(tokenId: string): Promise<TokenState>;
  getCreatorProfile(wallet: string): Promise<CreatorProfile | null>;
  getLaunchEligibility(wallet: string): Promise<EligibilityResult>;
  getQuote(input: QuoteInput): Promise<QuoteResult>;
  graduate(tokenId: string): Promise<TxResult>;
}
