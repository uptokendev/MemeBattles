"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const anchor = require("@coral-xyz/anchor");
const { Keypair, PublicKey } = require("@solana/web3.js");
const { AnchorProvider, Program, Wallet } = anchor;

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_RPC = "https://api.devnet.solana.com";
const DEFAULT_MANIFEST = path.join(ROOT, "config/solana/devnet-generation-v3.json");
const DEFAULT_IDL = path.join(ROOT, "target/idl/memewarzone_solana.json");
const DEFAULT_OUTPUT = path.join(ROOT, "deployments/solana-devnet.generation-manifest-diagnostic.json");

function fail(message) {
  throw new Error(`[solana-generation-manifest] ${message}`);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function manifestHashes(text) {
  const parsed = JSON.parse(text);
  return {
    canonicalSha256: sha256Hex(canonicalJson(parsed)),
    rawSha256: sha256Hex(text),
    generationIdSeed: parsed.generationIdSeed,
  };
}

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return {
    ok: !result.error && result.status === 0,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

function gitShow(spec) {
  const result = git(["show", spec]);
  return result.ok ? result.stdout : null;
}

function deriveGenerationPda(programId, generationIdSeed) {
  const generationId = crypto.createHash("sha256").update(generationIdSeed).digest();
  return PublicKey.findProgramAddressSync(
    [Buffer.from("generation"), generationId],
    programId,
  )[0];
}

function findHistoryMatches(relativeManifestPath, targetHash) {
  const log = git(["log", "--format=%H", "--", relativeManifestPath]);
  if (!log.ok) return { canonical: [], raw: [], inspected: 0, error: log.stderr.trim() || "git log failed" };

  const commits = log.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).slice(0, 100);
  const canonical = [];
  const raw = [];
  for (const commit of commits) {
    const text = gitShow(`${commit}:${relativeManifestPath}`);
    if (text === null) continue;
    try {
      const hashes = manifestHashes(text);
      if (hashes.canonicalSha256 === targetHash) canonical.push(commit);
      if (hashes.rawSha256 === targetHash) raw.push(commit);
    } catch {
      // Historical non-JSON content is irrelevant to the diagnostic.
    }
  }
  return { canonical, raw, inspected: commits.length, error: null };
}

async function main() {
  const manifestPath = path.resolve(process.env.SOLANA_GENERATION_MANIFEST_FILE || DEFAULT_MANIFEST);
  const idlPath = path.resolve(process.env.SOLANA_IDL_FILE || DEFAULT_IDL);
  if (!fs.existsSync(manifestPath)) fail(`manifest not found: ${manifestPath}`);
  if (!fs.existsSync(idlPath)) fail(`IDL not found: ${idlPath}`);

  const manifestText = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  const workingTreeHashes = manifestHashes(manifestText);
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(firstNonEmpty(process.env.SOLANA_LAUNCHPAD_PROGRAM_ID, idl.address));
  const rpcUrl = firstNonEmpty(process.env.SOLANA_RPC_URL, DEFAULT_RPC);
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(Keypair.generate()), { commitment: "confirmed" });
  const program = new Program(idl, provider);
  const generationConfig = deriveGenerationPda(programId, manifest.generationIdSeed);
  const generation = await program.account.generationConfig.fetch(generationConfig);
  const onChainHash = Buffer.from(generation.manifestHash).toString("hex");

  const relativeManifestPath = path.relative(ROOT, manifestPath).split(path.sep).join("/");
  const headText = gitShow(`HEAD:${relativeManifestPath}`);
  let headHashes = null;
  if (headText !== null) {
    try {
      headHashes = manifestHashes(headText);
    } catch {
      headHashes = null;
    }
  }

  const history = findHistoryMatches(relativeManifestPath, onChainHash);
  const configuredBackendHash = firstNonEmpty(process.env.SOLANA_GENERATION_MANIFEST_HASH).toLowerCase() || null;
  const workingTreeMatchesHead = Boolean(headHashes && headHashes.canonicalSha256 === workingTreeHashes.canonicalSha256);

  const evidence = {
    schemaVersion: 1,
    diagnosedAt: new Date().toISOString(),
    rpcUrl,
    programId: programId.toBase58(),
    generationConfig: generationConfig.toBase58(),
    generationIdSeed: manifest.generationIdSeed,
    manifestPath: relativeManifestPath,
    onChainManifestSha256: onChainHash,
    workingTree: workingTreeHashes,
    head: headHashes,
    workingTreeMatchesHead,
    configuredBackendManifestSha256: configuredBackendHash,
    history,
  };

  fs.mkdirSync(path.dirname(DEFAULT_OUTPUT), { recursive: true });
  fs.writeFileSync(DEFAULT_OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  console.error("\n[solana-generation-manifest] DIAGNOSTIC");
  console.error(`On-chain manifest SHA-256: ${onChainHash}`);
  console.error(`Working-tree canonical SHA-256: ${workingTreeHashes.canonicalSha256}`);
  console.error(`Working-tree raw SHA-256: ${workingTreeHashes.rawSha256}`);
  if (headHashes) {
    console.error(`HEAD canonical SHA-256: ${headHashes.canonicalSha256}`);
    console.error(`HEAD raw SHA-256: ${headHashes.rawSha256}`);
    console.error(`Working tree matches HEAD: ${workingTreeMatchesHead ? "yes" : "NO"}`);
  } else {
    console.error("HEAD manifest: unavailable");
  }
  if (configuredBackendHash) console.error(`Configured SOLANA_GENERATION_MANIFEST_HASH: ${configuredBackendHash}`);
  console.error(`Historical canonical match: ${history.canonical[0] || "none"}`);
  console.error(`Historical raw-file match: ${history.raw[0] || "none"}`);
  if (history.error) console.error(`Git history diagnostic warning: ${history.error}`);
  console.error(`Evidence: ${DEFAULT_OUTPUT}`);
  console.error("Do not bootstrap or reset GenerationConfig from this mismatch alone.");
}

main().catch((error) => {
  console.error(`[solana-generation-manifest] diagnostic failed: ${error?.stack || error}`);
  process.exitCode = 1;
});
