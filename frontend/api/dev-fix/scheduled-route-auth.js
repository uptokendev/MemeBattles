import { ethers } from "ethers";
import { json, readJson } from "../../server/http.js";
import { evaluateCreatePreflight } from "./security.js";
import { getRouteDecision } from "./route-decision.js";
import { logRouteAuthorization } from "./route-auth-log.js";
import { signScheduledCreateAuthorization } from "./routeAuthorizationSigner.js";

const MAX_SCHEDULE_SECONDS = 30 * 24 * 60 * 60;
const WAD = 10n ** 18n;
const STANDARD_TARGETS = new Set([
  (15_000n * WAD).toString(),
  (30_000n * WAD).toString(),
  (50_000n * WAD).toString(),
]);
const TEST_TARGET = (6n * WAD).toString();

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeAddress(value) {
  const raw = String(value || "").trim();
  return ethers.isAddress(raw) ? ethers.getAddress(raw) : "";
}

function normalizeTarget(chainId, value) {
  const target = BigInt(String(value ?? 0)).toString();
  if (STANDARD_TARGETS.has(target)) return target;
  if (Number(chainId) === 97 && truthy(process.env.VITE_ENABLE_TEST_GRADUATION_THRESHOLD || process.env.ENABLE_TEST_GRADUATION_THRESHOLD) && target === TEST_TARGET) return target;
  throw new Error("Unsupported graduation target");
}

function signer() {
  const key = String(
    process.env.ROUTE_AUTHORITY_PRIVATE_KEY ||
      process.env.MWZ_ROUTE_AUTHORITY_PRIVATE_KEY ||
      process.env.ROUTE_AUTH_PRIVATE_KEY ||
      "",
  ).trim();
  if (!key) return null;
  try {
    return new ethers.Wallet(key);
  } catch {
    return null;
  }
}

async function getPool() {
  if (!String(process.env.DATABASE_URL || "").trim()) return null;
  const mod = await import("../../server/db.js");
  return mod.pool || null;
}

function hashText(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(value ?? "")));
}

export async function routingScheduledCreateAuthorization(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = await readJson(req);
  const routeSigner = signer();
  if (!routeSigner) return json(res, 503, { error: "Route authorization signer is not configured." });

  const walletAddress = normalizeAddress(body.walletAddress);
  const factoryAddress = normalizeAddress(body.factoryAddress);
  const draftId = String(body.draftId || "").trim();
  const chainId = Number(body.chainId || 0);
  const launchAt = Number(body.launchAt || 0);

  if (!walletAddress || !factoryAddress || !draftId || !Number.isInteger(chainId) || chainId <= 0) {
    return json(res, 400, { error: "Missing or invalid scheduled launch parameters." });
  }

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(launchAt) || launchAt <= now || launchAt > now + MAX_SCHEDULE_SECONDS) {
    return json(res, 400, { error: "Launch time must be in the future and no more than 30 days away." });
  }

  const pool = await getPool();
  if (!pool) return json(res, 503, { error: "Scheduled launch authorization requires DATABASE_URL." });

  const draftResult = await pool.query(
    `select id, chain_id, creator_wallet, name, ticker, logo_url, website_url, x_url, other_url, status, updated_at
       from campaign_drafts
      where id::text = $1
      limit 1`,
    [draftId],
  );
  const draft = draftResult.rows[0];
  if (!draft) return json(res, 404, { error: "Draft not found." });
  if (Number(draft.chain_id) !== chainId) return json(res, 409, { error: "Draft chain does not match the connected chain." });
  if (normalizeAddress(draft.creator_wallet) !== walletAddress) return json(res, 403, { error: "Only the draft owner can schedule launch." });
  if (!["promotion_published", "ready_to_launch", "scheduled"].includes(String(draft.status))) {
    return json(res, 409, { error: "Publish the promotion page before scheduling launch." });
  }
  if (!String(draft.logo_url || "").trim()) return json(res, 409, { error: "Draft requires a saved logo before launch." });

  let graduationTarget;
  try {
    graduationTarget = normalizeTarget(chainId, body.graduationTargetWei);
  } catch (error) {
    return json(res, 400, { error: error.message });
  }

  const campaign = {
    name: String(draft.name || ""),
    symbol: String(draft.ticker || "").toUpperCase(),
    logoURI: String(draft.logo_url || ""),
    xAccount: String(draft.x_url || ""),
    website: String(draft.website_url || ""),
    extraLink: String(draft.other_url || ""),
    graduationTarget,
  };

  const preflight = await evaluateCreatePreflight({ walletAddress, chainId, factoryAddress });
  if (!preflight.allowed) {
    return json(res, 403, {
      error: preflight.reasons?.[0] || "Creator is not eligible to launch.",
      code: "CREATE_PREFLIGHT_BLOCKED",
      preflight,
    });
  }

  const { tradeRouteProfileId, finalizeRouteProfileId, decision } = await getRouteDecision(walletAddress);
  const deadline = now + 10 * 60;
  const reservationVersion = 1;
  const authorizationNonce = BigInt(`0x${ethers.randomBytes(16).toString().replace(/,/g, "") || "1"}`);
  const normalizedTickerHash = hashText(campaign.symbol);
  const draftReferenceHash = hashText(draftId);
  const metadataHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "bytes32", "bytes32"],
      [hashText(campaign.logoURI), hashText(campaign.xAccount), hashText(campaign.website), hashText(campaign.extraLink)],
    ),
  );

  const scheduledRequest = {
    campaign,
    launchAt,
    draftReferenceHash,
    normalizedTickerHash,
    metadataHash,
    reservationVersion,
    authorizationNonce: authorizationNonce.toString(),
  };

  const signature = await signScheduledCreateAuthorization({
    signer: routeSigner,
    chainId,
    factoryAddress,
    creator: walletAddress,
    request: scheduledRequest,
    launchAt,
    draftReferenceHash,
    normalizedTickerHash,
    metadataHash,
    reservationVersion,
    authorizationNonce,
    tradeRouteProfileId,
    finalizeRouteProfileId,
    deadline,
  });

  const validUntil = new Date(deadline * 1000).toISOString();
  await logRouteAuthorization({
    chainId,
    walletAddress,
    routeKind: "scheduled_create",
    routeProfileId: tradeRouteProfileId,
    finalizeRouteProfileId,
    factoryAddress,
    decision,
    routeAuthority: routeSigner.address,
    authorizationDeadline: deadline,
    validUntil,
    metadata: { endpoint: "/api/routing/scheduled-create-authorization", draftId, scheduledRequest, preflight },
  });

  return json(res, 200, {
    scheduledRequest,
    authorization: {
      tradeRouteProfileId,
      finalizeRouteProfileId,
      validUntil,
      signature,
    },
    preflight,
  });
}
