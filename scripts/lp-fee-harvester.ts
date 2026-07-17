import { ethers } from "hardhat";
import { loadDeployment, resolveContracts } from "./verify-deployment";

const TOPAZ_POOL_ABI = [
  "function claimable0(address) view returns (uint256)",
  "function claimable1(address) view returns (uint256)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

function bigintEnv(name: string, fallback: bigint): bigint {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  return BigInt(raw);
}

function numberEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name}: expected non-negative integer`);
  return value;
}

function boolEnv(name: string, fallback = false): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

async function main() {
  const dryRun = boolEnv("KEEPER_DRY_RUN", true);
  const offset = numberEnv("KEEPER_CAMPAIGN_OFFSET", 0);
  const limit = numberEnv("KEEPER_CAMPAIGN_LIMIT", 100);
  const minToken0 = bigintEnv("LP_HARVEST_MIN_TOKEN0_WEI", 0n);
  const minToken1 = bigintEnv("LP_HARVEST_MIN_TOKEN1_WEI", 0n);
  const minCombined = bigintEnv("LP_HARVEST_MIN_COMBINED_WEI", 0n);

  const deployment = loadDeployment();
  const contracts = resolveContracts(deployment);
  const factory = await ethers.getContractAt("LaunchFactory", contracts.LaunchFactory);
  const locker = await ethers.getContractAt("PermanentLpLocker", contracts.PermanentLpLocker);
  const total = Number(await factory.campaignsCount());
  const end = Math.min(total, offset + limit);
  const lockerAddress = await locker.getAddress();

  console.log(`[lp-harvester] dryRun=${dryRun} campaigns=${offset}-${Math.max(offset, end - 1)} total=${total}`);

  const seen = new Set<string>();
  let submitted = 0;
  for (let id = offset; id < end; id += 1) {
    const info = await factory.getCampaign(BigInt(id));
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    if (!(await campaign.launched())) continue;
    const state = await campaign.getGraduationState();
    const poolAddress = String(state[0]);
    if (poolAddress === ethers.ZeroAddress || seen.has(poolAddress.toLowerCase())) continue;
    seen.add(poolAddress.toLowerCase());

    const pool = new ethers.Contract(poolAddress, TOPAZ_POOL_ABI, ethers.provider);
    const [claimable0, claimable1, token0, token1] = await Promise.all([
      pool.claimable0(lockerAddress),
      pool.claimable1(lockerAddress),
      pool.token0(),
      pool.token1(),
    ]);
    const eligible = claimable0 >= minToken0 && claimable1 >= minToken1 && claimable0 + claimable1 >= minCombined && claimable0 + claimable1 > 0n;
    console.log(
      `[lp-harvester] #${id} ${info.symbol} eligible=${eligible} claimable0=${claimable0} claimable1=${claimable1} token0=${token0} token1=${token1} pool=${poolAddress}`
    );
    if (!eligible) continue;

    if (dryRun) continue;
    const tx = await locker.harvest(poolAddress);
    console.log(`[lp-harvester] submitted pool=${poolAddress} tx=${tx.hash}`);
    await tx.wait();
    submitted += 1;
  }

  console.log(`[lp-harvester] complete submitted=${submitted}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
