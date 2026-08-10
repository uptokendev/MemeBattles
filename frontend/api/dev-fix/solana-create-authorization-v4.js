import crypto from "node:crypto";

import { badMethod, isSolanaChain, json, readJson } from "../../server/http.js";
import { requireDraftActionAuth } from "./draft-auth.js";
import {
  TICKER_RESERVATION_STATUS,
  TickerReservationError,
  canonicalClusterForChain,
  loadTickerReservationByDraft,
  refreshExpiredTickerReservations,
  withTickerReservationTransaction,
} from "./ticker-reservation-service.js";
import {
  CREATE_AUTH_SCHEMA_VERSION,
  SYSVAR_INSTRUCTIONS_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  buildCreateAuthorizationPayload,
  bytes32,
  createAuthorizationDigest,
  createEd25519Signer,
  decodeClusterProfile,
  decodeCreatorProfile,
  decodeGenerationConfig,
  decodeGlobalConfig,
  decodeRiskProfile,
  encodeBase58,
  findProgramAddressSync,
  integerToBytes32,
  nonZeroBytes32,
  publicKeyBytes,
  publicKeyString,
  sha256,
  sha256Hex,
  toBigInt,
} from "./solana-v4-primitives.js";

const MIN_SCHEDULE_SECONDS = 5 * 60;
const MAX_SCHEDULE_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_AUTH_TTL_SECONDS = 10 * 60;
const MAX_AUTH_TTL_SECONDS = 60 * 60;
const PLACEHOLDER_PROGRAM_IDS = new Set([
  SYSTEM_PROGRAM_ID,
  "Fg6PaFpoGXkYsidMpWxTWqjRZ6LkZXoC3XgXvAqUixG",
]);
const ALLOWED_DRAFT_STATUSES = new Set([
  "promotion_published",
  "ready_to_launch",
  "scheduled",
]);
const TARGET_MASKS = new Map([
  [6_000_000n, 1 << 0],
  [15_000_000_000n, 1 << 1],
  [30_000_000_000n, 1 << 2],
  [50_000_000_000n, 1 << 3],
]);
const GENERATION_MANIFEST_ENV = "SOLANA_GENERATION_MANIFEST_HASH";

class SolanaCreateAuthorizationError extends Error {
  constructor(message, { code = "SOLANA_CREATE_AUTHORIZATION_ERROR", httpStatus = 409, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "SolanaCreateAuthorizationError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new SolanaCreateAuthorizationError(`${name} is not configured.`, {
      code: "SOLANA_CREATE_CONFIGURATION_INCOMPLETE",
      httpStatus: 503,
    });
  }
  return value;
}

function hashEnv(name) {
  const value = requiredEnv(name).replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new SolanaCreateAuthorizationError(`${name} must be a lowercase 32-byte SHA-256 value.`, {
      code: "SOLANA_CREATE_CONFIGURATION_INVALID",
      httpStatus: 503,
    });
  }
  return value;
}

function parsePositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return fallback;
  return Math.min(number, maximum);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function hex32(value) {
  return bytes32(value).toString("hex");
}

function bufferArray(value) {
  return Array.from(Buffer.from(value));
}

function samePublicKey(left, right) {
  try {
    return publicKeyBytes(left).equals(publicKeyBytes(right));
  } catch {
    return false;
  }
}

function sameBytes32(left, right) {
  try {
    return bytes32(left).equals(bytes32(right));
  } catch {
    return false;
  }
}

function normalizeDraftMetadata(row, reservation) {
  return {
    schemaVersion: 1,
    draftId: String(row.id),
    chainId: Number(row.chain_id),
    cluster: String(reservation.cluster),
    name: String(row.name || "").trim(),
    ticker: String(reservation.normalizedTicker || row.ticker || "").trim().toUpperCase(),
    description: String(row.description || "").trim(),
    logoUrl: String(row.logo_url || "").trim(),
    websiteUrl: String(row.website_url || "").trim(),
    xUrl: String(row.x_url || "").trim(),
    otherUrl: String(row.other_url || "").trim(),
  };
}

function deriveCampaignId({ draftId, reservationIdHash, generationId, programId }) {
  return sha256(
    Buffer.from("MEMEWARZONE_SOLANA_CAMPAIGN_ID_V1\0", "utf8"),
    Buffer.from(String(draftId), "utf8"),
    bytes32(reservationIdHash, "reservationIdHash"),
    bytes32(generationId, "generationId"),
    publicKeyBytes(programId, "programId"),
  );
}

function graduationTargetMask(target) {
  return TARGET_MASKS.get(target) || 0;
}

function validateGraduationTarget(generation, target) {
  const mask = graduationTargetMask(target);
  if (!mask || (generation.allowedGraduationTierMask & mask) === 0) {
    throw new SolanaCreateAuthorizationError("Graduation target is not enabled by the active Solana generation.", {
      code: "SOLANA_GRADUATION_TARGET_NOT_ALLOWED",
      httpStatus: 400,
    });
  }

  if (generation.clusterKind === 1 && target !== 6_000_000n) {
    throw new SolanaCreateAuthorizationError("The active devnet generation only authorizes the 6 USD test target.", {
      code: "SOLANA_DEVNET_TARGET_REQUIRED",
      httpStatus: 400,
    });
  }
  if (generation.clusterKind === 2 && target === 6_000_000n) {
    throw new SolanaCreateAuthorizationError("The 6 USD test target is forbidden on mainnet-beta.", {
      code: "SOLANA_MAINNET_TEST_TARGET_FORBIDDEN",
      httpStatus: 400,
    });
  }
}

function expectedClusterKind(cluster) {
  if (cluster === "solana-devnet") return 1;
  if (cluster === "solana-mainnet-beta") return 2;
  throw new SolanaCreateAuthorizationError(`Solana cluster ${cluster} is not supported by the current program.`, {
    code: "SOLANA_CLUSTER_NOT_SUPPORTED",
    httpStatus: 503,
  });
}

function validateLaunchAt(launchAt, chainNow) {
  if (launchAt === 0n) return;
  const minimum = BigInt(chainNow + MIN_SCHEDULE_SECONDS);
  const maximum = BigInt(chainNow + MAX_SCHEDULE_SECONDS);
  if (launchAt < minimum || launchAt > maximum) {
    throw new SolanaCreateAuthorizationError("Scheduled Solana launch must be at least 5 minutes and no more than 30 days away.", {
      code: "SOLANA_INVALID_LAUNCH_TIME",
      httpStatus: 400,
    });
  }
}

async function getPool() {
  if (!String(process.env.DATABASE_URL || "").trim()) return null;
  try {
    const mod = await import("../../server/db.js");
    return mod.pool || null;
  } catch (error) {
    console.warn("[solana-v4-create] database unavailable", error?.message || error);
    return null;
  }
}

async function rpcCall(rpcUrl, method, params = []) {
  const timeoutMs = parsePositiveInteger(process.env.SOLANA_RPC_TIMEOUT_MS, 12_000, 30_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`RPC ${method} returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (payload?.error) {
      throw new Error(`RPC ${method} failed: ${payload.error.message || JSON.stringify(payload.error)}`);
    }
    return payload?.result;
  } catch (error) {
    throw new SolanaCreateAuthorizationError(`Solana RPC ${method} failed.`, {
      code: "SOLANA_RPC_UNAVAILABLE",
      httpStatus: 503,
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getChainUnixTime(rpcUrl) {
  const slot = await rpcCall(rpcUrl, "getSlot", [{ commitment: "confirmed" }]);
  const blockTime = await rpcCall(rpcUrl, "getBlockTime", [slot]);
  if (!Number.isInteger(blockTime) || blockTime <= 0) {
    throw new SolanaCreateAuthorizationError("Solana RPC did not return a confirmed block time.", {
      code: "SOLANA_CHAIN_TIME_UNAVAILABLE",
      httpStatus: 503,
    });
  }
  return blockTime;
}

async function getMultipleAccounts(rpcUrl, addresses) {
  const result = await rpcCall(rpcUrl, "getMultipleAccounts", [
    addresses,
    { commitment: "confirmed", encoding: "base64" },
  ]);
  if (!result || !Array.isArray(result.value) || result.value.length !== addresses.length) {
    throw new SolanaCreateAuthorizationError("Solana RPC returned an invalid account response.", {
      code: "SOLANA_ACCOUNT_RESPONSE_INVALID",
      httpStatus: 503,
    });
  }
  return result.value;
}

function decodeOwnedAccount(info, address, programId, decoder, label, context = {}) {
  if (!info) {
    const creator = context.creator ? String(context.creator) : "";
    if (label === "CreatorProfile") {
      throw new SolanaCreateAuthorizationError(
        `CreatorProfile is not initialized for creator ${creator || "wallet"} (PDA ${address}). Operator must run sync_creator_profile + sync_risk_profile before Push Live.`,
        { code: "SOLANA_CREATOR_PROFILE_MISSING", httpStatus: 409 },
      );
    }
    if (label === "RiskProfile") {
      throw new SolanaCreateAuthorizationError(
        `RiskProfile is not initialized for creator ${creator || "wallet"} (PDA ${address}). Operator must run sync_creator_profile + sync_risk_profile before Push Live.`,
        { code: "SOLANA_RISK_PROFILE_MISSING", httpStatus: 409 },
      );
    }
    throw new SolanaCreateAuthorizationError(`${label} account ${address} does not exist.`, {
      code: "SOLANA_REQUIRED_ACCOUNT_MISSING",
      httpStatus: 409,
    });
  }
  if (!samePublicKey(info.owner, programId)) {
    throw new SolanaCreateAuthorizationError(`${label} is not owned by the configured MemeWarzone program.`, {
      code: "SOLANA_ACCOUNT_OWNER_MISMATCH",
      httpStatus: 409,
    });
  }
  const encoded = Array.isArray(info.data) ? info.data[0] : null;
  if (!encoded) {
    throw new SolanaCreateAuthorizationError(`${label} has no base64 account data.`, {
      code: "SOLANA_ACCOUNT_DATA_INVALID",
      httpStatus: 409,
    });
  }
  try {
    return decoder(Buffer.from(encoded, "base64"));
  } catch (error) {
    throw new SolanaCreateAuthorizationError(`${label} account data could not be decoded.`, {
      code: "SOLANA_ACCOUNT_DATA_INVALID",
      httpStatus: 409,
      cause: error,
    });
  }
}

function validateProgramConfiguration(programId) {
  const canonical = publicKeyString(programId, "SOLANA_LAUNCHPAD_PROGRAM_ID");
  if (PLACEHOLDER_PROGRAM_IDS.has(canonical) && !isTruthy(process.env.SOLANA_ALLOW_PLACEHOLDER_PROGRAM_ID)) {
    throw new SolanaCreateAuthorizationError("The configured Solana program ID is a placeholder.", {
      code: "SOLANA_PROGRAM_NOT_DEPLOYED",
      httpStatus: 503,
    });
  }
  return canonical;
}

function validateOnchainState({
  global,
  generation,
  generationConfig,
  creatorProfile,
  riskProfile,
  clusterProfile,
  creator,
  programId,
  cluster,
  signer,
  chainNow,
}) {
  if (global.paused || global.createPaused) {
    throw new SolanaCreateAuthorizationError("Solana campaign creation is paused on-chain.", {
      code: "SOLANA_CREATE_PAUSED",
      httpStatus: 503,
    });
  }
  if (!global.routeAuthorizationRequired || !global.authorizedTradingRequired || !global.securityDefaultsLocked) {
    throw new SolanaCreateAuthorizationError("Solana on-chain security defaults are not locked.", {
      code: "SOLANA_SECURITY_DEFAULTS_NOT_LOCKED",
      httpStatus: 503,
    });
  }
  if (!samePublicKey(global.routeSigner, signer.publicKey)) {
    throw new SolanaCreateAuthorizationError("Configured Railway route signer does not match GlobalConfig.route_signer.", {
      code: "SOLANA_ROUTE_SIGNER_MISMATCH",
      httpStatus: 503,
    });
  }
  if (!sameBytes32(global.activeGenerationId, generation.generationId)) {
    throw new SolanaCreateAuthorizationError("GenerationConfig is not the active creation generation.", {
      code: "SOLANA_GENERATION_INACTIVE",
      httpStatus: 503,
    });
  }
  if (!samePublicKey(generation.programId, programId) || !samePublicKey(generation.configPda, generationConfig)) {
    throw new SolanaCreateAuthorizationError("GenerationConfig program or self-address binding is invalid.", {
      code: "SOLANA_GENERATION_BINDING_INVALID",
      httpStatus: 503,
    });
  }
  if (!generation.activeCreation || !generation.supportEnabled) {
    throw new SolanaCreateAuthorizationError("The active Solana generation is not enabled for campaign creation.", {
      code: "SOLANA_GENERATION_INACTIVE",
      httpStatus: 503,
    });
  }
  if (!generation.routeAuthorizationRequired || !generation.authorizedTradingRequired) {
    throw new SolanaCreateAuthorizationError("Generation security commitments are weaker than required.", {
      code: "SOLANA_GENERATION_SECURITY_INVALID",
      httpStatus: 503,
    });
  }
  if (generation.clusterKind !== expectedClusterKind(cluster)) {
    throw new SolanaCreateAuthorizationError("Configured deployment cluster does not match the active generation.", {
      code: "SOLANA_GENERATION_CLUSTER_MISMATCH",
      httpStatus: 503,
    });
  }
  if (!samePublicKey(creatorProfile.wallet, creator)) {
    throw new SolanaCreateAuthorizationError("CreatorProfile is not bound to the draft creator.", {
      code: "SOLANA_CREATOR_PROFILE_INVALID",
    });
  }
  if (creatorProfile.restricted || creatorProfile.manualReviewRequired) {
    throw new SolanaCreateAuthorizationError("Creator is restricted or requires manual review on Solana.", {
      code: "SOLANA_CREATOR_RESTRICTED",
      httpStatus: 403,
    });
  }
  if (creatorProfile.liveBondingCount >= creatorProfile.maxLiveBondingCount) {
    throw new SolanaCreateAuthorizationError("Creator has reached the active Solana campaign limit.", {
      code: "SOLANA_CREATOR_LAUNCH_LIMIT",
      httpStatus: 403,
    });
  }
  if (creatorProfile.lastLaunchTimestamp > 0n) {
    const nextAllowed = creatorProfile.lastLaunchTimestamp + BigInt(creatorProfile.cooldownSeconds);
    if (BigInt(chainNow) < nextAllowed) {
      throw new SolanaCreateAuthorizationError("Creator Solana launch cooldown is still active.", {
        code: "SOLANA_CREATOR_COOLDOWN",
        httpStatus: 403,
      });
    }
  }
  if (!samePublicKey(riskProfile.wallet, creator) || riskProfile.clusterId.equals(Buffer.alloc(32))) {
    throw new SolanaCreateAuthorizationError("Creator RiskProfile is invalid or has no cluster.", {
      code: "SOLANA_RISK_PROFILE_INVALID",
      httpStatus: 403,
    });
  }
  if (riskProfile.restricted || riskProfile.manualReviewRequired) {
    throw new SolanaCreateAuthorizationError("Creator wallet is restricted or requires manual review on Solana.", {
      code: "SOLANA_WALLET_RESTRICTED",
      httpStatus: 403,
    });
  }
  if (!sameBytes32(clusterProfile.clusterId, riskProfile.clusterId) || clusterProfile.restricted) {
    throw new SolanaCreateAuthorizationError("Creator risk cluster is invalid or restricted.", {
      code: "SOLANA_CLUSTER_RESTRICTED",
      httpStatus: 403,
    });
  }
}

async function loadOnchainPolicy({ rpcUrl, programId, creator, cluster, signer }) {
  const globalConfigPda = findProgramAddressSync([Buffer.from("global", "utf8")], programId);
  const [globalInfo] = await getMultipleAccounts(rpcUrl, [globalConfigPda.publicKey]);
  const global = decodeOwnedAccount(globalInfo, globalConfigPda.publicKey, programId, decodeGlobalConfig, "GlobalConfig");
  const activeGenerationId = nonZeroBytes32(global.activeGenerationId, "GlobalConfig.activeGenerationId");

  const generationConfigPda = findProgramAddressSync(
    [Buffer.from("generation", "utf8"), activeGenerationId],
    programId,
  );
  const creatorBytes = publicKeyBytes(creator, "creator");
  const creatorProfilePda = findProgramAddressSync([Buffer.from("creator", "utf8"), creatorBytes], programId);
  const riskProfilePda = findProgramAddressSync([Buffer.from("risk", "utf8"), creatorBytes], programId);
  const [generationInfo, creatorInfo, riskInfo] = await getMultipleAccounts(rpcUrl, [
    generationConfigPda.publicKey,
    creatorProfilePda.publicKey,
    riskProfilePda.publicKey,
  ]);
  const generation = decodeOwnedAccount(
    generationInfo,
    generationConfigPda.publicKey,
    programId,
    decodeGenerationConfig,
    "GenerationConfig",
  );
  const creatorProfile = decodeOwnedAccount(
    creatorInfo,
    creatorProfilePda.publicKey,
    programId,
    decodeCreatorProfile,
    "CreatorProfile",
    { creator },
  );
  const riskProfile = decodeOwnedAccount(
    riskInfo,
    riskProfilePda.publicKey,
    programId,
    decodeRiskProfile,
    "RiskProfile",
    { creator },
  );
  const clusterProfilePda = findProgramAddressSync(
    [Buffer.from("cluster", "utf8"), nonZeroBytes32(riskProfile.clusterId, "RiskProfile.clusterId")],
    programId,
  );
  const [clusterInfo] = await getMultipleAccounts(rpcUrl, [clusterProfilePda.publicKey]);
  const clusterProfile = decodeOwnedAccount(
    clusterInfo,
    clusterProfilePda.publicKey,
    programId,
    decodeClusterProfile,
    "ClusterProfile",
  );
  const chainNow = await getChainUnixTime(rpcUrl);

  validateOnchainState({
    global,
    generation,
    generationConfig: generationConfigPda.publicKey,
    creatorProfile,
    riskProfile,
    clusterProfile,
    creator,
    programId,
    cluster,
    signer,
    chainNow,
  });

  return {
    chainNow,
    global,
    generation,
    creatorProfile,
    riskProfile,
    clusterProfile,
    accounts: {
      globalConfig: globalConfigPda.publicKey,
      generationConfig: generationConfigPda.publicKey,
      creatorProfile: creatorProfilePda.publicKey,
      riskProfile: riskProfilePda.publicKey,
      clusterProfile: clusterProfilePda.publicKey,
    },
  };
}

function validateDeploymentEvidence(generation) {
  const idlSha256 = hashEnv("SOLANA_LAUNCHPAD_IDL_SHA256");
  const programBinarySha256 = hashEnv("SOLANA_LAUNCHPAD_PROGRAM_SHA256");
  const expectedManifest = String(process.env[GENERATION_MANIFEST_ENV] || "").trim();
  if (expectedManifest && !sameBytes32(expectedManifest, generation.manifestHash)) {
    throw new SolanaCreateAuthorizationError("Active generation manifest hash does not match Railway configuration.", {
      code: "SOLANA_GENERATION_MANIFEST_MISMATCH",
      httpStatus: 503,
    });
  }
  return {
    idlSha256,
    programBinarySha256,
    generationManifestHash: hex32(generation.manifestHash),
  };
}

async function loadDraft(pool, draftId) {
  const result = await pool.query(
    `select id, chain_id, creator_wallet, name, ticker, description, category, logo_url,
            website_url, x_url, other_url, slug, status, visibility, campaign_address,
            token_address, deploy_tx_hash, scheduled_launch_at, created_at, updated_at
       from public.campaign_drafts
      where id::text = $1
      limit 1`,
    [draftId],
  );
  return result.rows[0] || null;
}

function validateDraft(row) {
  if (!row) {
    throw new SolanaCreateAuthorizationError("Draft not found.", {
      code: "DRAFT_NOT_FOUND",
      httpStatus: 404,
    });
  }
  if (!isSolanaChain(row.chain_id)) {
    throw new SolanaCreateAuthorizationError("This endpoint only authorizes Solana drafts.", {
      code: "NOT_A_SOLANA_DRAFT",
      httpStatus: 400,
    });
  }
  if (!ALLOWED_DRAFT_STATUSES.has(String(row.status))) {
    throw new SolanaCreateAuthorizationError("Publish the Prepare Mode promotion before authorizing Solana deployment.", {
      code: "SOLANA_DRAFT_NOT_READY",
    });
  }
  if (row.campaign_address) {
    throw new SolanaCreateAuthorizationError("This draft already has an on-chain campaign.", {
      code: "SOLANA_DRAFT_ALREADY_DEPLOYED",
    });
  }
  if (!String(row.logo_url || "").trim()) {
    throw new SolanaCreateAuthorizationError("Draft requires a saved logo before Solana deployment.", {
      code: "SOLANA_DRAFT_LOGO_REQUIRED",
    });
  }
  publicKeyString(row.creator_wallet, "draft creator wallet");
}

async function authorizeReservation(pool, {
  draft,
  cluster,
  launchAt,
  programId,
  generationId,
  buildAuthorization,
}) {
  return withTickerReservationTransaction(pool, async (db) => {
    await refreshExpiredTickerReservations(db, { draftId: String(draft.id) });
    const reservation = await loadTickerReservationByDraft(db, String(draft.id), { forUpdate: true });
    if (!reservation) {
      throw new TickerReservationError("Ticker reservation is missing, expired, or released.", {
        code: "RESERVATION_NOT_FOUND",
        httpStatus: 409,
      });
    }
    if ([TICKER_RESERVATION_STATUS.ARMED_ONCHAIN, TICKER_RESERVATION_STATUS.LIVE].includes(reservation.status)) {
      throw new TickerReservationError("Ticker is already permanently armed on-chain or live.", {
        code: "RESERVATION_ALREADY_ARMED",
      });
    }
    if (Number(reservation.chainId) !== Number(draft.chain_id) || reservation.cluster !== cluster) {
      throw new TickerReservationError("Ticker reservation chain or cluster does not match this Solana deployment.", {
        code: "RESERVATION_CLUSTER_MISMATCH",
      });
    }
    if (!samePublicKey(reservation.creatorWallet, draft.creator_wallet)) {
      throw new TickerReservationError("Ticker reservation creator does not match the draft owner.", {
        code: "RESERVATION_OWNER_MISMATCH",
      });
    }
    if (String(reservation.normalizedTicker) !== String(draft.ticker || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12)) {
      throw new TickerReservationError("Ticker reservation no longer matches the draft ticker.", {
        code: "RESERVATION_TICKER_MISMATCH",
      });
    }

    const nextVersion = BigInt(reservation.reservationVersion) + 1n;
    const nonce = crypto.randomBytes(32);
    const authorizationNonce = BigInt(`0x${nonce.toString("hex")}`).toString();
    const updated = await db.query(
      `update public.ticker_reservations
          set status = 'ARM_AUTHORIZED',
              scheduled_launch_at = case when $2::bigint = 0 then null else to_timestamp($2) end,
              arm_authorized_at = now(),
              authorization_nonce = $3,
              reservation_version = $4,
              program_id = $5,
              generation_id = $6,
              failure_reason = null,
              metadata = metadata || $7::jsonb,
              updated_at = now()
        where id = $1
        returning *`,
      [
        reservation.id,
        launchAt.toString(),
        authorizationNonce,
        nextVersion.toString(),
        programId,
        hex32(generationId),
        JSON.stringify({
          solanaAuthorizationSchemaVersion: CREATE_AUTH_SCHEMA_VERSION,
          solanaCluster: cluster,
        }),
      ],
    );
    const authorized = await loadTickerReservationByDraft(db, String(draft.id), { forUpdate: true });
    if (!updated.rows[0] || !authorized) {
      throw new TickerReservationError("Ticker reservation authorization update failed.", {
        code: "RESERVATION_AUTHORIZATION_FAILED",
      });
    }

    const result = await buildAuthorization(authorized, nonce);
    await db.query(
      `insert into public.ticker_reservation_events
         (reservation_id, event_type, from_status, to_status, actor_type, actor_wallet, reason, metadata)
       values ($1,$2,$3,$4,'route_signer',$5,$6,$7::jsonb)`,
      [
        authorized.id,
        "solana_v4_create_authorized",
        reservation.status,
        authorized.status,
        draft.creator_wallet,
        launchAt === 0n
          ? "Solana V4 immediate create authorization issued."
          : "Solana V4 scheduled create authorization issued.",
        JSON.stringify(result.auditMetadata),
      ],
    );
    return { reservation: authorized, ...result };
  });
}

function publicGeneration(generation) {
  return {
    generationIdHex: hex32(generation.generationId),
    programId: generation.programId,
    configPda: generation.configPda,
    startSlot: generation.startSlot.toString(),
    clusterKind: generation.clusterKind,
    allowedGraduationTierMask: generation.allowedGraduationTierMask,
    economicsVersion: generation.economicsVersion,
    curveKind: generation.curveKind,
    tokenTotalSupply: generation.tokenTotalSupply.toString(),
    tokenDecimals: generation.tokenDecimals,
    curveSupplyBps: generation.curveSupplyBps,
    liquidityTokenBps: generation.liquidityTokenBps,
    basePriceLamports: generation.basePriceLamports.toString(),
    priceSlopeLamports: generation.priceSlopeLamports.toString(),
    buyFeeBps: generation.buyFeeBps,
    sellFeeBps: generation.sellFeeBps,
    finalizeFeeBps: generation.finalizeFeeBps,
    creatorPostFinalizeBps: generation.creatorPostFinalizeBps,
    liquidityPostFinalizeBps: generation.liquidityPostFinalizeBps,
    dexAdapter: generation.dexAdapter,
    tradeRouteProfileHex: hex32(generation.tradeRouteProfile),
    finalizeRouteProfileHex: hex32(generation.finalizeRouteProfile),
    treasuryProfileHex: hex32(generation.treasuryProfile),
    dexProfileHex: hex32(generation.dexProfile),
    oracleProfileHex: hex32(generation.oracleProfile),
    manifestHashHex: hex32(generation.manifestHash),
    routeAuthorizationRequired: generation.routeAuthorizationRequired,
    authorizedTradingRequired: generation.authorizedTradingRequired,
  };
}

export async function solanaCreateAuthorizationV4(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;

  try {
    if (!isTruthy(process.env.SOLANA_CREATE_AUTH_ENABLED)) {
      throw new SolanaCreateAuthorizationError("Solana create authorization is disabled by the Railway launch gate.", {
        code: "SOLANA_CREATE_AUTH_DISABLED",
        httpStatus: 503,
      });
    }

    const body = await readJson(req);
    const draftId = String(req.params?.draftId || body.draftId || "").trim();
    if (!draftId) {
      throw new SolanaCreateAuthorizationError("draftId is required.", {
        code: "DRAFT_ID_REQUIRED",
        httpStatus: 400,
      });
    }
    if (String(body.mode || "").toLowerCase() === "direct_create") {
      throw new SolanaCreateAuthorizationError("Direct Create remains closed until its canonical draft-and-reservation preflight is wired.", {
        code: "SOLANA_DIRECT_CREATE_NOT_READY",
        httpStatus: 409,
      });
    }

    const pool = await getPool();
    if (!pool) {
      throw new SolanaCreateAuthorizationError("Solana create authorization requires DATABASE_URL.", {
        code: "DATABASE_NOT_CONFIGURED",
        httpStatus: 503,
      });
    }
    const draft = await loadDraft(pool, draftId);
    validateDraft(draft);

    const ownerOk = await requireDraftActionAuth({
      res,
      pool,
      auth: body.auth,
      expectedWallet: draft.creator_wallet,
      chainId: Number(draft.chain_id),
      action: "deploy_draft",
      draftId,
    });
    if (!ownerOk) return;

    const configuredCluster = requiredEnv("SOLANA_CLUSTER");
    const cluster = canonicalClusterForChain(Number(draft.chain_id), configuredCluster);
    const expectedDraftCluster = canonicalClusterForChain(Number(draft.chain_id));
    if (cluster !== expectedDraftCluster) {
      throw new SolanaCreateAuthorizationError("Draft chain ID and configured Solana cluster do not match.", {
        code: "SOLANA_DRAFT_CLUSTER_MISMATCH",
        httpStatus: 503,
      });
    }

    const rpcUrl = requiredEnv("SOLANA_RPC_URL");
    const programId = validateProgramConfiguration(requiredEnv("SOLANA_LAUNCHPAD_PROGRAM_ID"));
    const routeSecret = requiredEnv("SOLANA_ROUTE_SIGNER_SECRET_KEY");
    const expectedRouteSigner = publicKeyString(requiredEnv("SOLANA_ROUTE_SIGNER_PUBLIC_KEY"), "SOLANA_ROUTE_SIGNER_PUBLIC_KEY");
    const signer = createEd25519Signer(routeSecret);
    if (!samePublicKey(signer.publicKey, expectedRouteSigner)) {
      throw new SolanaCreateAuthorizationError("Railway Solana route signer secret does not match SOLANA_ROUTE_SIGNER_PUBLIC_KEY.", {
        code: "SOLANA_ROUTE_SIGNER_CONFIGURATION_MISMATCH",
        httpStatus: 503,
      });
    }

    const onchain = await loadOnchainPolicy({
      rpcUrl,
      programId,
      creator: draft.creator_wallet,
      cluster,
      signer,
    });
    const deploymentEvidence = validateDeploymentEvidence(onchain.generation);
    const graduationTarget = toBigInt(body.graduationTargetUsdMicros, "graduationTargetUsdMicros");
    validateGraduationTarget(onchain.generation, graduationTarget);
    const launchAt = body.launchAt == null || body.launchAt === "" ? 0n : toBigInt(body.launchAt, "launchAt");
    validateLaunchAt(launchAt, onchain.chainNow);

    const ttlSeconds = parsePositiveInteger(
      process.env.SOLANA_CREATE_AUTH_TTL_SECONDS,
      DEFAULT_AUTH_TTL_SECONDS,
      MAX_AUTH_TTL_SECONDS,
    );
    const deadline = BigInt(onchain.chainNow + ttlSeconds);
    const clusterHash = nonZeroBytes32(hashEnv("SOLANA_CLUSTER_HASH_HEX"), "SOLANA_CLUSTER_HASH_HEX");

    const authorized = await authorizeReservation(pool, {
      draft,
      cluster,
      launchAt,
      programId,
      generationId: onchain.generation.generationId,
      buildAuthorization: async (reservation, nonce) => {
        const reservationIdHash = nonZeroBytes32(reservation.reservationIdHash, "reservationIdHash");
        const tickerHash = nonZeroBytes32(reservation.tickerHash, "tickerHash");
        const metadata = normalizeDraftMetadata(draft, reservation);
        const metadataHash = sha256(Buffer.from(canonicalJson(metadata), "utf8"));
        const campaignId = deriveCampaignId({
          draftId,
          reservationIdHash,
          generationId: onchain.generation.generationId,
          programId,
        });
        const campaign = findProgramAddressSync([Buffer.from("campaign", "utf8"), campaignId], programId);
        const mint = findProgramAddressSync([Buffer.from("campaign-mint", "utf8"), campaignId], programId);
        const tokenVault = findProgramAddressSync([Buffer.from("token-vault", "utf8"), campaignId], programId);
        const solVault = findProgramAddressSync([Buffer.from("sol-vault", "utf8"), campaignId], programId);
        const createAuthorization = findProgramAddressSync(
          [Buffer.from("create-auth", "utf8"), publicKeyBytes(draft.creator_wallet), nonce],
          programId,
        );
        const args = {
          campaignId,
          metadataHash,
          clusterHash,
          tickerHash,
          reservationIdHash,
          reservationVersion: BigInt(reservation.reservationVersion),
          launchAt,
          graduationTargetUsdMicros: graduationTarget,
          deadline,
          nonce,
        };
        const authorizationInput = {
          programId,
          generationConfigKey: onchain.accounts.generationConfig,
          generation: onchain.generation,
          creator: draft.creator_wallet,
          riskClusterId: onchain.riskProfile.clusterId,
          creatorBuyLockSeconds: onchain.creatorProfile.creatorBuyLockSeconds,
          creatorBuyCapBps: onchain.creatorProfile.creatorBuyCapBps,
          campaign: campaign.publicKey,
          mint: mint.publicKey,
          tokenVault: tokenVault.publicKey,
          solVault: solVault.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          args,
        };
        const canonicalPayload = buildCreateAuthorizationPayload(authorizationInput);
        const digest = createAuthorizationDigest(authorizationInput);
        const signature = signer.sign(digest);
        if (!signer.verify(digest, signature)) {
          throw new SolanaCreateAuthorizationError("Railway failed to verify its own Solana V4 signature.", {
            code: "SOLANA_ROUTE_SIGNATURE_INVALID",
            httpStatus: 503,
          });
        }

        const accountSet = {
          creator: publicKeyString(draft.creator_wallet),
          globalConfig: onchain.accounts.globalConfig,
          generationConfig: onchain.accounts.generationConfig,
          creatorProfile: onchain.accounts.creatorProfile,
          riskProfile: onchain.accounts.riskProfile,
          clusterProfile: onchain.accounts.clusterProfile,
          campaign: campaign.publicKey,
          mint: mint.publicKey,
          tokenVault: tokenVault.publicKey,
          solVault: solVault.publicKey,
          createAuthorization: createAuthorization.publicKey,
          instructions: SYSVAR_INSTRUCTIONS_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        };
        const createArgs = {
          campaignId: bufferArray(args.campaignId),
          metadataHash: bufferArray(args.metadataHash),
          clusterHash: bufferArray(args.clusterHash),
          tickerHash: bufferArray(args.tickerHash),
          reservationIdHash: bufferArray(args.reservationIdHash),
          reservationVersion: args.reservationVersion.toString(),
          launchAt: args.launchAt.toString(),
          graduationTargetUsdMicros: args.graduationTargetUsdMicros.toString(),
          deadline: args.deadline.toString(),
          nonce: bufferArray(args.nonce),
        };
        const auditMetadata = {
          schemaVersion: CREATE_AUTH_SCHEMA_VERSION,
          programId,
          cluster,
          generationIdHex: hex32(onchain.generation.generationId),
          generationConfig: onchain.accounts.generationConfig,
          campaign: campaign.publicKey,
          mint: mint.publicKey,
          reservationVersion: reservation.reservationVersion,
          launchAt: launchAt.toString(),
          deadline: deadline.toString(),
          digestHex: digest.toString("hex"),
          canonicalPayloadLength: canonicalPayload.length,
          idlSha256: deploymentEvidence.idlSha256,
          programBinarySha256: deploymentEvidence.programBinarySha256,
        };

        return {
          auditMetadata,
          response: {
            schemaVersion: CREATE_AUTH_SCHEMA_VERSION,
            mode: launchAt === 0n ? "draft_deploy_now" : "countdown",
            cluster,
            programId,
            createArgs,
            accounts: accountSet,
            authorization: {
              signedMessageMode: "sha256_canonical_payload",
              signedMessageLengthBytes: digest.length,
              canonicalPayloadLengthBytes: canonicalPayload.length,
              digestHex: digest.toString("hex"),
              digestBase64: digest.toString("base64"),
              signatureBase64: signature.toString("base64"),
              routeSigner: signer.publicKeyBase58,
              deadline: deadline.toString(),
              validUntil: new Date(Number(deadline) * 1000).toISOString(),
              ed25519InstructionMustImmediatelyPrecedeCreate: true,
              railwayTransactionCosignerRequired: false,
            },
            generation: publicGeneration(onchain.generation),
            deploymentEvidence,
            metadata: {
              canonical: metadata,
              canonicalJsonSha256: sha256Hex(Buffer.from(canonicalJson(metadata), "utf8")),
            },
          },
        };
      },
    });

    return json(res, 200, {
      ...authorized.response,
      tickerReservation: authorized.reservation,
      preflight: {
        chainNow: onchain.chainNow,
        globalSecurityDefaultsLocked: onchain.global.securityDefaultsLocked,
        creatorTier: onchain.creatorProfile.tier,
        creatorLiveBondingCount: onchain.creatorProfile.liveBondingCount,
        creatorMaxLiveBondingCount: onchain.creatorProfile.maxLiveBondingCount,
        riskLevel: onchain.riskProfile.riskLevel,
        riskClusterSize: onchain.clusterProfile.size,
      },
      transaction: null,
      transactionPolicy: "Creator wallet constructs and signs the transaction. Railway signs only the 32-byte V4 digest.",
    });
  } catch (error) {
    if (error instanceof SolanaCreateAuthorizationError || error instanceof TickerReservationError) {
      return json(res, error.httpStatus || 409, { error: error.message, code: error.code });
    }
    console.error("[solana-v4-create] authorization failed", error);
    return json(res, 500, {
      error: "Solana V4 create authorization failed.",
      code: "SOLANA_CREATE_AUTHORIZATION_INTERNAL_ERROR",
    });
  }
}
