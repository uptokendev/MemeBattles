export const CREATOR_FEE_BPS = 10;
export const CREATOR_FEE_PERCENT = CREATOR_FEE_BPS / 100;
export const CREATOR_FEE_DISPLAY = "0.10%";

export const CREATOR_FEE_READINESS = {
  accountingReady: false,
  claimsReady: false,
  contractEventsReady: false,
} as const;

export function getCreatorFeeEconomics() {
  return {
    bps: CREATOR_FEE_BPS,
    percent: CREATOR_FEE_PERCENT,
    display: CREATOR_FEE_DISPLAY,
    readiness: CREATOR_FEE_READINESS,
  };
}
