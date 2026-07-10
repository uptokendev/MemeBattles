function envText(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function envBool(name, fallback = false) {
  const value = envText(name).toLowerCase();
  return value ? ["1", "true", "yes", "on"].includes(value) : fallback;
}

function requireInteger(name, { min, max }) {
  const raw = envText(name);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be explicitly configured as an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

const dryRun = envBool("AIRDROP_DRY_RUN", false);
if (!dryRun) {
  if (!envBool("AIRDROP_AUTOMATION_ENABLED", false)) {
    throw new Error("AIRDROP_AUTOMATION_ENABLED must be true for a live weekly run");
  }
  const distributionBps = requireInteger("AIRDROP_WEEKLY_DISTRIBUTION_BPS", { min: 1, max: 10_000 });
  if (distributionBps === 10_000 && !envBool("AIRDROP_ALLOW_FULL_VAULT_DISTRIBUTION", false)) {
    throw new Error("100% vault distribution requires AIRDROP_ALLOW_FULL_VAULT_DISTRIBUTION=true");
  }
}

await import("./run-weekly-airdrop.mjs");
