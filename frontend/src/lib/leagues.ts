export type Period = "weekly" | "monthly";

export type LeagueKey = "perfect_run" | "fastest_finish" | "biggest_hit" | "top_earner" | "crowd_favorite";

export type LeagueDef = {
  key: LeagueKey;
  title: string;
  subtitle: string;
  image: string;
  supports: Period[];
  weeklyLimit?: number;
  monthlyLimit?: number;
};

export const LEAGUES: LeagueDef[] = [
  {
    key: "perfect_run",
    title: "Perfect Run",
    subtitle: "Monthly only · No sells in bonding · <br><br>Jackpot rolls over if not hit",
    image: "/assets/perfectrun.png",
    supports: ["monthly"],
    monthlyLimit: 5,
  },
  {
    key: "fastest_finish",
    title: "Fastest Finish",
    subtitle: "Fastest graduation (creator buys excluded)",
    image: "/assets/fastestfinish.png",
    supports: ["weekly", "monthly"],
    weeklyLimit: 5,
    monthlyLimit: 5,
  },
  {
    key: "biggest_hit",
    title: "Biggest Hit",
    subtitle: "Biggest single buy in bonding",
    image: "/assets/biggesthit.png",
    supports: ["weekly", "monthly"],
    weeklyLimit: 5,
    monthlyLimit: 5,
  },
  {
    key: "top_earner",
    title: "Top Earner",
    subtitle: "Highest trader earnings inside the bonding curve · Paid weekly/monthly",
    image: "/assets/topearner.png",
    supports: ["weekly", "monthly"],
    weeklyLimit: 5,
    monthlyLimit: 5,
  },
  {
    key: "crowd_favorite",
    title: "Crowd Favorite",
    subtitle: "Most UpVotes (community‑driven)",
    image: "/assets/crowdfavorite.png",
    supports: ["weekly", "monthly"],
    weeklyLimit: 5,
    monthlyLimit: 5,
  },
];

export function getLimit(def: LeagueDef, period: Period) {
  return period === "weekly" ? def.weeklyLimit ?? 10 : def.monthlyLimit ?? 10;
}

export function periodLabel(p: Period) {
  return p === "weekly" ? "Weekly" : "Monthly";
}
