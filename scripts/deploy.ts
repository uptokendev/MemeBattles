import path from "path";
import { network } from "hardhat";
import { deployProtocol } from "./lib/deployProtocol";

const { writeFrontendEnv } = require("./lib/frontendEnv.cjs");

function exportFrontendEnv(deployment: any) {
  const outFile = path.join(__dirname, "..", "deployments", `${network.name}.frontend.env`);
  writeFrontendEnv(deployment, outFile, `${network.name} deployment`);
  console.log("\nFrontend env file:", outFile);
}

async function main() {
  const deployment = await deployProtocol();
  exportFrontendEnv(deployment);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
