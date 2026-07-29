import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function write(file, content) {
  fs.writeFileSync(path.join(root, file), content);
}

function replaceOnce(file, before, after) {
  const current = read(file);
  if (!current.includes(before)) {
    throw new Error(`Patch anchor not found in ${file}: ${before.slice(0, 140)}`);
  }
  write(file, current.replace(before, after));
}

replaceOnce(
  "frontend/src/lib/scheduledLaunchClientV2.ts",
  '  "function creatorRegistry() view returns (address)",\n  "function creatorLaunchEligibilityAt(address creator,uint256 launchTimestamp) view returns (bool allowed,uint256 earliestLaunchTimestamp,uint256 currentLiveCount,uint256 maxLiveBonding)",',
  '  "function creatorRegistry() view returns (address)",\n  "function lastScheduledLaunchTimestamp(address creator) view returns (uint256)",\n  "function creatorLaunchEligibilityAt(address creator,uint256 launchTimestamp) view returns (bool allowed,uint256 earliestLaunchTimestamp,uint256 currentLiveCount,uint256 maxLiveBonding)",',
);

replaceOnce(
  "frontend/src/lib/scheduledLaunchClientV2.ts",
  [
    "export type ScheduledCreatorLaunchEligibility = {",
    "  allowed: boolean;",
    "  earliestLaunchAt: number;",
    "  currentLiveCount: number;",
    "  maxLiveBonding: number;",
    "};",
  ].join("\n"),
  [
    "export type ScheduledCreatorLaunchEligibility = {",
    "  allowed: boolean;",
    "  earliestLaunchAt: number;",
    "  currentLiveCount: number;",
    "  maxLiveBonding: number;",
    "  cooldownSeconds: number;",
    "  lastRecordedLaunchAt: number;",
    "  lastScheduledLaunchAt: number;",
    "  cooldownAnchorAt: number;",
    "};",
  ].join("\n"),
);

replaceOnce(
  "frontend/src/lib/scheduledLaunchClientV2.ts",
  [
    "  const factory = new Contract(input.factoryAddress, SCHEDULED_FACTORY_ABI, provider) as any;",
    "  try {",
    "    const result = await factory.creatorLaunchEligibilityAt(await input.signer.getAddress(), input.launchAt);",
    "    return {",
    "      allowed: Boolean(result.allowed ?? result[0]),",
    "      earliestLaunchAt: Number(result.earliestLaunchTimestamp ?? result[1] ?? 0),",
    "      currentLiveCount: Number(result.currentLiveCount ?? result[2] ?? 0),",
    "      maxLiveBonding: Number(result.maxLiveBonding ?? result[3] ?? 0),",
    "    };",
    "  } catch (error: any) {",
  ].join("\n"),
  [
    "  const factory = new Contract(input.factoryAddress, SCHEDULED_FACTORY_ABI, provider) as any;",
    "  try {",
    "    const creator = await input.signer.getAddress();",
    "    const [result, registryAddressRaw, lastScheduledRaw] = await Promise.all([",
    "      factory.creatorLaunchEligibilityAt(creator, input.launchAt),",
    "      factory.creatorRegistry(),",
    "      factory.lastScheduledLaunchTimestamp(creator),",
    "    ]);",
    "",
    "    let cooldownSeconds = 0;",
    "    let lastRecordedLaunchAt = 0;",
    "    const registryAddress = String(registryAddressRaw || \"\");",
    "    if (ethers.isAddress(registryAddress) && registryAddress !== ethers.ZeroAddress) {",
    "      const registry = new Contract(registryAddress, CREATOR_REGISTRY_ABI, provider) as any;",
    "      const [profile, rules] = await Promise.all([",
    "        registry.getCreatorProfile(creator),",
    "        registry.getCreatorRules(creator),",
    "      ]);",
    "      lastRecordedLaunchAt = Number(profile.lastLaunchTimestamp ?? profile[3] ?? 0);",
    "      cooldownSeconds = Number(rules.cooldownSeconds ?? rules[1] ?? 0);",
    "    }",
    "",
    "    const lastScheduledLaunchAt = Number(lastScheduledRaw ?? 0);",
    "    const cooldownAnchorAt = Math.max(lastRecordedLaunchAt, lastScheduledLaunchAt);",
    "    return {",
    "      allowed: Boolean(result.allowed ?? result[0]),",
    "      earliestLaunchAt: Number(result.earliestLaunchTimestamp ?? result[1] ?? 0),",
    "      currentLiveCount: Number(result.currentLiveCount ?? result[2] ?? 0),",
    "      maxLiveBonding: Number(result.maxLiveBonding ?? result[3] ?? 0),",
    "      cooldownSeconds,",
    "      lastRecordedLaunchAt,",
    "      lastScheduledLaunchAt,",
    "      cooldownAnchorAt,",
    "    };",
    "  } catch (error: any) {",
  ].join("\n"),
);

replaceOnce(
  "frontend/src/pages/PushDraftLive.tsx",
  [
    "function formatLocalLaunch(seconds: number) {",
    "  return new Date(seconds * 1000).toLocaleString(undefined, {",
    '    year: "numeric",',
    '    month: "short",',
    '    day: "numeric",',
    '    hour: "2-digit",',
    '    minute: "2-digit",',
    "  });",
    "}",
  ].join("\n"),
  [
    "function formatLocalLaunch(seconds: number) {",
    "  return new Date(seconds * 1000).toLocaleString(undefined, {",
    '    year: "numeric",',
    '    month: "short",',
    '    day: "numeric",',
    '    hour: "2-digit",',
    '    minute: "2-digit",',
    "  });",
    "}",
    "",
    "function formatCooldownDuration(seconds: number) {",
    "  const hours = Math.floor(Math.max(0, seconds) / 3600);",
    "  const minutes = Math.floor((Math.max(0, seconds) % 3600) / 60);",
    "  if (hours && minutes) return `${hours} hours ${minutes} minutes`;",
    "  if (hours) return `${hours} hours`;",
    "  return `${minutes} minutes`;",
    "}",
  ].join("\n"),
);

replaceOnce(
  "frontend/src/pages/PushDraftLive.tsx",
  '              min={toLocalInputValue(new Date(Date.now() + 5 * 60 * 1000))}',
  '              min={toLocalInputValue(new Date(Math.max(Date.now() + 5 * 60 * 1000, Number(scheduledEligibility?.earliestLaunchAt || 0) * 1000)))}',
);

replaceOnce(
  "frontend/src/pages/PushDraftLive.tsx",
  [
    "            ) : scheduledEligibility && scheduledEligibility.earliestLaunchAt ? (",
    '              <p className="mt-3 text-sm text-orange-300">',
    "                Earliest allowed launch: {formatLocalLaunch(scheduledEligibility.earliestLaunchAt)} ({creatorTimeZone}).",
    "              </p>",
    "            ) : null}",
  ].join("\n"),
  [
    "            ) : scheduledEligibility && scheduledEligibility.earliestLaunchAt ? (",
    '              <div className="mt-3 space-y-2 border border-orange-400/30 bg-orange-500/5 p-3 text-sm text-orange-200">',
    '                <p className="font-medium">',
    "                  Earliest next launch: {formatLocalLaunch(scheduledEligibility.earliestLaunchAt)} ({creatorTimeZone}).",
    "                </p>",
    "                {scheduledEligibility.cooldownAnchorAt ? (",
    '                  <p className="text-xs leading-5 text-muted-foreground">',
    "                    Cooldown starts from this wallet&apos;s latest {scheduledEligibility.lastScheduledLaunchAt >= scheduledEligibility.lastRecordedLaunchAt ? \"scheduled\" : \"recorded\"} launch on {formatLocalLaunch(scheduledEligibility.cooldownAnchorAt)}. Creator launches must be {formatCooldownDuration(scheduledEligibility.cooldownSeconds)} apart.",
    "                  </p>",
    "                ) : null}",
    "                <Button",
    '                  type="button"',
    '                  variant="outline"',
    '                  className="mwz-button h-9 font-retro text-xs"',
    "                  onClick={() => {",
    "                    setLaunchAtInput(toLocalInputValue(new Date(scheduledEligibility.earliestLaunchAt * 1000)));",
    "                    setScheduledEligibility(null);",
    "                    setScheduledEligibilityError(null);",
    "                  }}",
    "                >",
    "                  Use earliest allowed time",
    "                </Button>",
    "              </div>",
    "            ) : null}",
  ].join("\n"),
);

fs.rmSync(path.join(root, "scripts/apply-scheduled-cooldown-clarity.mjs"), { force: true });
fs.rmSync(path.join(root, ".github/workflows/apply-scheduled-cooldown-clarity.yml"), { force: true });

console.log("Scheduled cooldown clarity patch applied.");
