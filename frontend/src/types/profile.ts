/**
 * Profile and user-related TypeScript interfaces
 */

export type ProfileTab =
  | "balances"
  | "coins"
  | "replies"
  | "rewards"
  | "airdrops"
  | "squad"
  | "recruiter"
  | "notifications"
  | "followers"
  | "following";

export const profileTabs: ProfileTab[] = [
  "balances",
  "coins",
  "replies",
  "rewards",
  "airdrops",
  "squad",
  "recruiter",
  "notifications",
  "followers",
  "following",
];

export function isProfileTab(value: string): value is ProfileTab {
  return profileTabs.includes(value as ProfileTab);
}

export interface Coin {
  id: number;
  image: string;
  name: string;
  ticker: string;
  marketCap: string;
  timeAgo: string;
}
