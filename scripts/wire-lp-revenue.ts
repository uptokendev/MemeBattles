import { ethers } from "hardhat";
import { loadDeployment, resolveContracts } from "./verify-deployment";

const LP_REVENUE_ROUTER_ABI = [
  "function permanentLpLocker() view returns (address)",
  "function setPermanentLpLocker(address locker)",
  "function authorizedLpLocker(address locker) view returns (bool)",
  "function setAuthorizedLpLocker(address locker, bool allowed)",
  "function setPrimaryLpLocker(address locker)",
];

function pickRouterAddress(deployment: any, contracts: ReturnType<typeof resolveContracts>) {
  return deployment.contracts?.TreasuryRouterV2 || deployment.TreasuryRouterV2 || contracts.TreasuryRouter;
}

async function supportsAuthorizedLocker(router: any, locker: string) {
  try {
    await router.authorizedLpLocker(locker);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const deployment = loadDeployment();
  const contracts = resolveContracts(deployment);
  const routerAddress = pickRouterAddress(deployment, contracts);
  const lockerAddress = contracts.PermanentLpLocker;
  const router = new ethers.Contract(routerAddress, LP_REVENUE_ROUTER_ABI, await ethers.provider.getSigner());

  if (await supportsAuthorizedLocker(router, lockerAddress)) {
    const authorized = await router.authorizedLpLocker(lockerAddress);
    if (!authorized) {
      console.log(`[wire-lp-revenue] authorizing LP locker on TreasuryRouterV2: ${lockerAddress}`);
      const tx = await router.setAuthorizedLpLocker(lockerAddress, true);
      console.log(`[wire-lp-revenue] submitted authorize tx=${tx.hash}`);
      await tx.wait();
    } else {
      console.log(`[wire-lp-revenue] LP locker already authorized on TreasuryRouterV2: ${lockerAddress}`);
    }

    const currentPrimary = await router.permanentLpLocker();
    if (currentPrimary.toLowerCase() !== lockerAddress.toLowerCase()) {
      console.log(`[wire-lp-revenue] setting TreasuryRouterV2 primary LP locker=${lockerAddress}`);
      const tx = await router.setPrimaryLpLocker(lockerAddress);
      console.log(`[wire-lp-revenue] submitted primary tx=${tx.hash}`);
      await tx.wait();
    } else {
      console.log(`[wire-lp-revenue] TreasuryRouterV2 primary LP locker already set: ${currentPrimary}`);
    }

    console.log("[wire-lp-revenue] complete");
    return;
  }

  const current = await router.permanentLpLocker();
  if (current.toLowerCase() === lockerAddress.toLowerCase()) {
    console.log(`[wire-lp-revenue] TreasuryRouter permanentLpLocker already set: ${current}`);
    return;
  }

  console.log(`[wire-lp-revenue] setting TreasuryRouter permanentLpLocker=${lockerAddress}`);
  const tx = await router.setPermanentLpLocker(lockerAddress);
  console.log(`[wire-lp-revenue] submitted tx=${tx.hash}`);
  await tx.wait();
  console.log("[wire-lp-revenue] complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
