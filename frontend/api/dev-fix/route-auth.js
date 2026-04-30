import { ethers } from "ethers";
import { badMethod, isAddress, json, readJson } from "../../server/http.js";

const ROUTE_PROFILE_STANDARD_LINKED = 0;
const ROUTE_PROFILE_STANDARD_UNLINKED = 1;
const ROUTE_PROFILE_OG_LINKED = 2;

const VALID_PROFILES = new Set([
  ROUTE_PROFILE_STANDARD_LINKED,
  ROUTE_PROFILE_STANDARD_UNLINKED,
  ROUTE_PROFILE_OG_LINKED,
]);

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
