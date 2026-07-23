import crypto from "node:crypto";

import { badMethod, isSolanaAddress, json, readJson } from "../../server/http.js";

const SOLANA_CHAIN_ID = 101;
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const PLACEHOLDER_PROGRAM_ID = "11111111111111111111111111111111";
const PROTOCOL_PENDING_CODE = "SOLANA_PROTOCOL_PENDING";
const ROUTE_PROFILE_VERSION = "mwz-solana-create-v1";
const DEFAULT_TTL_SECONDS = 10 * 60;
const DEFAULT_GENERATION_ID_HEX = "00".repeat(32);

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function envEnabled(value) {
  return TRUE_VALUES.has(String(value || "").trim().toLowerCase());
}

function firstEnv(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function getSolanaProgramId() {
  return firstEnv("SOLANA_LAUNCHPAD_PROGRAM_ID", "VITE_SOLANA_LAUNCHPAD_PROGRAM_ID");
}

function getRouteSigner() {
  return firstEnv("SOLANA_ROUTE_SIGNER", "SOLANA_ROUTE_AUTHORITY", "VITE_SOLANA_ROUTE_SIGNER");
}

function getGenerationIdHex() {
  const raw = firstEnv("SOLANA_ACTIVE_GENERATION_ID", "VITE_SOLANA_ACTIVE_GENERATION_ID").replace(/^0x/i, "");
  return /^[0-9a-fA-F]{64}$/.test(raw) ? raw.toLowerCase() : DEFAULT_GENERATION_ID_HEX;
}

function getAuthDeadline() {
  const ttl = Number(process.env.SOLANA_ROUTE_AUTH_TTL_SECONDS || process.env.ROUTE_AUTH_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  const safeTtl = Number.isFinite(ttl) && ttl > 0 ? Math.trunc(ttl) : DEFAULT_TTL_SECONDS;
  return Math.floor(Date.now() / 1000) + safeTtl;
}

function isBackendReady() {
  return envEnabled(process.env.SOLANA_AUTHORIZED_CREATE_BACKEND_READY);
}

function isProgramConfigured(programId = getSolanaProgramId()) {
  return Boolean(programId && programId !== PLACEHOLDER_PROGRAM_ID && isSolanaAddress(programId));
}

function normalizeSolanaAddress(value) {
  const raw = String(value || "").trim();
  return isSolanaAddress(raw) ? raw : "";
}

function normalizeText(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function randomBytes32Hex() {
  return crypto.randomBytes(32).toString("hex");
}

function hexToByteArray(hex) {
  return Array.from(Buffer.from(hex.replace(/^0x/i, ""), "hex"));
}

function normalizeMetadata(source = {}) {
  return {
    name: normalizeText(source.name, 80),
    symbol: normalizeText(source.symbol || source.ticker, 16).toUpperCase(),
    logoURI: normalizeText(source.logoURI || source.logoUri || source.logoUrl, 512),
    website: normalizeText(source.website || source.websiteUrl, 512),
    xAccount: normalizeText(source.xAccount || source.xUrl || source.twitter, 512),
    telegram: normalizeText(source.telegram || source.telegramUrl, 512),
    discord: normalizeText(source.discord || source.discordUrl, 512),
    extraLink: normalizeText(source.extraLink || source.otherUrl || source.otherLink, 512),
    category: normalizeText(source.category || "meme", 40),
    description: normalizeText(source.description, 1000),
  };
}

function validateMetadata(metadata) {
  const reasons = [];
  if (!metadata.name) reasons.push("Token name is required.");
  if (!metadata.symbol) reasons.push("Token ticker is required.");
  if (!metadata.logoURI) reasons.push("Token image URL is required.");
  if (metadata.category && metadata.category !== "meme") reasons.push("Only meme tokens are open for Solana prepare/create flow.");
  return reasons;
}

function protocolReadiness() {
  const programId = getSolanaProgramId();
  const routeSigner = getRouteSigner();
  const backendReady = isBackendReady();
  const programConfigured = isProgramConfigured(programId);
  const routeSignerConfigured = isSolanaAddress(routeSigner);
  const reasons = [];
  const warnings = [];

  if (!backendReady) reasons.push("Solana authorized-create backend is not enabled.");
  if (!programConfigured) reasons.push("Solana launchpad program ID is not configured.");
  if (!routeSignerConfigured) reasons.push("Solana route signer is not configured.");
  if (getGenerationIdHex() === DEFAULT_GENERATION_ID_HEX) warnings.push("Solana active generation ID is not configured.");

  return {
    ready: reasons.length === 0,
    reasons,
    warnings,
    programId: programConfigured ? programId : null,
    routeSigner: routeSignerConfigured ? routeSigner : null,
    generationIdHex: getGenerationIdHex(),
    backendReady,
  };
}

function buildPreflight({ creator, metadata, readiness }) {
  const reasons = [];
  const warnings = [...readiness.warnings];
  if (!creator) reasons.push("Invalid or missing Solana creator wallet.");
  reasons.push(...validateMetadata(metadata));
  if (!readiness.ready) reasons.push(...readiness.reasons);

  return {
    allowed: reasons.length === 0,
    chainId: SOLANA_CHAIN_ID,
    reasons,
    warnings,
    protocolStatus: readiness.ready ? "ready" : "protocol_pending",
    code: readiness.ready ? "SOLANA_CREATE_PREFLIGHT_READY" : PROTOCOL_PENDING_CODE,
    creator: creator ? { wallet: creator } : null,
    metadata,
    generation: {
      generationIdHex: readiness.generationIdHex,
      generationId: hexToByteArray(readiness.generationIdHex),
    },
    route: {
      version: ROUTE_PROFILE_VERSION,
      programId: readiness.programId,
      routeSigner: readiness.routeSigner,
      routeAuthorizationMode: "route_signer_transaction_signature",
    },
  };
}

function buildCreateAuthorization({ creator, metadata, preflight }) {
  const deadline = getAuthDeadline();
  const metadataHashHex = sha256Hex(stableStringify(metadata));
  const nonceHex = randomBytes32Hex();
  const routeProfile = {
    version: ROUTE_PROFILE_VERSION,
    chainId: SOLANA_CHAIN_ID,
    programId: preflight.route.programId,
    generationIdHex: preflight.generation.generationIdHex,
    creator,
    metadataHashHex,
    routeSigner: preflight.route.routeSigner,
    routeAuthorizationMode: preflight.route.routeAuthorizationMode,
    deadline,
    nonceHex,
  };
  const routeProfileHashHex = sha256Hex(stableStringify(routeProfile));
  const campaignIdHex = sha256Hex(stableStringify({ creator, metadataHashHex, routeProfileHashHex, nonceHex }));

  return {
    chainId: SOLANA_CHAIN_ID,
    programId: preflight.route.programId,
    routeSigner: preflight.route.routeSigner,
    routeAuthorizationMode: preflight.route.routeAuthorizationMode,
    generationIdHex: preflight.generation.generationIdHex,
    generationId: preflight.generation.generationId,
    campaignIdHex,
    campaignId: hexToByteArray(campaignIdHex),
    metadataHashHex,
    metadataHash: hexToByteArray(metadataHashHex),
    routeProfileHashHex,
    routeProfileHash: hexToByteArray(routeProfileHashHex),
    nonceHex,
    nonce: hexToByteArray(nonceHex),
    deadline,
    validUntil: new Date(deadline * 1000).toISOString(),
    routeProfile,
  };
}

export async function solanaLaunchpadStatus(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const readiness = protocolReadiness();
  return json(res, 200, {
    ok: readiness.ready,
    chainId: SOLANA_CHAIN_ID,
    protocolStatus: readiness.ready ? "ready" : "protocol_pending",
    code: readiness.ready ? "SOLANA_AUTHORIZED_CREATE_READY" : PROTOCOL_PENDING_CODE,
    reasons: readiness.reasons,
    warnings: readiness.warnings,
    programId: readiness.programId,
    routeSigner: readiness.routeSigner,
    generationIdHex: readiness.generationIdHex,
    requiredEnv: [
      "SOLANA_AUTHORIZED_CREATE_BACKEND_READY=true",
      "SOLANA_LAUNCHPAD_PROGRAM_ID or VITE_SOLANA_LAUNCHPAD_PROGRAM_ID",
      "SOLANA_ROUTE_SIGNER or SOLANA_ROUTE_AUTHORITY",
      "SOLANA_ACTIVE_GENERATION_ID",
    ],
  });
}

export async function solanaLaunchpadPreflightCreate(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const creator = normalizeSolanaAddress(body.creatorWallet || body.walletAddress || body.creator);
  const metadata = normalizeMetadata(body.metadata || body.campaignRequest || body);
  const preflight = buildPreflight({ creator, metadata, readiness: protocolReadiness() });
  return json(res, preflight.allowed ? 200 : 403, { preflight });
}

export async function solanaRoutingCreateAuthorization(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const creator = normalizeSolanaAddress(body.creatorWallet || body.walletAddress || body.creator);
  const metadata = normalizeMetadata(body.metadata || body.campaignRequest || body);
  const preflight = buildPreflight({ creator, metadata, readiness: protocolReadiness() });

  if (!preflight.allowed) {
    return json(res, 403, {
      error: preflight.reasons?.[0] || "Solana authorized create is not ready.",
      code: preflight.code,
      preflight,
    });
  }

  return json(res, 200, {
    authorization: buildCreateAuthorization({ creator, metadata, preflight }),
    preflight,
  });
}
