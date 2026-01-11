/**
 * Mock data used throughout the application
 */

import { Token, TokenDetailsData, Transaction, RawTradeEvent } from "@/types/token";
import { Coin } from "@/types/profile";

// TopBar ticker items
export const tickerItems = [
  { name: "token.ticker", price: "30.10M BNB", change: "+5.56k BNB/1h", positive: true },
  { name: "token.ticker", price: "12.85M BNB", change: "-2.3k BNB/1h", positive: false },
  { name: "token.ticker", price: "14.23M BNB", change: "-1.8k BNB/1h", positive: false },
  { name: "token.ticker", price: "36.90M BNB", change: "+3.4k BNB/1h", positive: true },
  { name: "token.ticker", price: "8.8k BNB", change: "+14.6k BNB/1h", positive: true },
];

// Filter options
export const filters = ["All", "Trending", "New", "Hot"];

// Trending tokens
export const trendingTokens = [
  { rank: 1, name: "QUANTUM", value: "94.8%", change: "+42.3%" },
  { rank: 2, name: "NEXUS", value: "87.2%", change: "+38.1%" },
  { rank: 3, name: "CIPHER", value: "81.5%", change: "+35.7%" },
];

// Up Dashboard - Inception tokens (below $60k)
export const inceptionTokens: Token[] = [
  {
    id: 1,
    image: "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=100&h=100&fit=crop",
    ticker: "PIAIPIN",
    name: "PiaiPin",
    holders: "1",
    volume: "34 BNB",
    marketCap: "6.17k BNB",
    timeAgo: "13h",
    hasWebsite: true,
    hasTwitter: true,
  },
  {
    id: 2,
    image: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=100&h=100&fit=crop",
    ticker: "NOVA",
    name: "Nova Token",
    holders: "12",
    volume: "156 BNB",
    marketCap: "8.2k BNB",
    timeAgo: "8h",
    hasWebsite: true,
    hasTwitter: true,
  },
  {
    id: 99,
    image: "/placeholder.svg",
    ticker: "MOCK2",
    name: "Mock 2 (Curve Test)",
    holders: "0",
    volume: "0 BNB",
    marketCap: "12.3k BNB",
    timeAgo: "now",
    hasWebsite: false,
    hasTwitter: false,
  },
];

// UP Dashboard - Higher tokens (close to bonding: $40k - $60k)
export const higherTokens: Token[] = [
  {
    id: 3,
    image: "https://images.unsplash.com/photo-1640826514546-7d2d2845a5b4?w=100&h=100&fit=crop",
    ticker: "ZENITH",
    name: "Zenith Protocol",
    holders: "234",
    volume: "2.1k BNB",
    marketCap: "45.8k BNB",
    timeAgo: "2d",
    hasWebsite: true,
    hasTwitter: true,
  },
  {
    id: 4,
    image: "https://images.unsplash.com/photo-1642104704074-907c0698cbd9?w=100&h=100&fit=crop",
    ticker: "APEX",
    name: "Apex Finance",
    holders: "187",
    volume: "1.8k BNB",
    marketCap: "52.3k BNB",
    timeAgo: "1d",
    hasWebsite: false,
    hasTwitter: true,
  },
];

// UP Dashboard - Migrated tokens (above $60k)
export const migratedTokens: Token[] = [
  {
    id: 5,
    image: "https://images.unsplash.com/photo-1644361566696-3d442b5b482a?w=100&h=100&fit=crop",
    ticker: "LIGHT",
    name: "Light",
    holders: "10.70k",
    volume: "67.31k BNB",
    marketCap: "4.08m BNB",
    timeAgo: "12w",
    hasWebsite: true,
    hasTwitter: true,
  },
  {
    id: 6,
    image: "https://images.unsplash.com/photo-1642543348745-03eb1b69c3c8?w=100&h=100&fit=crop",
    ticker: "MAGIK",
    name: "Magikarp",
    holders: "952",
    volume: "3.43k BNB",
    marketCap: "828.80k BNB",
    timeAgo: "9w",
    hasWebsite: true,
    hasTwitter: true,
  },
  {
    id: 7,
    image: "https://images.unsplash.com/photo-1643101809204-6fb869816daf?w=100&h=100&fit=crop",
    ticker: "SVMACC",
    name: "SVMACC",
    holders: "575",
    volume: "$34.83k",
    marketCap: "$314.28k",
    timeAgo: "10w",
    hasWebsite: true,
    hasTwitter: true,
  },
  {
    id: 8,
    image: "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=100&h=100&fit=crop",
    ticker: "MID",
    name: "Midcurve",
    holders: "2.07k",
    volume: "$0",
    marketCap: "$289.04k",
    timeAgo: "10w",
    hasTwitter: true,
  },
  {
    id: 9,
    image: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=100&h=100&fit=crop",
    ticker: "DANIEL",
    name: "Daniel",
    holders: "1.21k",
    volume: "$0",
    marketCap: "$116.70k",
    timeAgo: "10w",
    hasWebsite: true,
    hasTwitter: true,
  },
];

// Token Details mock data
export const mockTokenData: TokenDetailsData = {
  id: "plaipin",
  image: "/placeholder.svg",
  ticker: "PLAIPIN",
  name: "PlaiPin",
  contractAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  marketCap: 6170,
  marketCapChange: -0.50,
  price: 0.000618,
  liquidity: 11550,
  holders: 1,
  metrics: {
    "5m": { change: -0.0, volume: 12 },
    "1h": { change: -0.5, volume: 24 },
    "4h": { change: -0.5, volume: 28 },
    "24h": { change: -0.498, volume: 34 }
  },
  hasWebsite: true,
  hasTwitter: true,
  hasTelegram: false
};

export const mockTransactions: Transaction[] = [
  { time: "15h", type: "sell", amount: "2.77m", bnb: "0.0964 BNB", price: "0.00000003 BNB", mcap: "6.12k BNB", trader: "Bzdb...HxLW", tx: "#" },
  { time: "15h", type: "buy", amount: "2.77m", bnb: "0.0975 BNB", price: "0.00000004 BNB", mcap: "6.19k BNB", trader: "Bzdb...HxLW", tx: "#" },
];
export const mockRawTrades: RawTradeEvent[] = [
  {
    campaignAddress: "0x1111111111111111111111111111111111111111",
    txHash: "0xaaa1...",
    blockNumber: 1000000,
    logIndex: 0,
    side: "buy",
    trader: "0xAbCdEf1234567890aBcDeF12",
    tokenAmount: 150_000n * 10n ** 9n,      // assuming 9 decimals
    baseAmountWei: 3n * 10n ** 17n,         // 0.3 BNB
    timestamp: 1710000000,
  },
  {
    campaignAddress: "0x1111111111111111111111111111111111111111",
    txHash: "0xaaa2...",
    blockNumber: 1000001,
    logIndex: 1,
    side: "sell",
    trader: "0xDeF9876543210abcdef12345",
    tokenAmount: 80_000n * 10n ** 9n,
    baseAmountWei: 22n * 10n ** 16n,        // 0.22 BNB
    timestamp: 1710000600,
  },
  {
    campaignAddress: "0x4444444444444444444444444444444444444444",
    txHash: "0xbbb1...",
    blockNumber: 1000002,
    logIndex: 0,
    side: "buy",
    trader: "0x999999999999999999999999",
    tokenAmount: 40_000n * 10n ** 9n,
    baseAmountWei: 1n * 10n ** 17n,         // 0.1 BNB
    timestamp: 1710001200,
  },
];
// Profile mock data
export const mockCoins: Coin[] = [
  {
    id: 1,
    image: "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=100&h=100&fit=crop",
    name: "ok",
    ticker: "ok",
    marketCap: "$4.6K",
    timeAgo: "2mo ago",
  },
  {
    id: 2,
    image: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=100&h=100&fit=crop",
    name: "Gay",
    ticker: "Gay",
    marketCap: "$4.6K",
    timeAgo: "2mo ago",
  },
  {
    id: 3,
    image: "https://images.unsplash.com/photo-1640826514546-7d2d2845a5b4?w=100&h=100&fit=crop",
    name: "BirD with the big D",
    ticker: "BirD",
    marketCap: "$4.6K",
    timeAgo: "5mo ago",
  },
  {
    id: 4,
    image: "https://images.unsplash.com/photo-1642104704074-907c0698cbd9?w=100&h=100&fit=crop",
    name: "BirD can Fly",
    ticker: "BirD",
    marketCap: "$4.6K",
    timeAgo: "5mo ago",
  },
  {
    id: 5,
    image: "https://images.unsplash.com/photo-1644361566696-3d442b5b482a?w=100&h=100&fit=crop",
    name: "bird can fly",
    ticker: "BirD",
    marketCap: "$4.6K",
    timeAgo: "5mo ago",
  },
];
