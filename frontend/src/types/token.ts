/**
 * Token-related TypeScript interfaces and types
 */

export type TokenCategory = "meme" | "project";

export type ProcessingStatus = "queued" | "running" | "succeeded" | "failed";

export interface TokenFormData {
  name: string;
  ticker: string;
  description: string;
  category: TokenCategory;
  image: File | null;
  imagePreview: string;
  website: string;
  twitter: string;
  telegram: string;
  discord: string;
  otherLink: string;
  showSocialLinks: boolean;
}

export interface Token {
  id: number;
  image: string;
  ticker: string;
  name: string;

  // Address-first routing
  campaignAddress?: string; // LaunchCampaign address
  tokenAddress?: string; // LaunchToken address (after deploy)
  holders: string;
  volume: string;
  marketCap: string;
  timeAgo: string;
  hasWebsite?: boolean;
  hasTwitter?: boolean;
  hasTelegram?: boolean;
  hasDiscord?: boolean;
  hasOtherLink?: boolean;
}

export interface TokenMetrics {
  change: number;
  volume: number;
}

export interface TokenDetailsData {
  id: string;
  image: string;
  ticker: string;
  name: string;
  contractAddress: string;
  marketCap: number;
  marketCapChange: number;
  price: number;
  liquidity: number;
  holders: number;
  metrics: {
    "5m": TokenMetrics;
    "1h": TokenMetrics;
    "4h": TokenMetrics;
    "24h": TokenMetrics;
  };
  hasWebsite: boolean;
  hasTwitter: boolean;
  hasTelegram: boolean;
  hasDiscord: boolean;
  hasOtherLink: boolean;
}

export interface Transaction {
  time: string;
  type: "buy" | "sell";
  amount: string;
  bnb: string;
  price: string;
  mcap: string; // formatted in BNB
  trader: string;
  tx: string;
}
export type TradeSide = "buy" | "sell";

export interface RawTradeEvent {
  campaignAddress: string;     // LaunchCampaign address
  txHash: string;
  blockNumber: number;
  logIndex: number;

  side: TradeSide;             // "buy" (TokensPurchased) or "sell" (TokensSold)
  trader: string;              // buyer or seller

  tokenAmount: bigint;         // amountOut (buy) or amountIn (sell)
  baseAmountWei: bigint;       // cost (buy) or payout (sell) in BNB (wei)

  timestamp: number;           // unix seconds from block.timestamp
}
