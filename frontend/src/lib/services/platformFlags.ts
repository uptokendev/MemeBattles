export type PlatformReadinessFlags = {
  routeAuthReady: boolean;
  rewardsReady: boolean;
  claimsReady: boolean;
  creatorFeesReady: boolean;
  battlesReady: boolean;
  sponsorshipsReady: boolean;
  contractsReady: boolean;
  dexSwapEnabled: boolean;
  tournamentsEnabled: boolean;
  warPoolsEnabled: boolean;
};

export const DEFAULT_PLATFORM_READINESS: PlatformReadinessFlags = {
  routeAuthReady: false,
  rewardsReady: false,
  claimsReady: false,
  creatorFeesReady: false,
  battlesReady: false,
  sponsorshipsReady: false,
  contractsReady: false,
  dexSwapEnabled: false,
  tournamentsEnabled: false,
  warPoolsEnabled: false,
};

export function coercePlatformReadiness(input: unknown): PlatformReadinessFlags {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  return {
    routeAuthReady: Boolean(source.routeAuthReady ?? source.routeAuth ?? source.route_authorization),
    rewardsReady: Boolean(source.rewardsReady ?? source.rewards),
    claimsReady: Boolean(source.claimsReady ?? source.claims),
    creatorFeesReady: Boolean(source.creatorFeesReady ?? source.creatorFee ?? source.creator_fees),
    battlesReady: Boolean(source.battlesReady ?? source.battles),
    sponsorshipsReady: Boolean(source.sponsorshipsReady ?? source.sponsorships),
    contractsReady: Boolean(source.contractsReady ?? source.contracts),
    dexSwapEnabled: Boolean(source.dexSwapEnabled ?? source.dexSwap),
    tournamentsEnabled: Boolean(source.tournamentsEnabled ?? source.tournaments),
    warPoolsEnabled: Boolean(source.warPoolsEnabled ?? source.warPools),
  };
}

export function envFlag(name: string, fallback = false): boolean {
  const raw = String((import.meta.env as Record<string, string | undefined>)[name] ?? "")
    .trim()
    .toLowerCase();

  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
