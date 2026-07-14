import path from "path";
import { network } from "hardhat";
import { deployProtocol } from "./lib/deployProtocol";
import { verifyDeployment } from "./verify-deployment";

const { writeFrontendEnv } = require("./lib/frontendEnv.cjs");

function exportFrontendEnv(deployment: any) {
  const outFile = path.join(__dirname, "..", "deployments", `${network.name}.frontend.env`);
  const output = writeFrontendEnv(deployment, outFile, `${network.name} deployment`);
  console.log("\nFrontend env file:", outFile);
  return output;
}

async function main() {
  const deployment = await deployProtocol();
  exportFrontendEnv(deployment);
  console.log("\nVerifying deployment wiring...");
  await verifyDeployment(deployment);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
