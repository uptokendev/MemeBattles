import { deployProtocol } from "./lib/deployProtocol";

async function main() {
  await deployProtocol();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
