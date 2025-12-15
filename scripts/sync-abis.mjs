import fs from "fs";
import path from "path";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyAbi({ artifactPath, outPath, onlyAbi = true }) {
  const raw = fs.readFileSync(artifactPath, "utf8");
  const artifact = JSON.parse(raw);

  const payload = onlyAbi ? artifact.abi : artifact;

  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`✓ Wrote ${onlyAbi ? "ABI" : "artifact"}: ${outPath}`);
}

// ---- Configure paths here ----
// Hardhat artifact for LaunchCampaign:
const CAMPAIGN_ARTIFACT = path.join(
  process.cwd(),
  "artifacts",
  "contracts",
  "LaunchCampaign.sol",
  "LaunchCampaign.json"
);

// Where your frontend reads ABI from:
const FRONTEND_ABI_OUT = path.join(
  process.cwd(),
  "frontend",
  "src",
  "abi",
  "LaunchCampaign.json"
);

// Copy only the ABI array (smaller and faster for Vite)
copyAbi({
  artifactPath: CAMPAIGN_ARTIFACT,
  outPath: FRONTEND_ABI_OUT,
  onlyAbi: true,
});
