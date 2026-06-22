import { badMethod, isAddress, isSolanaChain, normalizeAddress as normalizeAddressBase, json, readJson } from "../../server/http.js";
import { requireDraftActionAuth } from "./draft-auth.js";
import { notifyDraftOwner, notifyDraftSubscribers } from "./prepare-notify.js";

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function normalizeAddress(value, chainId) {
  // Delegate to central (handles Solana raw base58 via isSolanaAddress heuristic even if no chainId)
  if (normalizeAddressBase) return normalizeAddressBase(value, chainId);
  const raw = String(value || "").trim().toLowerCase();
  return isAddress(raw) ? raw : "";
}

function isDraftPushLiveEnabled() {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.DRAFT_PUSH_LIVE_ENABLED || process.env.ENABLE_DRAFT_PUSH_LIVE || process.env.VITE_DRAFT_PUSH_LIVE_ENABLED || "")
      .trim()
      .toLowerCase(),
  );
}

async function getPool() {
  if (!String(process.env.DATABASE_URL || "").trim()) return null;
  try {
    const mod = await import("../../server/db.js");
    return mod.pool || null;
  } catch (err) {
    console.warn("[draft-deploy] DB unavailable", err?.message || err);
    return null;
  }
}

function mapDraftRow(row) {
  if (!row) return null;
  const draftChainId = Number(row.chain_id ?? 97);
  const rawCreator = String(row.creator_wallet || row.creatorWallet || "");
  return {
    id: String(row.id),
    chainId: draftChainId,
    creatorWallet: isSolanaChain(draftChainId) ? rawCreator : rawCreator.toLowerCase(),
    name: String(row.name || ""),
    ticker: String(row.ticker || ""),
    description: row.description || null,
    category: row.category || "meme",
    logoUrl: row.logo_url ?? null,
    websiteUrl: row.website_url ?? null,
    xUrl: row.x_url ?? null,
    otherUrl: row.other_url ?? null,
    slug: String(row.slug || ""),
    status: String(row.status || "draft"),
    visibility: String(row.visibility || "private"),
    campaignAddress: row.campaign_address ?? null,
    tokenAddress: row.token_address ?? null,
    deployTxHash: row.deploy_tx_hash ?? null,
    archivedAt: row.archived_at ?? null,
    deployedAt: row.deployed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function draftDeploy(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;

  if (!isDraftPushLiveEnabled()) {
    return json(res, 403, {
      error: "Push Live is locked until the platform launch switch is enabled.",
      code: "DRAFT_PUSH_LIVE_LOCKED",
    });
  }

  const draftId = String(req.params?.draftId || "");
  const body = await readJson(req);
  const campaignAddress = normalizeAddress(body.campaignAddress);
  const tokenAddress = normalizeAddress(body.tokenAddress);
  const deployTxHash = String(body.deployTxHash || "").trim().slice(0, 120) || null;

  if (!campaignAddress) return json(res, 400, { error: "Missing deployed campaign address." });

  const pool = await getPool();
  if (!pool) {
    return json(res, 503, { error: "Draft deploy marker requires DATABASE_URL-backed wallet auth." });
  }

  const existing = await pool.query(
    "select id, creator_wallet, chain_id, status, ticker, slug from campaign_drafts where id::text = $1 limit 1",
    [draftId],
  );

  if (!existing.rows.length) return json(res, 404, { error: "Draft not found" });

  const row = existing.rows[0];
  if (row.status === "archived") return json(res, 409, { error: "Archived drafts cannot be pushed live." });

  const ok = await requireDraftActionAuth({
    res,
    pool,
    auth: body.auth,
    expectedWallet: row.creator_wallet,
    chainId: Number(row.chain_id),
    action: "deploy_draft",
    draftId,
  });
  if (!ok) return;

  const updated = await pool.query(
    "update campaign_drafts set status = 'deployed', visibility = 'public', campaign_address = $2, token_address = coalesce($3, token_address), deploy_tx_hash = coalesce($4, deploy_tx_hash), deployed_at = coalesce(deployed_at, now()), updated_at = now() where id::text = $1 returning *",
    [draftId, campaignAddress, tokenAddress || null, deployTxHash],
  );

  const draft = mapDraftRow(updated.rows[0]);
  const launchNotification = {
    eventType: "launch",
    title: "Campaign pushed live",
    body: `$${draft?.ticker || row.ticker || "DRAFT"} is now live in the Warzone.`,
    metadata: {
      target: `/token/${campaignAddress}`,
      campaignAddress,
      tokenAddress: tokenAddress || null,
      deployTxHash,
    },
  };

  await notifyDraftOwner(pool, draft, launchNotification);
  await notifyDraftSubscribers(pool, draft, launchNotification);

  return json(res, 200, { draft });
}
