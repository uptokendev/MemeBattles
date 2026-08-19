/** Factory.creatorLaunchEligibility() sets cooldownEndsAt = block.timestamp for
 * unused wallets. That is "now", not a 24h lock. Treat cooldown as active only
 * after a recorded launch, and never when the factory already says allowed. */

export type CreatorArmCooldownInput = {
  allowed?: boolean | null;
  lastRecordedLaunchAt?: number | null;
  cooldownEndsAt?: number | null;
  cooldownSeconds?: number | null;
  nowSeconds?: number;
};

export function nowUnixSeconds(nowSeconds?: number) {
  return Number.isFinite(Number(nowSeconds)) ? Math.trunc(Number(nowSeconds)) : Math.floor(Date.now() / 1000);
}

export function normalizeCreatorArmCooldownEndsAt(input: CreatorArmCooldownInput): number {
  const lastLaunch = Number(input.lastRecordedLaunchAt || 0);
  if (lastLaunch <= 0) return 0;
  if (input.allowed === true) return 0;

  const cooldownSeconds = Number(input.cooldownSeconds || 0);
  if (cooldownSeconds > 0) return lastLaunch + cooldownSeconds;

  const factoryEnd = Number(input.cooldownEndsAt || 0);
  return factoryEnd > lastLaunch ? factoryEnd : 0;
}

export function isCreatorArmCooldownActive(input: CreatorArmCooldownInput): boolean {
  if (input.allowed === true) return false;
  if (Number(input.lastRecordedLaunchAt || 0) <= 0) return false;
  // Ignore factory "cooldownEndsAt = block.timestamp" clock skew on unused/just-eligible wallets.
  return normalizeCreatorArmCooldownEndsAt(input) > nowUnixSeconds(input.nowSeconds) + 30;
}
