const fs = require('fs');
const path = require('path');

const root = process.cwd();
const contracts = [
  'LaunchFactory',
  'LaunchCampaign',
  'LaunchToken',
  'TreasuryRouter',
  'RecruiterRewardsVault',
  'ProtocolRevenueVault',
  'CommunityRewardsVault',
  'TreasuryVaultV2',
];

const outDir = path.join(root, 'frontend', 'src', 'abi');
fs.mkdirSync(outDir, { recursive: true });

let copied = 0;

for (const name of contracts) {
  const artifactPath = path.join(root, 'artifacts', 'contracts', `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(artifactPath)) {
    console.warn(`[abi-sync] missing artifact: ${artifactPath}`);
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
  console.log(`[abi-sync] wrote ${path.relative(root, outPath)}`);
}

if (copied === 0) {
  console.error('[abi-sync] no ABI files copied. Run npm run compile first.');
  process.exit(1);
}

console.log(`[abi-sync] copied ${copied} ABI file(s)`);
