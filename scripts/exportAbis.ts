import fs from "fs";
import path from "path";
import { artifacts } from "hardhat";

async function main() {
  // Adjust if your folder layout differs
  const outDir = path.join(__dirname, "..", "frontend", "src", "abi");
  fs.mkdirSync(outDir, { recursive: true });

  const names = ["LaunchFactory", "LaunchCampaign", "LaunchToken"];

  for (const name of names) {
    const art = await artifacts.readArtifact(name);
    // Write minimal json with { abi: [...] } so your frontend can use `.abi`
    fs.writeFileSync(
      path.join(outDir, `${name}.json`),
      JSON.stringify({ abi: art.abi }, null, 2)
    );
    console.log(`Wrote ${name}.json`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
