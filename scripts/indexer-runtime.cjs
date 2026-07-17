#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const { buildIndexerManifest } = require("./lib/indexerManifest.cjs");

const DEFAULT_CONFIRMATIONS = 6;
const DEFAULT_BATCH_BLOCKS = 2_000;

const ARTIFACT_CANDIDATES = {
  LaunchFactory: ["contracts/LaunchFactory.sol/LaunchFactory.json"],
  LaunchCampaign: ["contracts/LaunchCampaign.sol/LaunchCampaign.json"],
  LaunchCampaignImplementation: ["contracts/LaunchCampaign.sol/LaunchCampaign.json"],
  TreasuryRouter: ["contracts/TreasuryRouter.sol/TreasuryRouter.json"],
  TreasuryVaultV2: ["contracts/TreasuryVaultV2.sol/TreasuryVaultV2.json", "contracts/treasury/TreasuryVaultV2.sol/TreasuryVaultV2.json"],
  RecruiterRewardsVault: ["contracts/RecruiterRewardsVault.sol/RecruiterRewardsVault.json"],
  CommunityRewardsVault: ["contracts/CommunityRewardsVault.sol/CommunityRewardsVault.json"],
  ProtocolRevenueVault: ["contracts/ProtocolRevenueVault.sol/ProtocolRevenueVault.json"],
  CreatorRegistry: ["contracts/CreatorRegistry.sol/CreatorRegistry.json"],
  RiskRegistry: ["contracts/RiskRegistry.sol/RiskRegistry.json"],
  GraduationOracle: ["contracts/GraduationOracle.sol/GraduationOracle.json"],
  PermanentLpLocker: ["contracts/PermanentLpLocker.sol/PermanentLpLocker.json"],
  UPVoteTreasury: ["contracts/UPVoteTreasury.sol/UPVoteTreasury.json"],
};

function requireEnv(name, fallback = "") {
  const value = (process.env[name] || fallback).trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function optionalInt(name, fallback) {
  const raw = (process.env[name] || "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name}: expected non-negative integer`);
  return value;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function defaultDeploymentFile(target) {
  return path.join(__dirname, "..", "deployments", `${target}.json`);
}

function defaultOutputDir(target) {
  return path.join(process.cwd(), "output", "indexer", target);
}

function loadManifest(targetOverride = process.argv[2]) {
  if (process.env.INDEXER_MANIFEST_FILE) return readJson(path.resolve(process.env.INDEXER_MANIFEST_FILE));
  const target = targetOverride || process.env.HARDHAT_NETWORK || process.env.INDEXER_NETWORK || "hardhat";
  const deploymentFile = process.env.DEPLOYMENT_FILE ? path.resolve(process.env.DEPLOYMENT_FILE) : defaultDeploymentFile(target);
  return buildIndexerManifest(readJson(deploymentFile), deploymentFile);
}

function artifactPath(contractName) {
  const candidates = ARTIFACT_CANDIDATES[contractName] || [];
  for (const candidate of candidates) {
    const file = path.join(process.cwd(), "artifacts", candidate);
    if (fs.existsSync(file)) return file;
  }
  return "";
}

function loadArtifactInterface(contractName) {
  const file = artifactPath(contractName);
  if (!file) return null;
  return new ethers.Interface(readJson(file).abi);
}

function fallbackInterface(signatures) {
  return new ethers.Interface(signatures.map((signature) => `event ${signature}`));
}

function buildInterfaces(manifest) {
  const byContractTopic = new Map();
  for (const [contractName, events] of Object.entries(manifest.events || {})) {
    const signatures = Object.keys(events);
    if (signatures.length === 0) continue;
    const iface = loadArtifactInterface(contractName) || fallbackInterface(signatures);
    for (const [signature, topic] of Object.entries(events)) {
      byContractTopic.set(`${contractName}:${String(topic).toLowerCase()}`, { contractName, signature, iface });
    }
  }
  return byContractTopic;
}

function contractFilters(manifest) {
  const filters = [];
  for (const [contractName, address] of Object.entries(manifest.contracts || {})) {
    const topics = Object.values(manifest.events?.[contractName] || {});
    if (address && topics.length > 0) filters.push({ contractName, address, topics });
  }
  return filters;
}

function serializeArg(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeArg);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => Number.isNaN(Number(key))).map(([key, item]) => [key, serializeArg(item)]));
  }
  return value;
}

function decodeLog(log, topicMap) {
  const meta = topicMap.get(`${log.contractName}:${String(log.topics[0]).toLowerCase()}`);
  if (!meta) return null;
  const parsed = meta.iface.parseLog({ topics: log.topics, data: log.data });
  return {
    chainId: log.chainId,
    contractName: meta.contractName,
    contractAddress: log.address,
    eventSignature: meta.signature,
    eventName: parsed.name,
    blockNumber: Number(log.blockNumber),
    blockHash: log.blockHash,
    txHash: log.transactionHash,
    txIndex: Number(log.transactionIndex),
    logIndex: Number(log.index ?? log.logIndex),
    removed: Boolean(log.removed),
    args: serializeArg(parsed.args),
  };
}

function eventKey(event) {
  return `${event.chainId}:${event.txHash}:${event.logIndex}`.toLowerCase();
}

function appendJsonl(file, rows) {
  if (rows.length === 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

function loadCursor(file, manifest) {
  if (!fs.existsSync(file)) {
    const start = manifest.deploymentBlock || 0;
    return { schemaVersion: 1, chainId: manifest.chainId, lastFinalizedBlock: Math.max(0, Number(start) - 1), seen: {} };
  }
  return readJson(file);
}

async function getLatestBlock(provider, rpcUrl) {
  try {
    return await provider.getBlockNumber();
  } catch (error) {
    const detail = error && error.message ? String(error.message).split("\n")[0] : String(error);
    throw new Error(
      `[indexer] RPC unavailable at ${rpcUrl}. Start a local node or set INDEXER_RPC_URL/RPC_URL/BSC_TESTNET_RPC. ${detail}`
    );
  }
}

async function indexOnce(options = {}) {
  const manifest = options.manifest || loadManifest(options.target);
  const rpcUrl = options.rpcUrl || requireEnv("INDEXER_RPC_URL", process.env.RPC_URL || process.env.BSC_TESTNET_RPC || "http://127.0.0.1:8545");
  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  const confirmations = options.confirmations ?? optionalInt("INDEXER_CONFIRMATIONS", DEFAULT_CONFIRMATIONS);
  const batchBlocks = options.batchBlocks ?? optionalInt("INDEXER_BATCH_BLOCKS", DEFAULT_BATCH_BLOCKS);
  const outDir = options.outDir || process.env.INDEXER_OUT_DIR || defaultOutputDir(manifest.network || String(manifest.chainId));
  const cursorFile = path.join(outDir, "cursor.json");
  const eventsFile = path.join(outDir, "events.jsonl");
  const topicMap = buildInterfaces(manifest);
  const filters = contractFilters(manifest);
  const cursor = loadCursor(cursorFile, manifest);
  const latest = await getLatestBlock(provider, rpcUrl);
  const finalizedTo = Math.max(0, latest - confirmations);
  let fromBlock = Number(cursor.lastFinalizedBlock || 0) + 1;

  if (fromBlock > finalizedTo) {
    console.log(`[indexer] up to date latest=${latest} finalized=${finalizedTo}`);
    return { indexed: 0, fromBlock, toBlock: finalizedTo, outDir };
  }

  let indexed = 0;
  while (fromBlock <= finalizedTo) {
    const toBlock = Math.min(finalizedTo, fromBlock + batchBlocks - 1);
    const decoded = [];

    for (const filter of filters) {
      const logs = await provider.getLogs({ address: filter.address, fromBlock, toBlock, topics: [filter.topics] });
      for (const log of logs) {
        const event = decodeLog({ ...log, chainId: manifest.chainId, contractName: filter.contractName }, topicMap);
        if (!event) continue;
        const key = eventKey(event);
        if (cursor.seen[key]) continue;
        cursor.seen[key] = event.blockHash;
        decoded.push(event);
      }
    }

    decoded.sort((a, b) => a.blockNumber - b.blockNumber || a.txIndex - b.txIndex || a.logIndex - b.logIndex);
    appendJsonl(eventsFile, decoded);
    indexed += decoded.length;
    cursor.lastFinalizedBlock = toBlock;
    cursor.updatedAt = Math.floor(Date.now() / 1000);
    writeJsonAtomic(cursorFile, cursor);
    console.log(`[indexer] scanned ${fromBlock}-${toBlock} events=${decoded.length}`);
    fromBlock = toBlock + 1;
  }

  return { indexed, fromBlock, toBlock: finalizedTo, outDir };
}

async function main() {
  const result = await indexOnce({ target: process.argv[2] });
  console.log(`[indexer] complete indexed=${result.indexed} out=${result.outDir}`);
}

module.exports = { buildInterfaces, contractFilters, decodeLog, indexOnce, loadManifest };

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
