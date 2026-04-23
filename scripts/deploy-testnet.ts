import { deployProtocol } from "./lib/deployProtocol";

async function main() {
  console.warn("[deploy-testnet] Deprecated alias. Use: hardhat run scripts/deploy.ts --network bscTestnet");
  await deployProtocol();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
