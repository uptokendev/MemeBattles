export const FILTERS = ["All", "Bonding", "DEX", "New", "Trending"] as const;
export type FilterKey = (typeof FILTERS)[number];