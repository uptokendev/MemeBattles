import fs from "fs";
import path from "path";
import { network } from "hardhat";
import { deployProtocol } from "./lib/deployProtocol";
import { verifyDeployment } from "./verify-deployment";

const REQUIRED_VOLATILE_FEE_BPS = 100;

function resolveTopazManifestPath() {
  if (process.env.TOPAZ_MANIFEST) return path.resolve(process.env.TOPAZ_MANIFEST);
  return path.join(__dirname, "..", "deployments", network.name, "minimal-topaz.json");
}

function loadMinimalTopazManifest() {
  const file = resolveTopazManifestPath();
  if (!fs.existsSync(file)) {
    throw new Error(
      `Minimal Topaz manifest not found: ${file}. Copy MemeWarzone-Topaz deployments/bscTestnet/minimal-topaz.json here or set TOPAZ_MANIFEST.`
    );
  }

  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const router = manifest.contracts?.Router;
  const volatileFeeBps = Number(manifest.configuration?.volatileFeeBps ?? 0);

  if (!router) throw new Error(`Minimal Topaz manifest ${file} is missing contracts.Router`);
  if (volatileFeeBps !== REQUIRED_VOLATILE_FEE_BPS) {
    throw new Error(`Minimal Topaz manifest volatile fee must be ${REQUIRED_VOLATILE_FEE_BPS}, got ${volatileFeeBps}`);
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
