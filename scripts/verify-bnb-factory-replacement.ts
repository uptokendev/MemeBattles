/**
 * Read-only BNB factory/locker replacement checks.
 * Never attaches DEPLOYER_PK / PRIVATE_KEY_DEPLOY. Never sends a transaction.
 *
 *   npx hardhat run scripts/verify-bnb-factory-replacement.ts
 *   REPLACEMENT_FACTORY=0x... npx hardhat run scripts/verify-bnb-factory-replacement.ts
 */
import { ethers } from "ethers";

const RPC =
  process.env.BSC_MAINNET_RPC ||
  process.env.BSC_MAINNET_RPC_URL ||
  process.env.BNB_FORK_RPC ||
  "https://bsc-dataseed.binance.org";

const PROD_FACTORY = "0x3068eAE6F8431bFc3c5Faae9c3bBB95F007be59a";
const PROD_LOCKER = "0x64710A4f87aBa3b5ED5B8B25e8ebA4DaC339C998";
const TREASURY = "0xe157a6FDf19CAB61f2ECa048966f137A3240a921";
const CREATOR_REGISTRY = "0x8194FB3745d027102ce7Da562c7045f28B2f42fD";
const SAFE = "0x1edcEdf5E5D9C2FAd5F9F6B964077dD74020A7A7";
const ADAPTER = "0x5c3135Dfaad519A9114DEa2E546f0Cd051d0D35a";
const IMPL = "0xbe3caF640F77e8436BCAF89730251A00fB01608f";
const ORACLE = "0x9D204406d5ECA0f18e48427fDD983A32FdF57C9B";
const TOPAZ_FACTORY = "0x65E6cD0eF5D3467030103cf3d433034E570b5784";

const FACTORY_ABI = [
  "function owner() view returns (address)",
  "function live() view returns (bool)",
  "function createPaused() view returns (bool)",
  "function securityDefaultsLocked() view returns (bool)",
  "function requireRouteAuthorization() view returns (bool)",
  "function requireAuthorizedTrading() view returns (bool)",
  "function launchProtectionConfig() view returns (uint256 blocks_, uint256 maxBuyWei, uint256 maxWalletWei)",
  "function protocolFeeBps() view returns (uint256)",
  "function tradeRouteProfile() view returns (uint8)",
  "function finalizeRouteProfile() view returns (uint8)",
  "function routeAuthority() view returns (address)",
  "function campaignImplementation() view returns (address)",
  "function router() view returns (address)",
  "function graduationOracle() view returns (address)",
  "function permanentLpLocker() view returns (address)",
  "function campaignsCount() view returns (uint256)",
  "function isGraduationTargetAllowedForChain(uint256 chainId, uint256 target) view returns (bool)",
];

const LOCKER_ABI = [
  "function REQUIRED_POOL_FEE_BPS() view returns (uint16)",
  "function CREATOR_FEE_BPS() view returns (uint16)",
  "function PROTOCOL_FEE_BPS() view returns (uint16)",
  "function admin() view returns (address)",
];

const TREASURY_ABI = [
  "function admin() view returns (address)",
  "function permanentLpLocker() view returns (address)",
  "function authorizedLpLocker(address locker) view returns (bool)",
];

const REGISTRY_ABI = [
  "function owner() view returns (address)",
  "function launchRecorder(address recorder) view returns (bool)",
];

function boolEnv(name: string, fallback: boolean) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function optionalAddress(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return ethers.getAddress(value);
}

async function main() {
  if (process.env.DEPLOYER_PK || process.env.PRIVATE_KEY_DEPLOY) {
    console.warn("[verify-bnb-factory-replacement] deployer key is present in env; this script does not use it.");
  }

  const provider = new ethers.JsonRpcProvider(RPC, 56, { staticNetwork: true, batchMaxCount: 1 });
  const block = await provider.getBlockNumber();
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== 56) {
    throw new Error(`expected chain 56, got ${network.chainId}`);
  }

  let failed = 0;
  const check = (label: string, ok: boolean, detail?: string) => {
    const suffix = detail ? ` ${detail}` : "";
    if (ok) console.log(`PASS ${label}${suffix}`);
    else {
      failed += 1;
      console.log(`FAIL ${label}${suffix}`);
    }
  };
  const eq = (label: string, actual: unknown, expected: unknown) => {
    check(label, String(actual).toLowerCase() === String(expected).toLowerCase(), `actual=${actual} expected=${expected}`);
  };

  console.log(`[verify-bnb-factory-replacement] rpc=${RPC} block=${block}`);
  console.log("[verify-bnb-factory-replacement] read-only; no signer attached");

  const factory = new ethers.Contract(PROD_FACTORY, FACTORY_ABI, provider);
  const locker = new ethers.Contract(PROD_LOCKER, LOCKER_ABI, provider);
  const treasury = new ethers.Contract(TREASURY, TREASURY_ABI, provider);
  const registry = new ethers.Contract(CREATOR_REGISTRY, REGISTRY_ABI, provider);
  const topaz = new ethers.Contract(TOPAZ_FACTORY, ["function getFee(address,bool) view returns (uint256)"], provider);

  eq("production factory owner", await factory.owner(), SAFE);
  eq("CreatorRegistry owner", await registry.owner(), SAFE);
  eq("TreasuryRouterV2 admin", await treasury.admin(), SAFE);
  check("old factory is launchRecorder", await registry.launchRecorder(PROD_FACTORY));
  check("old locker authorized", await treasury.authorizedLpLocker(PROD_LOCKER));
  console.log("treasury primary locker", await treasury.permanentLpLocker());

  eq("production live", await factory.live(), true);
  eq("production createPaused", await factory.createPaused(), false);
  eq("production securityDefaultsLocked", await factory.securityDefaultsLocked(), true);
  eq("production requireRouteAuthorization", await factory.requireRouteAuthorization(), true);
  eq("production requireAuthorizedTrading", await factory.requireAuthorizedTrading(), true);
  const protection = await factory.launchProtectionConfig();
  eq("production launchProtection.blocks_", protection.blocks_.toString(), "0");
  eq("production launchProtection.maxBuyWei", protection.maxBuyWei.toString(), "0");
  eq("production launchProtection.maxWalletWei", protection.maxWalletWei.toString(), "0");

  eq("production locker REQUIRED_POOL_FEE_BPS", Number(await locker.REQUIRED_POOL_FEE_BPS()), 30);
  eq("production locker CREATOR_FEE_BPS", Number(await locker.CREATOR_FEE_BPS()), 6667);
  eq("production locker PROTOCOL_FEE_BPS", Number(await locker.PROTOCOL_FEE_BPS()), 3333);
  eq("Topaz getFee(0,false)", (await topaz.getFee(ethers.ZeroAddress, false)).toString(), "30");
  check("no $6 on chain 56", !(await factory.isGraduationTargetAllowedForChain(56, ethers.parseEther("6"))));

  const oldFactoryCode = await provider.getCode(PROD_FACTORY);
  check("old factory has code", oldFactoryCode !== "0x" && oldFactoryCode.length > 2, `bytes=${(oldFactoryCode.length - 2) / 2}`);
  console.log("old factory code keccak", ethers.keccak256(oldFactoryCode));

  const replacementFactory = optionalAddress(process.env.REPLACEMENT_FACTORY || "");
  if (!replacementFactory) {
    console.log("REPLACEMENT_FACTORY unset — live production snapshot only");
  } else {
    const expectPaused = boolEnv("REPLACEMENT_EXPECT_CREATE_PAUSED", true);
    const next = new ethers.Contract(replacementFactory, FACTORY_ABI, provider);
    const nextLockerAddr = ethers.getAddress(await next.permanentLpLocker());
    const nextLocker = new ethers.Contract(nextLockerAddr, LOCKER_ABI, provider);
    console.log("replacement factory", replacementFactory);
    console.log("replacement locker", nextLockerAddr);

    eq("replacement owner", await next.owner(), SAFE);
    eq("replacement securityDefaultsLocked", await next.securityDefaultsLocked(), true);
    eq("replacement requireRouteAuthorization", await next.requireRouteAuthorization(), true);
    eq("replacement requireAuthorizedTrading", await next.requireAuthorizedTrading(), true);
    eq("replacement createPaused", await next.createPaused(), expectPaused);
    const nextProtection = await next.launchProtectionConfig();
    eq("replacement launchProtection.blocks_", nextProtection.blocks_.toString(), "0");
    eq("replacement launchProtection.maxBuyWei", nextProtection.maxBuyWei.toString(), "0");
    eq("replacement launchProtection.maxWalletWei", nextProtection.maxWalletWei.toString(), "0");
    eq("replacement locker REQUIRED_POOL_FEE_BPS", Number(await nextLocker.REQUIRED_POOL_FEE_BPS()), 30);
    eq("replacement locker CREATOR_FEE_BPS", Number(await nextLocker.CREATOR_FEE_BPS()), 8000);
    eq("replacement locker PROTOCOL_FEE_BPS", Number(await nextLocker.PROTOCOL_FEE_BPS()), 2000);
    eq("replacement locker admin", await nextLocker.admin(), replacementFactory);
    eq("replacement campaignImplementation", await next.campaignImplementation(), IMPL);
    eq("replacement router", await next.router(), ADAPTER);
    eq("replacement graduationOracle", await next.graduationOracle(), ORACLE);
    check("replacement is launchRecorder", await registry.launchRecorder(replacementFactory));
    check("new locker authorized", await treasury.authorizedLpLocker(nextLockerAddr));
    check("old locker still authorized", await treasury.authorizedLpLocker(PROD_LOCKER));
    eq("primary locker is replacement", await treasury.permanentLpLocker(), nextLockerAddr);
    check("old factory code still present", (await provider.getCode(PROD_FACTORY)) === oldFactoryCode);
    check("replacement has no $6 on chain 56", !(await next.isGraduationTargetAllowedForChain(56, ethers.parseEther("6"))));
    console.log("replacement live", await next.live());
    console.log("replacement campaignsCount", (await next.campaignsCount()).toString());
  }

  if (failed) {
    console.error(`[verify-bnb-factory-replacement] ${failed} check(s) failed`);
    process.exitCode = 1;
    return;
  }
  console.log("[verify-bnb-factory-replacement] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
