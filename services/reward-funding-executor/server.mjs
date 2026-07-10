import crypto from "node:crypto";
import http from "node:http";
import { Contract, JsonRpcProvider, Wallet, getAddress, isAddress } from "ethers";

const PORT = Number(process.env.PORT || 8080);
const MAX_BODY_BYTES = 32 * 1024;
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 120_000);
const BYTES32_RE = /^0x[a-fA-F0-9]{64}$/;
const UINT64_MAX = (1n << 64n) - 1n;
const inFlight = new Map();

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function parseCsv(value) {
  return new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean));
}

function allowedChains() {
  return new Set([...parseCsv(env("ALLOWED_CHAIN_IDS", "56,97"))].map((value) => Number(value)).filter(Number.isInteger));
}

function normalizeAllowlist(name) {
  const values = parseCsv(env(name));
  const normalized = new Set();
  for (const value of values) {
    if (!isAddress(value)) throw new Error(`${name} contains invalid address: ${value}`);
    normalized.add(getAddress(value));
  }
  if (!normalized.size) throw new Error(`${name} must contain at least one address`);
  return normalized;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length || !a.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { statusCode: 400 });
  }
}

function requireAddress(value, label) {
  if (!isAddress(value)) throw Object.assign(new Error(`${label} must be a valid EVM address`), { statusCode: 400 });
  return getAddress(value);
}

function requireBytes32(value, label) {
  const raw = String(value || "");
  if (!BYTES32_RE.test(raw)) throw Object.assign(new Error(`${label} must be bytes32`), { statusCode: 400 });
  return raw;
}

function requirePositiveUint(value, label) {
  let parsed;
  try { parsed = BigInt(String(value)); } catch { parsed = -1n; }
  if (parsed <= 0n) throw Object.assign(new Error(`${label} must be a positive integer`), { statusCode: 400 });
  return parsed;
}

function requireUint64(value, label) {
  let parsed;
  try { parsed = BigInt(String(value)); } catch { parsed = -1n; }
  if (parsed < 0n || parsed > UINT64_MAX) throw Object.assign(new Error(`${label} must fit uint64`), { statusCode: 400 });
  return parsed;
}

function rpcUrl(chainId) {
  const raw = env(`BSC_RPC_HTTP_${chainId}`) || env(`RPC_URL_${chainId}`) || env("BSC_RPC_HTTP") || env("RPC_URL");
  const url = raw.split(",").map((item) => item.trim()).find(Boolean);
  if (!url) throw new Error(`Missing RPC URL for chain ${chainId}`);
  return url;
}

function operatorKey(chainId) {
  const key = env(`AIRDROP_OPERATOR_PRIVATE_KEY_${chainId}`) || env("AIRDROP_OPERATOR_PRIVATE_KEY");
  if (!/^0x[a-fA-F0-9]{64}$/.test(key)) throw new Error(`Missing or invalid limited airdrop operator key for chain ${chainId}`);
  return key;
}

function requestHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function validateRequest(body, req) {
  if (body.action !== "fund_airdrop_batch") throw Object.assign(new Error("Unsupported action"), { statusCode: 400 });
  if (body.functionName !== "fundAirdropBatch") throw Object.assign(new Error("Unsupported functionName"), { statusCode: 400 });
  if (body.functionSignature !== "fundAirdropBatch(bytes32,bytes32,uint64,uint256)") {
    throw Object.assign(new Error("Unsupported functionSignature"), { statusCode: 400 });
  }

  const chainId = Number(body.chainId);
  if (!Number.isInteger(chainId) || !allowedChains().has(chainId)) {
    throw Object.assign(new Error("Chain is not allowlisted"), { statusCode: 403 });
  }

  const vaultAddress = requireAddress(body.vaultAddress, "vaultAddress");
  const targetContract = requireAddress(body.targetContract, "targetContract");
  const distributorAddress = requireAddress(body.distributorAddress, "distributorAddress");
  if (targetContract !== vaultAddress) throw Object.assign(new Error("targetContract must equal vaultAddress"), { statusCode: 400 });

  const vaultAllowlistName = env(`ALLOWED_COMMUNITY_REWARDS_VAULTS_${chainId}`)
    ? `ALLOWED_COMMUNITY_REWARDS_VAULTS_${chainId}`
    : "ALLOWED_COMMUNITY_REWARDS_VAULTS";
  const distributorAllowlistName = env(`ALLOWED_REWARD_DISTRIBUTORS_${chainId}`)
    ? `ALLOWED_REWARD_DISTRIBUTORS_${chainId}`
    : "ALLOWED_REWARD_DISTRIBUTORS";
  const allowedVaults = normalizeAllowlist(vaultAllowlistName);
  const allowedDistributors = normalizeAllowlist(distributorAllowlistName);
  if (!allowedVaults.has(vaultAddress)) throw Object.assign(new Error("Vault is not allowlisted"), { statusCode: 403 });
  if (!allowedDistributors.has(distributorAddress)) throw Object.assign(new Error("Distributor is not allowlisted"), { statusCode: 403 });

  const contractBatchId = requireBytes32(body.contractBatchId, "contractBatchId");
  const merkleRoot = requireBytes32(body.merkleRoot, "merkleRoot");
  const totalAmount = requirePositiveUint(body.totalAmount, "totalAmount");
  const claimDeadline = requireUint64(body.claimDeadline, "claimDeadline");
  const args = Array.isArray(body.args) ? body.args.map(String) : [];
  const expectedArgs = [contractBatchId, merkleRoot, claimDeadline.toString(), totalAmount.toString()];
  if (args.length !== 4 || args.some((value, index) => value !== expectedArgs[index])) {
    throw Object.assign(new Error("args do not match validated funding parameters"), { statusCode: 400 });
  }

  const headerKey = String(req.headers["idempotency-key"] || "").trim();
  const bodyKey = String(body.idempotencyKey || "").trim();
  const idempotencyKey = headerKey || bodyKey;
  if (!idempotencyKey || (headerKey && bodyKey && headerKey !== bodyKey)) {
    throw Object.assign(new Error("Valid matching idempotency key is required"), { statusCode: 400 });
  }

  return {
    chainId,
    vaultAddress,
    distributorAddress,
    contractBatchId,
    merkleRoot,
    totalAmount,
    claimDeadline,
    idempotencyKey,
    batchId: String(body.batchId || ""),
  };
}

async function readBatch(distributor, batchId) {
  const batch = await distributor.batches(batchId);
  return {
    merkleRoot: String(batch.merkleRoot),
    totalFunded: BigInt(batch.totalFunded),
    totalClaimed: BigInt(batch.totalClaimed),
    claimDeadline: BigInt(batch.claimDeadline),
    paused: Boolean(batch.paused),
    exists: Boolean(batch.exists),
  };
}

function assertExactBatch(batch, request) {
  if (!batch.exists) return false;
  if (batch.merkleRoot.toLowerCase() !== request.merkleRoot.toLowerCase()
      || batch.totalFunded !== request.totalAmount
      || batch.claimDeadline !== request.claimDeadline) {
    throw Object.assign(new Error("Existing on-chain batch does not match request"), { statusCode: 409 });
  }
  if (batch.paused) throw Object.assign(new Error("Existing on-chain batch is paused"), { statusCode: 409 });
  return true;
}

async function executeFunding(request) {
  const provider = new JsonRpcProvider(rpcUrl(request.chainId));
  const signer = new Wallet(operatorKey(request.chainId), provider);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== request.chainId) throw new Error(`RPC chain mismatch: ${network.chainId}`);

  const vault = new Contract(request.vaultAddress, [
    "function airdropOperator() view returns (address)",
    "function rewardDistributor() view returns (address)",
    "function warzoneAirdropBalance() view returns (uint256)",
    "function fundAirdropBatch(bytes32,bytes32,uint64,uint256)",
  ], signer);
  const distributor = new Contract(request.distributorAddress, [
    "function batchOperator() view returns (address)",
    "function batches(bytes32) view returns (bytes32 merkleRoot,uint256 totalFunded,uint256 totalClaimed,uint64 claimDeadline,bool paused,bool exists)",
  ], provider);

  const [configuredOperator, configuredDistributor, configuredBatchOperator] = await Promise.all([
    vault.airdropOperator(),
    vault.rewardDistributor(),
    distributor.batchOperator(),
  ]);
  if (getAddress(configuredOperator) !== getAddress(signer.address)) throw new Error("Executor signer is not vault airdropOperator");
  if (getAddress(configuredDistributor) !== request.distributorAddress) throw new Error("Vault distributor configuration mismatch");
  if (getAddress(configuredBatchOperator) !== request.vaultAddress) throw new Error("Distributor batchOperator is not the vault");

  const existing = await readBatch(distributor, request.contractBatchId);
  if (assertExactBatch(existing, request)) {
    return {
      ok: true,
      idempotent: true,
      requestId: request.idempotencyKey,
      txHash: null,
      blockNumber: null,
      batchId: request.batchId,
      contractBatchId: request.contractBatchId,
    };
  }

  const available = BigInt(await vault.warzoneAirdropBalance());
  if (available < request.totalAmount) {
    throw Object.assign(new Error(`Vault has ${available} wei, requires ${request.totalAmount}`), { statusCode: 409 });
  }

  const tx = await vault.fundAirdropBatch(
    request.contractBatchId,
    request.merkleRoot,
    request.claimDeadline,
    request.totalAmount,
  );
  const receipt = await tx.wait();
  if (!receipt || Number(receipt.status) !== 1) throw new Error("Atomic funding transaction failed");

  const funded = await readBatch(distributor, request.contractBatchId);
  if (!assertExactBatch(funded, request)) throw new Error("Funded batch was not verifiable after confirmation");
  return {
    ok: true,
    idempotent: false,
    requestId: request.idempotencyKey,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    batchId: request.batchId,
    contractBatchId: request.contractBatchId,
  };
}

async function handleFunding(body, req, res) {
  const request = validateRequest(body, req);
  const hash = requestHash({ ...request, totalAmount: request.totalAmount.toString(), claimDeadline: request.claimDeadline.toString() });
  const existing = inFlight.get(request.idempotencyKey);
  if (existing && existing.hash !== hash) return json(res, 409, { ok: false, error: "Idempotency key reused with different request" });

  const promise = existing?.promise || executeFunding(request);
  if (!existing) inFlight.set(request.idempotencyKey, { hash, promise });
  try {
    return json(res, 200, await promise);
  } finally {
    if (inFlight.get(request.idempotencyKey)?.promise === promise) inFlight.delete(request.idempotencyKey);
  }
}

const expectedToken = env("FUNDING_EXECUTOR_TOKEN") || env("REWARD_FUNDING_EXECUTOR_TOKEN");
if (!expectedToken) throw new Error("FUNDING_EXECUTOR_TOKEN is required");
for (const chainId of allowedChains()) {
  const vaultName = env(`ALLOWED_COMMUNITY_REWARDS_VAULTS_${chainId}`)
    ? `ALLOWED_COMMUNITY_REWARDS_VAULTS_${chainId}`
    : "ALLOWED_COMMUNITY_REWARDS_VAULTS";
  const distributorName = env(`ALLOWED_REWARD_DISTRIBUTORS_${chainId}`)
    ? `ALLOWED_REWARD_DISTRIBUTORS_${chainId}`
    : "ALLOWED_REWARD_DISTRIBUTORS";
  normalizeAllowlist(vaultName);
  normalizeAllowlist(distributorName);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, service: "reward-funding-executor" });
    }
    if (req.method !== "POST" || !["/", "/fund"].includes(url.pathname)) {
      return json(res, 404, { ok: false, error: "Not found" });
    }
    if (!safeEqual(bearerToken(req), expectedToken)) return json(res, 401, { ok: false, error: "Unauthorized" });
    return await handleFunding(await readJson(req), req, res);
  } catch (error) {
    console.error("[reward-funding-executor]", error);
    return json(res, Number(error?.statusCode || 500), { ok: false, error: error?.message || "Server error" });
  }
});

server.requestTimeout = REQUEST_TIMEOUT_MS;
server.headersTimeout = Math.min(REQUEST_TIMEOUT_MS, 60_000);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[reward-funding-executor] listening on ${PORT}`);
});
