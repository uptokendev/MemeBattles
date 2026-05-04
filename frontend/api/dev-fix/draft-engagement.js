import { randomUUID } from "node:crypto";
import { badMethod, isAddress, json, readJson } from "../../server/http.js";
import { requireDraftActionAuth } from "./draft-auth.js";

const ZERO = { views: 0, follows: 0, comments: 0, reactions: 0, shares: 0, signedActions: 0 };

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function normalizeAddress(value) {
  const raw = String(value || "").trim().toLowerCase();
  return isAddress(raw) ? raw : "";
}

function cleanText(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

async function getPool() {
  if (!String(process.env.DATABASE_URL || "").trim()) return null;
  try {
    const mod = await import("../../server/db.js");
    return mod.pool || null;
  } catch (err) {
    console.warn("[draft-engagement] DB unavailable", err?.message || err);
    return null;
  }
}

function memoryStore() {
  if (!globalThis.__mwz_prepare_mode_store) {
    globalThis.__mwz_prepare_mode_store = {
      drafts: new Map(),
      follows: new Map(),
      comments: new Map(),
      metrics: new Map(),
    };
  }
  return globalThis.__mwz_prepare_mode_store;
}

function mapCommentRow(row) {
  return {
    id: String(row.id),
    draftId: String(row.draft_id),
    walletAddress: String(row.wallet_address),
    body: row.body,
    parentCommentId: row.parent_comment_id ? String(row.parent_comment_id) : null,
    reactionCount: Number(row.reaction_count || 0),
    createdAt: row.created_at,
  };
}

function nestComments(flat) {
  const parents = [];
  const byId = new Map();

  for (const raw of flat) {
    const item = { ...raw, parentCommentId: raw.parentCommentId ?? raw.parent_comment_id ?? null, replies: [] };
    byId.set(item.id, item);
    if (!item.parentCommentId) parents.push(item);
  }

  for (const item of byId.values()) {
    if (item.parentCommentId && byId.has(item.parentCommentId)) {
      byId.get(item.parentCommentId).replies.push(item);
    }
  }

  return parents;
}

async function getDraftAuthContext(pool, draftId) {
  const result = await pool.query(
    "select id, creator_wallet, chain_id from campaign_drafts where id::text = $1 limit 1",
    [draftId],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    creatorWallet: normalizeAddress(row.creator_wallet),
    chainId: Number(row.chain_id),
  };
}

export async function signedDraftFollow(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;

  const draftId = String(req.params?.draftId || "");
  const body = await readJson(req);
  const pool = await getPool();

  if (!pool) return json(res, 503, { error: "Signed watchlist requires DATABASE_URL-backed wallet auth." });

  const draft = await getDraftAuthContext(pool, draftId);
  if (!draft) return json(res, 404, { error: "Draft not found" });

  const wallet = normalizeAddress(body.auth?.walletAddress);
  if (!wallet) return json(res, 400, { error: "Connect wallet to watchlist this draft." });

  const authOk = await requireDraftActionAuth({
    res,
    pool,
    auth: body.auth,
    expectedWallet: wallet,
    chainId: draft.chainId,
    action: "follow_draft",
    draftId,
  });
  if (!authOk) return;

  await pool.query(
    "insert into campaign_draft_follows (draft_id, wallet_address) values ($1,$2) on conflict (draft_id, wallet_address) do nothing",
    [draftId, wallet],
  );

  const countRes = await pool.query("select count(*)::int as count from campaign_draft_follows where draft_id = $1", [draftId]);
  const followCount = Number(countRes.rows[0]?.count || 0);

  await pool
    .query(
      "insert into campaign_draft_metrics (draft_id, follows, signed_actions) values ($1, $2, 1) on conflict (draft_id) do update set follows = greatest(campaign_draft_metrics.follows, $2), signed_actions = campaign_draft_metrics.signed_actions + 1, updated_at = now()",
      [draftId, followCount],
    )
    .catch(() => {});

  return json(res, 200, { following: true, followCount });
}

export async function signedDraftComments(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;

  const draftId = String(req.params?.draftId || "");

  if (req.method === "GET") {
    const pool = await getPool();
    if (pool) {
      const result = await pool.query(
        "select * from campaign_draft_comments where draft_id = $1 and moderation_status = 'visible' order by created_at asc limit 120",
        [draftId],
      );
      return json(res, 200, { items: nestComments(result.rows.map(mapCommentRow)) });
    }

    const store = memoryStore();
    return json(res, 200, { items: nestComments(store.comments.get(draftId) || []) });
  }

  const body = await readJson(req);
  const commentBody = cleanText(body.body, 800);
  const parentCommentId = cleanText(body.parentCommentId, 80) || null;
  const pool = await getPool();

  if (!commentBody) return json(res, 400, { error: "Transmission body is required." });
  if (!pool) return json(res, 503, { error: "Signed transmissions require DATABASE_URL-backed wallet auth." });

  const draft = await getDraftAuthContext(pool, draftId);
  if (!draft) return json(res, 404, { error: "Draft not found" });

  const wallet = normalizeAddress(body.auth?.walletAddress);
  if (!wallet) return json(res, 400, { error: "Connect wallet to send a transmission." });

  const authOk = await requireDraftActionAuth({
    res,
    pool,
    auth: body.auth,
    expectedWallet: wallet,
    chainId: draft.chainId,
    action: "comment_draft",
    draftId,
  });
  if (!authOk) return;

  if (parentCommentId && wallet !== draft.creatorWallet) {
    return json(res, 403, { error: "Only the creator can reply to transmissions." });
  }

  const inserted = await pool.query(
    "insert into campaign_draft_comments (draft_id, wallet_address, body, parent_comment_id) values ($1,$2,$3,$4) returning *",
    [draftId, wallet, commentBody, parentCommentId],
  );

  await pool
    .query(
      "insert into campaign_draft_metrics (draft_id, comments, signed_actions) values ($1, 1, 1) on conflict (draft_id) do update set comments = campaign_draft_metrics.comments + 1, signed_actions = campaign_draft_metrics.signed_actions + 1, updated_at = now()",
      [draftId],
    )
    .catch(() => {});

  return json(res, 201, { comment: mapCommentRow(inserted.rows[0]) });
}
