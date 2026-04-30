import { ethers } from "ethers";
import { badMethod, getQuery, isAddress, json, readJson } from "../../server/http.js";

const ROUTE_PROFILE_STANDARD_LINKED = 0;
const ROUTE_PROFILE_STANDARD_UNLINKED = 1;
const ROUTE_PROFILE_OG_LINKED = 2;

const VALID_PROFILES = new Set([
  ROUTE_PROFILE_STANDARD_LINKED,
  ROUTE_PROFILE_STANDARD_UNLINKED,
  ROUTE_PROFILE_OG_LINKED,
]);

const FACTORY_ROUTE_AUTHORITY_ABI = [
  "function routeAuthority() view returns (address)",
];

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function normalizeAddress(value) {
  const raw = String(value || "").trim();
  return isAddress(raw) ? ethers.getAddress(raw) : "";
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

function getRouteAuthorityPrivateKey() {
  return (
    String(process.env.ROUTE_AUTHORITY_PRIVATE_KEY || "").trim() ||
    String(process.env.MWZ_ROUTE_AUTHORITY_PRIVATE_KEY || "").trim() ||
    String(process.env.ROUTE_AUTH_PRIVATE_KEY || "").trim()
  );
}

function getSigner() {
  const privateKey = getRouteAuthorityPrivateKey();
  if (!privateKey) return null;
  try {
    return new ethers.Wallet(privateKey);
  } catch {
    return null;
  }
}

function readRouteProfileEnv(key, fallback) {
  const n = Number(process.env[key]);
  if (!Number.isFinite(n)) return fallback;
  const profile = Math.trunc(n);
  return VALID_PROFILES.has(profile) ? profile : fallback;
}

function getDefaultRouteProfiles() {
  // Until attribution persistence exists, default to StandardUnlinked.
  // This is safest because it routes community reward slices without falsely
  // assigning recruiter/OG-linked activity.
  const tradeRouteProfileId = readRouteProfileEnv(
    "DEFAULT_TRADE_ROUTE_PROFILE_ID",
    ROUTE_PROFILE_STANDARD_UNLINKED,
  );
  const finalizeRouteProfileId = readRouteProfileEnv(
    "DEFAULT_FINALIZE_ROUTE_PROFILE_ID",
    ROUTE_PROFILE_STANDARD_UNLINKED,
  );
  return { tradeRouteProfileId, finalizeRouteProfileId };
}

function getAuthDeadline() {
  const ttlSeconds = parsePositiveInt(process.env.ROUTE_AUTH_TTL_SECONDS, 10 * 60);
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}

function validUntilFromDeadline(deadline) {
  return new Date(deadline * 1000).toISOString();
}

function getRpcUrl(chainId) {
  const perChain = String(process.env[`BSC_RPC_HTTP_${chainId}`] || process.env[`VITE_PUBLIC_RPC_${chainId}`] || "").trim();
  if (perChain) return perChain.split(",").map((s) => s.trim()).filter(Boolean)[0] || "";
  if (chainId === 56) return String(process.env.BSC_RPC_HTTP_56 || process.env.VITE_BSC_MAINNET_RPC || "").trim();
  if (chainId === 97) return String(process.env.BSC_RPC_HTTP_97 || process.env.VITE_BSC_TESTNET_RPC || "").trim();
  return "";
}

function getFactoryAddressFromEnv(chainId) {
  return normalizeAddress(
    process.env[`VITE_FACTORY_ADDRESS_${chainId}`] ||
    process.env[`FACTORY_ADDRESS_${chainId}`] ||
    process.env.VITE_FACTORY_ADDRESS ||
    process.env.FACTORY_ADDRESS ||
    "",
  );
}

function routeSignerUnavailable(res) {
  return json(res, 503, {
    error: "Route authorization signer is not configured.",
    code: "ROUTE_AUTHORIZER_NOT_CONFIGURED",
    requiredEnv: [
      "ROUTE_AUTHORITY_PRIVATE_KEY",
      "or MWZ_ROUTE_AUTHORITY_PRIVATE_KEY",
      "or ROUTE_AUTH_PRIVATE_KEY",
    ],
  });
}

async function readOnchainRouteAuthority({ chainId, factoryAddress }) {
  const rpcUrl = getRpcUrl(chainId);
  if (!rpcUrl || !factoryAddress) return { routeAuthority: null, error: "Missing RPC URL or factory address" };

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
    const factory = new ethers.Contract(factoryAddress, FACTORY_ROUTE_AUTHORITY_ABI, provider);
    const routeAuthority = await factory.routeAuthority();
    return { routeAuthority: ethers.getAddress(routeAuthority), error: null };
  } catch (error) {
    return { routeAuthority: null, error: String(error?.shortMessage || error?.message || error) };
  }
}

async function signCreateAuthorization({ signer, chainId, factoryAddress, creator, tradeRouteProfileId, finalizeRouteProfileId, deadline }) {
  const digest = ethers.solidityPackedKeccak256(
    ["string", "uint256", "address", "address", "uint8", "uint8", "uint64"],
    [
      "MWZ_CREATE_ROUTE_AUTH",
      BigInt(chainId),
      factoryAddress,
      creator,
      tradeRouteProfileId,
      finalizeRouteProfileId,
      BigInt(deadline),
    ],
  );
  return signer.signMessage(ethers.getBytes(digest));
}

async function signTradeAuthorization({ signer, chainId, campaignAddress, actor, routeProfileId, deadline }) {
  const digest = ethers.solidityPackedKeccak256(
    ["string", "uint256", "address", "address", "uint8", "uint64"],
    [
      "MWZ_ROUTE_TRADE_AUTH",
      BigInt(chainId),
      campaignAddress,
      actor,
      routeProfileId,
      BigInt(deadline),
    ],
  );
  return signer.signMessage(ethers.getBytes(digest));
}

export async function routingStatus(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;

  const q = getQuery(req);
  const chainId = parsePositiveInt(q.chainId || process.env.VITE_DEFAULT_CHAIN_ID || process.env.VITE_TARGET_CHAIN_ID, 97);
  const signer = getSigner();
  const routeAuthority = signer?.address || null;
  const factoryAddress = normalizeAddress(q.factoryAddress) || getFactoryAddressFromEnv(chainId);
  const { tradeRouteProfileId, finalizeRouteProfileId } = getDefaultRouteProfiles();
  const onchain = await readOnchainRouteAuthority({ chainId, factoryAddress });
  const matchesOnchain = Boolean(
    routeAuthority &&
    onchain.routeAuthority &&
    routeAuthority.toLowerCase() === onchain.routeAuthority.toLowerCase()
  );

  return json(res, 200, {
    ok: Boolean(signer && (!onchain.routeAuthority || matchesOnchain)),
    signerConfigured: Boolean(signer),
    routeAuthority,
    chainId,
    factoryAddress: factoryAddress || null,
    onchainRouteAuthority: onchain.routeAuthority,
    matchesOnchain,
    onchainError: onchain.error,
    profiles: {
      tradeRouteProfileId,
      finalizeRouteProfileId,
    },
    ttlSeconds: parsePositiveInt(process.env.ROUTE_AUTH_TTL_SECONDS, 10 * 60),
  });
}

export async function routingCreateAuthorization(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;

  const body = await readJson(req);
  const signer = getSigner();
  if (!signer) return routeSignerUnavailable(res);

  const walletAddress = normalizeAddress(body.walletAddress);
  const factoryAddress = normalizeAddress(body.factoryAddress);
  const chainId = parsePositiveInt(body.chainId, 0);

  if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });
  if (!factoryAddress) return json(res, 400, { error: "Invalid or missing factoryAddress" });
  if (!chainId) return json(res, 400, { error: "Invalid or missing chainId" });

  const { tradeRouteProfileId, finalizeRouteProfileId } = getDefaultRouteProfiles();
  const deadline = getAuthDeadline();
  const signature = await signCreateAuthorization({
    signer,
    chainId,
    factoryAddress,
    creator: walletAddress,
    tradeRouteProfileId,
    finalizeRouteProfileId,
    deadline,
  });

  return json(res, 200, {
    authorization: {
      tradeRouteProfileId,
      finalizeRouteProfileId,
      validUntil: validUntilFromDeadline(deadline),
      signature,
    },
    routeAuthority: signer.address,
    decision: {
      profile: "standard_unlinked",
      reason: "Attribution persistence is not implemented yet; defaulting to standard unlinked routing.",
    },
  });
}

export async function routingTradeAuthorization(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;

  const body = await readJson(req);
  const signer = getSigner();
  if (!signer) return routeSignerUnavailable(res);

  const walletAddress = normalizeAddress(body.walletAddress);
  const campaignAddress = normalizeAddress(body.campaignAddress);
  const chainId = parsePositiveInt(body.chainId, 0);

  if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });
  if (!campaignAddress) return json(res, 400, { error: "Invalid or missing campaignAddress" });
  if (!chainId) return json(res, 400, { error: "Invalid or missing chainId" });

  const { tradeRouteProfileId } = getDefaultRouteProfiles();
  const routeProfileId = tradeRouteProfileId;
  const deadline = getAuthDeadline();
  const signature = await signTradeAuthorization({
    signer,
    chainId,
    campaignAddress,
    actor: walletAddress,
    routeProfileId,
    deadline,
  });

  return json(res, 200, {
    authorization: {
      routeProfileId,
      validUntil: validUntilFromDeadline(deadline),
      signature,
    },
    routeAuthority: signer.address,
    decision: {
      profile: "standard_unlinked",
      reason: "Attribution persistence is not implemented yet; defaulting to standard unlinked routing.",
    },
  });
}
