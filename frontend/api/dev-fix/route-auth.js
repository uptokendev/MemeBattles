import { ethers } from "ethers";
import { badMethod, getQuery, isAddress, json, readJson } from "../../server/http.js";
import { logRouteAuthorization } from "./route-auth-log.js";
import { evaluateCreatePreflight, evaluateTradePreflight } from "./security.js";
import {
  getRouteDecision,
  ROUTE_PROFILE_NAMES,
  ROUTE_PROFILE_STANDARD_LINKED,
  ROUTE_PROFILE_STANDARD_UNLINKED,
  ROUTE_PROFILE_OG_LINKED,
} from "./route-decision.js";
import { signCreateAuthorization, signTradeAuthorization } from "./routeAuthorizationSigner.js";

const VALID_PROFILES = new Set([
  ROUTE_PROFILE_STANDARD_LINKED,
  ROUTE_PROFILE_STANDARD_UNLINKED,
  ROUTE_PROFILE_OG_LINKED,
]);

const FACTORY_ROUTE_AUTHORITY_ABI = ["function routeAuthority() view returns (address)"];

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

function parseUint8(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error(`${label} must be a uint8 value`);
  return n;
}

function parseUint(value, label) {
  if (value === undefined || value === null || value === "") throw new Error(`${label} is required`);
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} must be a uint-compatible value`);
  }
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
  return {
    tradeRouteProfileId: readRouteProfileEnv("DEFAULT_TRADE_ROUTE_PROFILE_ID", ROUTE_PROFILE_STANDARD_UNLINKED),
    finalizeRouteProfileId: readRouteProfileEnv("DEFAULT_FINALIZE_ROUTE_PROFILE_ID", ROUTE_PROFILE_STANDARD_UNLINKED),
  };
}

function getAuthDeadline() {
  const ttlSeconds = parsePositiveInt(process.env.ROUTE_AUTH_TTL_SECONDS, 10 * 60);
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}

function validUntilFromDeadline(deadline) {
  return new Date(deadline * 1000).toISOString();
}

function firstCsvValue(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0] || "";
}

function getRpcUrl(chainId) {
  const perChain = process.env[`BSC_RPC_HTTP_${chainId}`] || process.env[`VITE_PUBLIC_RPC_${chainId}`];
  const perChainFirst = firstCsvValue(perChain);
  if (perChainFirst) return perChainFirst;
  if (chainId === 56) return firstCsvValue(process.env.BSC_RPC_HTTP_56 || process.env.VITE_BSC_MAINNET_RPC);
  if (chainId === 97) return firstCsvValue(process.env.BSC_RPC_HTTP_97 || process.env.VITE_BSC_TESTNET_RPC);
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

function normalizeCampaignRequest(body) {
  const source = body.campaignRequest || body.request || body;
  const request = {
    name: String(source.name || ""),
    symbol: String(source.symbol || ""),
    logoURI: String(source.logoURI || source.logoUri || ""),
    xAccount: String(source.xAccount || ""),
    website: String(source.website || ""),
    extraLink: String(source.extraLink || ""),
  };
  if (!request.name.trim()) throw new Error("Campaign request name is required");
  if (!request.symbol.trim()) throw new Error("Campaign request symbol is required");
  if (!request.logoURI.trim()) throw new Error("Campaign request logoURI is required");
  return request;
}

function routeSignerUnavailable(res) {
  return json(res, 503, {
    error: "Route authorization signer is not configured.",
    code: "ROUTE_AUTHORIZER_NOT_CONFIGURED",
    requiredEnv: ["ROUTE_AUTHORITY_PRIVATE_KEY", "or MWZ_ROUTE_AUTHORITY_PRIVATE_KEY", "or ROUTE_AUTH_PRIVATE_KEY"],
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

function buildReadinessWarnings({ signer, factoryAddress, rpcUrlConfigured, onchain, matchesOnchain }) {
  const warnings = [];
  if (!signer) warnings.push("Route-authority private key is not configured or is invalid.");
  if (!factoryAddress) warnings.push("Factory address is missing for this chain.");
  if (!rpcUrlConfigured) warnings.push("RPC URL is missing for this chain, so on-chain routeAuthority cannot be verified.");
  if (onchain.error) warnings.push(`On-chain routeAuthority check failed: ${onchain.error}`);
  if (signer && onchain.routeAuthority && !matchesOnchain) {
    warnings.push("Configured signer address does not match LaunchFactory.routeAuthority().");
  }
  return warnings;
}

function readinessStatus({ signer, factoryAddress, rpcUrlConfigured, onchain, matchesOnchain }) {
  if (!signer) return "missing_signer";
  if (!factoryAddress) return "missing_factory";
  if (!rpcUrlConfigured) return "missing_rpc";
  if (!onchain.routeAuthority) return "onchain_check_failed";
  if (!matchesOnchain) return "authority_mismatch";
  return "ready";
}

export async function routingStatus(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;

  const q = getQuery(req);
  const chainId = parsePositiveInt(q.chainId || process.env.VITE_DEFAULT_CHAIN_ID || process.env.VITE_TARGET_CHAIN_ID, 97);
  const signer = getSigner();
  const routeAuthority = signer?.address || null;
  const factoryAddress = normalizeAddress(q.factoryAddress) || getFactoryAddressFromEnv(chainId);
  const defaults = getDefaultRouteProfiles();
  const rpcUrlConfigured = Boolean(getRpcUrl(chainId));
  const onchain = await readOnchainRouteAuthority({ chainId, factoryAddress });
  const matchesOnchain = Boolean(routeAuthority && onchain.routeAuthority && routeAuthority.toLowerCase() === onchain.routeAuthority.toLowerCase());

  const readyForCoreFlow = Boolean(signer && factoryAddress && rpcUrlConfigured && onchain.routeAuthority && matchesOnchain);
  const warnings = buildReadinessWarnings({ signer, factoryAddress, rpcUrlConfigured, onchain, matchesOnchain });

  const walletAddress = normalizeAddress(q.walletAddress);
  const routeDecision = walletAddress ? await getRouteDecision(walletAddress) : null;
  const createPreflight = walletAddress ? await evaluateCreatePreflight({ walletAddress, chainId, factoryAddress }) : null;

  return json(res, 200, {
    ok: readyForCoreFlow,
    readyForCoreFlow,
    status: readinessStatus({ signer, factoryAddress, rpcUrlConfigured, onchain, matchesOnchain }),
    warnings,
    signerConfigured: Boolean(signer),
    routeAuthority,
    chainId,
    factoryAddress: factoryAddress || null,
    rpcConfigured: rpcUrlConfigured,
    onchainRouteAuthority: onchain.routeAuthority,
    matchesOnchain,
    onchainError: onchain.error,
    profiles: {
      defaultTradeRouteProfileId: defaults.tradeRouteProfileId,
      defaultFinalizeRouteProfileId: defaults.finalizeRouteProfileId,
      routeProfileNames: ROUTE_PROFILE_NAMES,
    },
    routeDecision: routeDecision?.decision || null,
    createPreflight,
    ttlSeconds: parsePositiveInt(process.env.ROUTE_AUTH_TTL_SECONDS, 10 * 60),
    closeout: {
      requiresSignerConfigured: true,
      requiresOnchainMatch: true,
      requiresCreateAndTradeAuthorization200: true,
      requiresSecurityPreflightAllowed: true,
    },
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

  let campaignRequest;
  try {
    campaignRequest = normalizeCampaignRequest(body);
  } catch (error) {
    return json(res, 400, { error: error.message });
  }

  const createPreflight = await evaluateCreatePreflight({ walletAddress, chainId, factoryAddress });
  if (!createPreflight.allowed) {
    return json(res, 403, {
      error: createPreflight.reasons?.[0] || "Creator is not eligible to launch.",
      code: "CREATE_PREFLIGHT_BLOCKED",
      preflight: createPreflight,
    });
  }

  const { tradeRouteProfileId, finalizeRouteProfileId, decision } = await getRouteDecision(walletAddress);
  const deadline = getAuthDeadline();
  const validUntil = validUntilFromDeadline(deadline);
  const signature = await signCreateAuthorization({
    signer,
    chainId,
    factoryAddress,
    creator: walletAddress,
    request: campaignRequest,
    tradeRouteProfileId,
    finalizeRouteProfileId,
    deadline,
  });

  await logRouteAuthorization({
    chainId,
    walletAddress,
    routeKind: "create",
    routeProfileId: tradeRouteProfileId,
    finalizeRouteProfileId,
    factoryAddress,
    decision,
    routeAuthority: signer.address,
    authorizationDeadline: deadline,
    validUntil,
    metadata: { endpoint: "/api/routing/create-authorization", campaignRequest, preflight: createPreflight },
  });

  return json(res, 200, {
    authorization: { tradeRouteProfileId, finalizeRouteProfileId, validUntil, signature },
    routeAuthority: signer.address,
    decision,
    preflight: createPreflight,
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

  let action;
  let amount;
  let limit;
  try {
    action = parseUint8(body.action, "action");
    amount = parseUint(body.amount, "amount");
    limit = parseUint(body.limit, "limit");
  } catch (error) {
    return json(res, 400, { error: error.message });
  }

  const tradePreflight = await evaluateTradePreflight({ walletAddress, campaignAddress, chainId });
  if (!tradePreflight.allowed) {
    return json(res, 403, {
      error: tradePreflight.reasons?.[0] || "Wallet is not eligible to trade.",
      code: "TRADE_PREFLIGHT_BLOCKED",
      preflight: tradePreflight,
    });
  }

  const { routeProfileId, decision } = await getRouteDecision(walletAddress);
  const deadline = getAuthDeadline();
  const validUntil = validUntilFromDeadline(deadline);
  const signature = await signTradeAuthorization({
    signer,
    chainId,
    campaignAddress,
    actor: walletAddress,
    routeProfileId,
    action,
    amount,
    limit,
    deadline,
  });

  await logRouteAuthorization({
    chainId,
    walletAddress,
    routeKind: "trade",
    routeProfileId,
    campaignAddress,
    decision,
    routeAuthority: signer.address,
    authorizationDeadline: deadline,
    validUntil,
    metadata: { endpoint: "/api/routing/trade-authorization", action, amount: amount.toString(), limit: limit.toString(), preflight: tradePreflight },
  });

  return json(res, 200, {
    authorization: { routeProfileId, validUntil, signature },
    routeAuthority: signer.address,
    decision,
    preflight: tradePreflight,
  });
}
