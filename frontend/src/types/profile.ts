/**
 * Profile and user-related TypeScript interfaces
 */

export type ProfileTab = "balances" | "coins" | "replies" | "rewards" | "notifications" | "followers";

export interface Coin {
  id: number;
  image: string;
  name: string;
  ticker: string;
  marketCap: string;
  timeAgo: string;
}
