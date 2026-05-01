import { ethers } from "ethers";
import { pool } from "../../server/db.js";
import { badMethod, getQuery, isAddress, json, readJson } from "../../server/http.js";

const ROUTE_PROFILE_STANDARD_LINKED = 0;
const ROUTE_PROFILE_STANDARD_UNLINKED = 1;
const ROUTE_PROFILE_OG_LINKED = 2;

const ROUTE_PROFILE_NAMES = {
  [ROUTE_PROFILE_STANDARD_LINKED]: "standard_linked",
  [ROUTE_PROFILE_STANDARD_UNLINKED]: "standard_unlinked",
  [ROUTE_PROFILE_OG_LINKED]: "og_linked",
};

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

function normalizeDbWallet(value) {
  return normalizeAddress(value).toLowerCase();
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
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

async function readWalletAttributionState(walletAddress) {
  const dbWallet = normalizeDbWallet(walletAddress);
  if (!dbWallet) return { state: null, error: "Invalid wallet address" };

  try {
    const { rows } = await pool.query(
      `select wallet_address,
              recruiter_id,
              recruiter_code,
              recruiter_display_name,
              recruiter_is_og,
              recruiter_status,
              recruiter_link_state,
              squad_state,
              has_activity,
              locked_at,
              materialized_at
         from public.wallet_attribution_states
        where wallet_address = $1
        limit 1`,
      [dbWallet],
    );
    return { state: rows[0] || null, error: null };
  } catch (error) {
    if (schemaMissing(error)) return { state: null, error: "Attribution schema missing" };
    console.error("[api/routing attribution lookup]", error);
    return { state: null, error: "Attribution lookup failed" };
  }
}

function isActiveLinkedState(state) {
  if (!state?.recruiter_id) return false;
  if (state.recruiter_status !== "active") return false;
  const linkState = String(state.recruiter_link_state || "").toLowerCase();
  return linkState === "linked_unlocked" || linkState === "linked_locked";
}

function buildDecision({ walletAddress, attributionState, attributionError }) {
  if (attributionError) {
    const { tradeRouteProfileId, finalizeRouteProfileId } = getDefaultRouteProfiles();
    return {
      tradeRouteProfileId,
      finalizeRouteProfileId,
      routeProfileId: tradeRouteProfileId,
      decision: {
        profile: ROUTE_PROFILE_NAMES[tradeRouteProfileId] || "standard_unlinked",
        routeProfileId: tradeRouteProfileId,
        finalizeRouteProfileId,
        walletAddress,
        recruiterId: null,
        recruiterCode: null,
        recruiterDisplayName: null,
        recruiterIsOg: false,
        recruiterStatus: null,
        recruiterLinkState: null,
        squadState: null,
        source: "safe_fallback",
        reason: `${attributionError}; using safe fallback route profile.`,
      },
    };
  }

  if (!isActiveLinkedState(attributionState)) {
    const state = attributionState || {};
    return {
      tradeRouteProfileId: ROUTE_PROFILE_STANDARD_UNLINKED,
      finalizeRouteProfileId: ROUTE_PROFILE_STANDARD_UNLINKED,
      routeProfileId: ROUTE_PROFILE_STANDARD_UNLINKED,
      decision: {
        profile: ROUTE_PROFILE_NAMES[ROUTE_PROFILE_STANDARD_UNLINKED],
        routeProfileId: ROUTE_PROFILE_STANDARD_UNLINKED,
        finalizeRouteProfileId: ROUTE_PROFILE_STANDARD_UNLINKED,
        walletAddress,
        recruiterId: state.recruiter_id ? Number(state.recruiter_id) : null,
        recruiterCode: state.recruiter_code || null,
        recruiterDisplayName: state.recruiter_display_name || null,
        recruiterIsOg: Boolean(state.recruiter_is_og),
        recruiterStatus: state.recruiter_status || null,
        recruiterLinkState: state.recruiter_link_state || "unlinked",
        squadState: state.squad_state || "solo",
        source: "wallet_attribution_states",
        reason: state.recruiter_id
          ? "Wallet is not linked to an active eligible recruiter; using StandardUnlinked."
          : "Wallet has no active recruiter link; using StandardUnlinked.",
      },
    };
  }

  const routeProfileId = attributionState.recruiter_is_og
    ? ROUTE_PROFILE_OG_LINKED
    : ROUTE_PROFILE_STANDARD_LINKED;

  return {
    tradeRouteProfileId: routeProfileId,
    finalizeRouteProfileId: routeProfileId,
    routeProfileId,
    decision: {
      profile: ROUTE_PROFILE_NAMES[routeProfileId],
      routeProfileId,
      finalizeRouteProfileId: routeProfileId,
      walletAddress,
      recruiterId: Number(attributionState.recruiter_id),
      recruiterCode: attributionState.recruiter_code,
      recruiterDisplayName: attributionState.recruiter_display_name || null,
      recruiterIsOg: Boolean(attributionState.recruiter_is_og),
      recruiterStatus: attributionState.recruiter_status,
      recruiterLinkState: attributionState.recruiter_link_state,
      squadState: attributionState.squad_state,
      source: "wallet_attribution_states",
      reason: attributionState.recruiter_is_og
        ? "Wallet is linked to an active OG recruiter; using OgLinked."
        : "Wallet is linked to an active recruiter; using StandardLinked.",
    },
  };
}

async function getRouteDecision(walletAddress) {
  const { state, error } = await readWalletAttributionState(walletAddress);
  return buildDecision({ walletAddress, attributionState: state, attributionError: error });
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

  const walletAddress = normalizeAddress(q.walletAddress);
  const routeDecision = walletAddress ? await getRouteDecision(walletAddress) : null;

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
      defaultTradeRouteProfileId: tradeRouteProfileId,
      defaultFinalizeRouteProfileId: finalizeRouteProfileId,
      routeProfileNames: ROUTE_PROFILE_NAMES,
    },
    routeDecision: routeDecision?.decision || null,
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

  const { tradeRouteProfileId, finalizeRouteProfileId, decision } = await getRouteDecision(walletAddress);
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
    decision,
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

  const { routeProfileId, decision } = await getRouteDecision(walletAddress);
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
    decision,
  });
}
