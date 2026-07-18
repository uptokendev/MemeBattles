import fs from "fs";
import path from "path";
import { network } from "hardhat";
import { deployProtocol } from "./lib/deployProtocol";
import { verifyDeployment } from "./verify-deployment";

const REQUIRED_CHAIN_ID = 97;
const REQUIRED_VOLATILE_FEE_BPS = 100;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function resolveTopazManifestPath() {
  if (process.env.TOPAZ_MANIFEST) return path.resolve(process.env.TOPAZ_MANIFEST);
  return path.join(__dirname, "..", "deployments", network.name, "minimal-topaz.json");
}

function requireManifestAddress(manifest: any, file: string, key: string) {
  const value = manifest.contracts?.[key];
  if (!ADDRESS_RE.test(value || "")) {
    throw new Error(`Minimal Topaz manifest ${file} is missing contracts.${key} as a 20-byte address`);
  }
  return value;
}

function loadMinimalTopazManifest() {
  const file = resolveTopazManifestPath();
  if (!fs.existsSync(file)) {
    throw new Error(
      `Minimal Topaz manifest not found: ${file}. Copy MemeWarzone-Topaz deployments/bscTestnet/minimal-topaz.json here or set TOPAZ_MANIFEST.`
    );
  }

  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const router = requireManifestAddress(manifest, file, "Router");
  requireManifestAddress(manifest, file, "PoolFactory");
  requireManifestAddress(manifest, file, "WBNB");

  const chainId = Number(manifest.chainId ?? 0);
  const volatileFeeBps = Number(manifest.configuration?.volatileFeeBps ?? 0);
  const graduationPoolStable = manifest.configuration?.graduationPoolStable;

  if (chainId !== REQUIRED_CHAIN_ID) {
    throw new Error(`Minimal Topaz manifest chainId must be ${REQUIRED_CHAIN_ID}, got ${chainId}`);
  }
  if (volatileFeeBps !== REQUIRED_VOLATILE_FEE_BPS) {
    throw new Error(`Minimal Topaz manifest volatile fee must be ${REQUIRED_VOLATILE_FEE_BPS}, got ${volatileFeeBps}`);
  }
  if (graduationPoolStable !== false) {
    throw new Error(`Minimal Topaz manifest configuration.graduationPoolStable must be false, got ${graduationPoolStable}`);
  }

  return { file, manifest, router };
}

async function main() {
  const { file, router } = loadMinimalTopazManifest();
  process.env.TOPAZ_ROUTER = router;
  console.log(`[deploy-topaz-manifest] using ${file}`);
  console.log(`[deploy-topaz-manifest] TOPAZ_ROUTER=${router}`);

  const deployment = await deployProtocol();
  await verifyDeployment(deployment);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});