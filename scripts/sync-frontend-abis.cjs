const fs = require('fs');
const path = require('path');

const root = process.cwd();
const contracts = [
  'LaunchFactory',
  'LaunchCampaign',
  'LaunchToken',
  'CreatorRegistry',
  'RiskRegistry',
  'TreasuryRouter',
  'RecruiterRewardsVault',
  'ProtocolRevenueVault',
  'CommunityRewardsVault',
  'TreasuryVaultV2',
  'RewardDistributor',
];

const artifactsRoot = path.join(root, 'artifacts', 'contracts');
const outDir = path.join(root, 'frontend', 'src', 'abi');
fs.mkdirSync(outDir, { recursive: true });

function walkJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsonFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.dbg.json')) out.push(full);
  }
  return out;
}

function findArtifact(contractName) {
  const preferred = path.join(artifactsRoot, `${contractName}.sol`, `${contractName}.json`);
  if (fs.existsSync(preferred)) return preferred;

  for (const file of walkJsonFiles(artifactsRoot)) {
    try {
      const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (artifact.contractName === contractName) return file;
    } catch {
      // ignore malformed artifact
    }
  }

  return null;
}

let copied = 0;

for (const name of contracts) {
  const artifactPath = findArtifact(name);
  if (!artifactPath) {
    console.warn(`[abi-sync] missing artifact for ${name}`);
    continue;
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const slim = {
    contractName: artifact.contractName || name,
    abi: artifact.abi || [],
    bytecode: artifact.bytecode || '0x',
  };

  const outPath = path.join(outDir, `${name}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(slim, null, 2)}\n`);
  copied += 1;
  console.log(`[abi-sync] wrote ${path.relative(root, outPath)} from ${path.relative(root, artifactPath)}`);
}

if (copied === 0) {
  console.error('[abi-sync] no ABI files copied. Run npm run compile first.');
  process.exit(1);
}

console.log(`[abi-sync] copied ${copied} ABI file(s)`);
