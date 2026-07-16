import { ethers, network } from "hardhat";
import { loadDeployment, resolveContracts } from "./verify-deployment";

const { buildMonitoringSummary, classifyCampaignSnapshot } = require("./lib/monitoringSnapshot.cjs");

function numberEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name}: expected a non-negative integer`);
  return value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.split("\n")[0];
  return String(error);
}

async function campaignSnapshot(factory: any, id: number) {
  const info = await factory.getCampaign(BigInt(id));
  const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
  const graduationState = await campaign.getGraduationState();
  const nativeBalance = await ethers.provider.getBalance(info.campaign);

  let nativeTarget = 0n;
  let oracleError = "";
  try {
    nativeTarget = await campaign.graduationNativeTarget();
  } catch (error) {
    oracleError = errorMessage(error);
  }

  return classifyCampaignSnapshot({
    id,
    campaign: info.campaign,
    token: info.token,
    creator: info.creator,
    name: info.name,
    symbol: info.symbol,
    launched: await campaign.launched(),
    finalizedAt: (await campaign.finalizedAt()).toString(),
    paused: await campaign.paused(),
    buyPaused: await campaign.buyPaused(),
    sellPaused: await campaign.sellPaused(),
    graduationPaused: await campaign.graduationPaused(),
    requireAuthorizedTrading: await campaign.requireAuthorizedTrading(),
    sold: (await campaign.sold()).toString(),
    curveSupply: (await campaign.curveSupply()).toString(),
    nativeBalance: nativeBalance.toString(),
    nativeTarget: nativeTarget.toString(),
    oracleError,
    dexPair: graduationState[0],
    graduatedLiquidityTokens: graduationState[3].toString(),
    graduatedLiquidityBnb: graduationState[4].toString(),
    graduatedLiquidityLp: graduationState[5].toString(),
    graduationOvershoot: graduationState[10].toString(),
  });
}

function printHuman(summary: any, snapshots: any[]) {
  console.log(`[monitoring-snapshot] network=${network.name}`);
  console.log(`[monitoring-snapshot] totalCampaigns=${summary.totalCampaigns}`);
  console.log(`[monitoring-snapshot] attention=${summary.attentionCount}`);
  console.log(`[monitoring-snapshot] counts=${JSON.stringify(summary.counts)}`);

  for (const snapshot of snapshots) {
    console.log(
      `[monitoring-snapshot] #${snapshot.id} ${snapshot.symbol} ${snapshot.status} soldBps=${snapshot.soldBps} nativeBps=${snapshot.nativeProgressBps} campaign=${snapshot.campaign}`
    );
    for (const alert of snapshot.alerts) console.log(`[monitoring-snapshot]   - ${alert}`);
  }
}

export async function buildMonitoringSnapshot(options: { offset?: number; limit?: number } = {}) {
  const deployment = loadDeployment();
  const contracts = resolveContracts(deployment);
  const factory = await ethers.getContractAt("LaunchFactory", contracts.LaunchFactory);
  const count = Number(await factory.campaignsCount());
  const offset = options.offset ?? numberEnv("MONITOR_CAMPAIGN_OFFSET", 0);
  const limit = options.limit ?? numberEnv("MONITOR_CAMPAIGN_LIMIT", 50);
  const end = Math.min(count, offset + limit);
  const snapshots = [];

  for (let id = offset; id < end; id += 1) {
    snapshots.push(await campaignSnapshot(factory, id));
  }

  return {
    network: network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deploymentNetwork: deployment.network ?? "",
    factory: contracts.LaunchFactory,
    offset,
    limit,
    totalOnFactory: count,
    snapshots,
    summary: buildMonitoringSummary(snapshots),
  };
}

async function main() {
  const json = process.argv.includes("--json");
  const payload = await buildMonitoringSnapshot();
  if (json) console.log(JSON.stringify(payload, null, 2));
  else printHuman(payload.summary, payload.snapshots);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
