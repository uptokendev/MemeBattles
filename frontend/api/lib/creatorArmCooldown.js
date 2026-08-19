/** Factory.creatorLaunchEligibility() sets cooldownEndsAt = block.timestamp for
 * unused wallets. That is "now", not a 24h lock. */

export function nowUnixSeconds(nowSeconds) {
  return Number.isFinite(Number(nowSeconds)) ? Math.trunc(Number(nowSeconds)) : Math.floor(Date.now() / 1000);
}

export function normalizeCreatorArmCooldownEndsAt({
  allowed,
  lastRecordedLaunchAt,
  cooldownEndsAt,
  cooldownSeconds,
} = {}) {
  const lastLaunch = Number(lastRecordedLaunchAt || 0);
  if (lastLaunch <= 0) return 0;
  if (allowed === true) return 0;

  const seconds = Number(cooldownSeconds || 0);
  if (seconds > 0) return lastLaunch + seconds;

  const factoryEnd = Number(cooldownEndsAt || 0);
  return factoryEnd > lastLaunch ? factoryEnd : 0;
}

export function isCreatorArmCooldownActive(input = {}) {
  if (input.allowed === true) return false;
  if (Number(input.lastRecordedLaunchAt || 0) <= 0) return false;
  return normalizeCreatorArmCooldownEndsAt(input) > nowUnixSeconds(input.nowSeconds) + 30;
}
