import { ethers } from "hardhat";
import { loadDeployment, resolveContracts } from "./verify-deployment";

async function main() {
  const deployment = loadDeployment();
  const contracts = resolveContracts(deployment);
  const router = await ethers.getContractAt("TreasuryRouter", contracts.TreasuryRouter);
  const current = await router.permanentLpLocker();
  if (current.toLowerCase() === contracts.PermanentLpLocker.toLowerCase()) {
    console.log(`[wire-lp-revenue] TreasuryRouter permanentLpLocker already set: ${current}`);
    return;
  }

  console.log(`[wire-lp-revenue] setting TreasuryRouter permanentLpLocker=${contracts.PermanentLpLocker}`);
  const tx = await router.setPermanentLpLocker(contracts.PermanentLpLocker);
  console.log(`[wire-lp-revenue] submitted tx=${tx.hash}`);
  await tx.wait();
  console.log("[wire-lp-revenue] complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
