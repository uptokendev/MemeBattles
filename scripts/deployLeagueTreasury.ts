import { deployProtocol } from "./lib/deployProtocol";

async function main() {
  console.warn("[deployLeagueTreasury] Deprecated alias. Use: hardhat run scripts/deploy.ts --network <network>");
  await deployProtocol();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
