import fs from "fs";
import path from "path";

const CONTRACTS = [
  ["LaunchFactory", "contracts/LaunchFactory.sol/LaunchFactory.json"],
  ["LaunchCampaign", "contracts/LaunchCampaign.sol/LaunchCampaign.json"],
  ["LaunchToken", "contracts/token/LaunchToken.sol/LaunchToken.json"],
  ["TreasuryRouter", "contracts/TreasuryRouter.sol/TreasuryRouter.json"],
  ["RecruiterRewardsVault", "contracts/RecruiterRewardsVault.sol/RecruiterRewardsVault.json"],
  ["CommunityRewardsVault", "contracts/CommunityRewardsVault.sol/CommunityRewardsVault.json"],
  ["ProtocolRevenueVault", "contracts/ProtocolRevenueVault.sol/ProtocolRevenueVault.json"],
  ["TreasuryVaultV2", "contracts/TreasuryVaultV2.sol/TreasuryVaultV2.json"],
  ["UPVoteTreasury", "contracts/UPVoteTreasury.sol/UPVoteTreasury.json"],
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyAbi(contractName, artifactRelativePath) {
  const artifactPath = path.join(process.cwd(), "artifacts", artifactRelativePath);
  const outPath = path.join(process.cwd(), "frontend", "src", "abi", `${contractName}.json`);
  const raw = fs.readFileSync(artifactPath, "utf8");
  const artifact = JSON.parse(raw);

  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, JSON.stringify({ abi: artifact.abi }, null, 2));
  console.log(`✓ Wrote ABI: ${outPath}`);
}

for (const [contractName, artifactRelativePath] of CONTRACTS) {
  copyAbi(contractName, artifactRelativePath);
}
