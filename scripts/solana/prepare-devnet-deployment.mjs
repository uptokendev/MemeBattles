import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const PLACEHOLDER_PROGRAM_ID = "Fg6PaFpoGXkYsidMpWxTWqjRZ6LkZXoC3XgXvAqUixG";
const PROGRAM_SOURCE = "programs/memewarzone_solana/src/lib.rs";
const ANCHOR_TOML = "Anchor.toml";
const DEFAULT_OUTPUT = "deployments/solana-devnet.prepared.json";

function fail(message) {
  throw new Error(`[solana-devnet-prepare] ${message}`);
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function extractProgramId(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) fail(`Unable to read ${label} program ID`);
  return match[1];
}

function parseArgs(argv) {
  const options = { output: DEFAULT_OUTPUT };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--program-id") options.programId = argv[++index];
    else if (value === "--output") options.output = argv[++index];
    else if (value === "--rpc-url") options.rpcUrl = argv[++index];
    else if (value === "--commit") options.commit = argv[++index];
    else fail(`Unknown argument: ${value}`);
  }
  return options;
}

const options = parseArgs(process.argv);
const libSource = readText(PROGRAM_SOURCE);
const anchorSource = readText(ANCHOR_TOML);
const declaredId = extractProgramId(libSource, /declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/, "declare_id!");
const anchorDevnetId = extractProgramId(
  anchorSource,
  /\[programs\.devnet\][\s\S]*?memewarzone_solana\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"/,
  "Anchor.toml devnet",
);
const requestedId = options.programId || declaredId;

if (requestedId === PLACEHOLDER_PROGRAM_ID) {
  fail("Placeholder program ID is still active. Generate the permanent devnet program keypair and rerun with --program-id <PUBLIC_KEY>.");
}
if (declaredId !== requestedId) fail(`declare_id! is ${declaredId}, expected ${requestedId}`);
if (anchorDevnetId !== requestedId) fail(`Anchor.toml devnet ID is ${anchorDevnetId}, expected ${requestedId}`);

const artifacts = {
  programSo: "target/deploy/memewarzone_solana.so",
  idl: "target/idl/memewarzone_solana.json",
  v4Binding: "target/idl/memewarzone_solana.v4.binding.json",
};

for (const [label, filePath] of Object.entries(artifacts)) {
  if (!fs.existsSync(filePath)) fail(`Missing ${label} artifact: ${filePath}. Run the pinned Anchor build first.`);
}

const prepared = {
  schemaVersion: 1,
  status: "prepared_not_deployed",
  network: "solana-devnet",
  cluster: "devnet",
  rpcUrl: options.rpcUrl || "https://api.devnet.solana.com",
  programId: requestedId,
  sourceCommit: options.commit || process.env.GITHUB_SHA || null,
  generatedAt: new Date().toISOString(),
  toolchain: {
    anchor: "0.30.1",
    solana: "1.18.26",
    rust: "1.79.0",
    idlRust: "nightly-2024-05-09",
  },
  hashes: {
    programSha256: sha256File(artifacts.programSo),
    idlSha256: sha256File(artifacts.idl),
    v4BindingSha256: sha256File(artifacts.v4Binding),
    programSourceSha256: sha256Text(libSource),
    anchorTomlSha256: sha256Text(anchorSource),
  },
  artifacts,
  deployment: {
    signature: null,
    slot: null,
    programDataAddress: null,
    upgradeAuthority: null,
  },
  initialization: {
    globalConfig: null,
    generationConfig: null,
    clusterProfile: null,
    securityDefaultsLocked: false,
    pauseFlagsVerified: false,
  },
};

fs.mkdirSync(path.dirname(options.output), { recursive: true });
fs.writeFileSync(options.output, `${JSON.stringify(prepared, null, 2)}\n`, "utf8");
console.log(`Prepared Solana devnet deployment manifest: ${options.output}`);
console.log(`Program ID: ${requestedId}`);
console.log(`Program SHA-256: ${prepared.hashes.programSha256}`);
