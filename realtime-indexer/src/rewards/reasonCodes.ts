export const ELIGIBILITY_PROGRAMS = ["recruiter", "airdrop_trader", "airdrop_creator", "squad"] as const;
export type EligibilityProgram = (typeof ELIGIBILITY_PROGRAMS)[number];

export const ELIGIBILITY_REASON_CODES = [
  "NO_RECRUITER",
  "RECRUITER_LINK_LOCKED",
  "RECRUITER_CLOSED",
  "NO_SQUAD",
  "SQUAD_DETACHED",
  "TRADER_VOLUME_BELOW_MIN",
  "TRADER_VOLUME_ABOVE_CAP",
  "TRADER_TRADE_COUNT_BELOW_MIN",
  "TRADER_ACTIVE_DAYS_BELOW_MIN",
  "OWN_CAMPAIGN_TRADE_EXCLUDED",
  "CREATOR_BONDING_VOLUME_BELOW_MIN",
  "CREATOR_UNIQUE_BUYERS_BELOW_MIN",
  "CREATOR_CAMPAIGN_CAP_EXCEEDED",
  "SELF_TRADING",
  "COMMON_CONTROL_CLUSTER",
  "CIRCULAR_TRADING",
  "WALLET_SPLITTING",
  "CREATOR_FUNDED_FAKE_DEMAND",
  "RECRUITER_FARMING_LOOP",
  "REVIEW_REQUIRED",
  "RECRUITER_DIRECT_WIN_EXCLUDED",
  "REPEAT_WINNER_COOLDOWN",
  "BATTLE_LEAGUE_ACTIVE_WINNER",
  "NO_REWARD_ACTIVITY",
] as const;

export type EligibilityReasonCode = (typeof ELIGIBILITY_REASON_CODES)[number];

export const EXCLUSION_FLAG_SEVERITIES = ["hard", "review"] as const;
export type ExclusionFlagSeverity = (typeof EXCLUSION_FLAG_SEVERITIES)[number];

const REASON_CODE_SET = new Set<string>(ELIGIBILITY_REASON_CODES);
const PROGRAM_SET = new Set<string>(ELIGIBILITY_PROGRAMS);
const SEVERITY_SET = new Set<string>(EXCLUSION_FLAG_SEVERITIES);

export function isEligibilityProgram(value: unknown): value is EligibilityProgram {
  return PROGRAM_SET.has(String(value ?? ""));
}

export function isEligibilityReasonCode(value: unknown): value is EligibilityReasonCode {
  return REASON_CODE_SET.has(String(value ?? ""));
}

export function isExclusionFlagSeverity(value: unknown): value is ExclusionFlagSeverity {
  return SEVERITY_SET.has(String(value ?? ""));
}
