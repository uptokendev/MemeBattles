import { deployProtocol } from "./lib/deployProtocol";
import { verifyDeployment } from "./verify-deployment";

async function main() {
  const deployment = await deployProtocol();
  console.log("\nVerifying deployment wiring...");
  await verifyDeployment(deployment);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
