import fs from "fs";
import path from "path";
import { artifacts } from "hardhat";

const CONTRACT_NAMES = [
  "LaunchFactory",
  "LaunchCampaign",
  "LaunchToken",
  "TreasuryRouter",
  "RecruiterRewardsVault",
  "CommunityRewardsVault",
  "ProtocolRevenueVault",
  "TreasuryVaultV2",
  "UPVoteTreasury",
] as const;

async function main() {
  const outDir = path.join(__dirname, "..", "frontend", "src", "abi");
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of CONTRACT_NAMES) {
    const art = await artifacts.readArtifact(name);
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify({ abi: art.abi }, null, 2));
    console.log(`Wrote ${name}.json`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
