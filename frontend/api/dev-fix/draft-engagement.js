import { badMethod, getQuery, isAddress, isSolanaChain, normalizeAddress as normalizeAddressBase, normalizeWalletFlexible, json, readJson } from "../../server/http.js";
import { requireDraftActionAuth } from "./draft-auth.js";
import { insertPrepareNotification, notifyDraftOwner } from "./prepare-notify.js";

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function normalizeAddress(value, chainId) {
  return normalizeAddressBase(value, chainId);
}

function shortAddress(address) {
  const value = String(address || "");
  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
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
      notificationSubscriptions: new Map(),
      comments: new Map(),
      metrics: new Map(),
    };
  }
  return globalThis.__mwz_prepare_mode_store;
}

function mapCommentRow(row) {
  const rawDisplayName = row.author_display_name ?? row.display_name ?? null;
  const displayName =
    typeof rawDisplayName === "string" && rawDisplayName.trim().length > 0
      ? rawDisplayName.trim()
      : null;
  return {
    id: String(row.id),
    draftId: String(row.draft_id),
    walletAddress: String(row.wallet_address),
    displayName,
    body: row.body,
    parentCommentId: row.parent_comment_id ? String(row.parent_comment_id) : null,
    reactionCount: Number(row.reaction_count || 0),
    createdAt: row.created_at,
  };
}

function mapDraftRow(row) {
  if (!row) return null;
  const draftChainId = Number(row.chain_id ?? row.chainId ?? 97);
  const rawCreator = String(row.creator_wallet ?? row.creatorWallet ?? "");
  return {
    id: String(row.id),
    chainId: draftChainId,
    creatorWallet: isSolanaChain(draftChainId) ? rawCreator : rawCreator.toLowerCase(),
    name: String(row.name || ""),
    ticker: String(row.ticker || ""),
    description: row.description || null,
    category: row.category || "meme",
    logoUrl: row.logo_url ?? row.logoUrl ?? null,
    websiteUrl: row.website_url ?? row.websiteUrl ?? null,
    xUrl: row.x_url ?? row.xUrl ?? null,
    otherUrl: row.other_url ?? row.otherUrl ?? null,
    slug: String(row.slug || ""),
    status: String(row.status || "draft"),
    visibility: String(row.visibility || "private"),
    campaignAddress: row.campaign_address ?? row.campaignAddress ?? null,
    tokenAddress: row.token_address ?? row.tokenAddress ?? null,
    deployTxHash: row.deploy_tx_hash ?? row.deployTxHash ?? null,
    archivedAt: row.archived_at ?? row.archivedAt ?? null,
    deployedAt: row.deployed_at ?? row.deployedAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
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

async function ensureNotificationSubscriptionTable(pool) {
  await pool.query(`
    create table if not exists public.campaign_draft_notification_subscriptions (
      draft_id uuid not null references public.campaign_drafts(id) on delete cascade,
      wallet_address text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (draft_id, wallet_address)
    )
  `);
}

async function getDraftAuthContext(pool, draftId) {
  const result = await pool.query(
    "select id, creator_wallet, chain_id, name, ticker, slug from campaign_drafts where id::text = $1 limit 1",
    [draftId],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    creatorWallet: isSolanaChain(row.chain_id) ? String(row.creator_wallet) : normalizeAddress(row.creator_wallet),
    chainId: Number(row.chain_id),
    name: String(row.name || "Draft"),
    ticker: String(row.ticker || "DRAFT"),
    slug: String(row.slug || ""),
  };
}

export async function signedDraftFollow(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;

  const draftId = String(req.params?.draftId || "");
  const body = await readJson(req);
  const pool = await getPool();

  if (!pool) return json(res, 503, { error: "Draft follow requires DATABASE_URL." });

  const draft = await getDraftAuthContext(pool, draftId);
  if (!draft) return json(res, 404, { error: "Draft not found" });

  // Social follow: accept EVM or Solana wallet even if draft is on the other chain.
  const wallet = normalizeWalletFlexible(
    body.walletAddress ||
      body.address ||
      body.userAddress ||
      body.followerAddress ||
      body.auth?.walletAddress,
  );
  if (!wallet) return json(res, 400, { error: "Connect wallet to follow this draft." });

  if (body.auth?.signature) {
    const authChainId = Number(body.auth?.chainId || draft.chainId);
    const authOk = await requireDraftActionAuth({
      res,
      pool,
      auth: body.auth,
      expectedWallet: wallet,
      chainId: Number.isFinite(authChainId) && authChainId > 0 ? authChainId : draft.chainId,
      action: "follow_draft",
      draftId,
    });
    if (!authOk) return;
  }

  const followInsert = await pool.query(
    "insert into campaign_draft_follows (draft_id, wallet_address) values ($1,$2) on conflict (draft_id, wallet_address) do nothing returning wallet_address",
    [draftId, wallet],
  );

  const countRes = await pool.query("select count(*)::int as count from campaign_draft_follows where draft_id = $1", [draftId]);
  const followCount = Number(countRes.rows[0]?.count || 0);

  await pool
    .query(
      "insert into campaign_draft_metrics (draft_id, follows, signed_actions) values ($1, $2, 0) on conflict (draft_id) do update set follows = greatest(campaign_draft_metrics.follows, $2), updated_at = now()",
      [draftId, followCount],
    )
    .catch(() => {});

  if (followInsert.rows.length && wallet !== draft.creatorWallet) {
    await notifyDraftOwner(pool, draft, {
      eventType: "follow",
      title: "New draft follower",
      body: `${shortAddress(wallet)} followed $${draft.ticker}.`,
      metadata: {
        target: `/prepare/${draft.slug}`,
        actor: wallet,
        ticker: draft.ticker,
      },
    });
  }

  return json(res, 200, { following: true, followCount });
}

export async function signedDraftNotificationSubscription(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;

  const draftId = String(req.params?.draftId || "");
  const body = await readJson(req);
  const pool = await getPool();

  if (!pool) return json(res, 503, { error: "Draft notifications require DATABASE_URL-backed wallet auth." });

  await ensureNotificationSubscriptionTable(pool);

  const draft = await getDraftAuthContext(pool, draftId);
  if (!draft) return json(res, 404, { error: "Draft not found" });

  // Arm notifications: use the signer's chain + flexible wallet (EVM can arm Solana drafts).
  const wallet = normalizeWalletFlexible(body.auth?.walletAddress || body.walletAddress || body.address);
  if (!wallet) return json(res, 400, { error: "Connect wallet to arm notifications." });

  const authChainId = Number(body.auth?.chainId || draft.chainId);
  const authOk = await requireDraftActionAuth({
    res,
    pool,
    auth: body.auth,
    expectedWallet: wallet,
    chainId: Number.isFinite(authChainId) && authChainId > 0 ? authChainId : draft.chainId,
    action: "arm_draft_notifications",
    draftId,
  });
  if (!authOk) return;

  const inserted = await pool.query(
    `insert into public.campaign_draft_notification_subscriptions (draft_id, wallet_address)
     values ($1, $2)
     on conflict (draft_id, wallet_address) do update set updated_at = now()
     returning draft_id, wallet_address`,
    [draftId, wallet],
  );

  await insertPrepareNotification(pool, {
    walletAddress: wallet,
    eventType: "armed",
    targetType: "draft",
    targetId: draftId,
    title: "Draft notifications armed",
    body: `You will be notified when $${draft.ticker} deploys or reaches major engagement milestones.`,
    metadata: {
      target: `/prepare/${draft.slug}`,
      ticker: draft.ticker,
    },
  });

  return json(res, 200, {
    armed: Boolean(inserted.rows[0]),
    draftId,
    walletAddress: wallet,
  });
}

export async function followedDrafts(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;

  const q = getQuery(req);
  const chainId = Number(q.chainId || 0);
  const wallet = normalizeAddress(q.wallet || q.walletAddress || q.address, chainId);
  const pool = await getPool();

  if (!wallet) return json(res, 400, { error: "Wallet address required." });
  if (!pool) return json(res, 503, { error: "Followed drafts require DATABASE_URL." });

  const result = await pool.query(
    `select d.*
       from public.campaign_draft_follows f
       join public.campaign_drafts d on d.id = f.draft_id
      where f.wallet_address = $1
        and ($2::int = 0 or d.chain_id = $2)
      order by f.created_at desc
      limit 100`,
    [wallet, Number.isFinite(chainId) ? chainId : 0],
  );

  return json(res, 200, { items: result.rows.map(mapDraftRow) });
}

export async function signedDraftComments(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;

  const draftId = String(req.params?.draftId || "");

  if (req.method === "GET") {
    const pool = await getPool();
    if (pool) {
      // LEFT JOIN user_profiles on (chain_id, address) to fetch the author's
      // display name without forcing a separate per-comment lookup on the
      // client. Falls back to null if the author hasn't set a display name.
      const result = await pool.query(
        `select c.*, up.display_name as author_display_name
           from campaign_draft_comments c
           left join campaign_drafts d on d.id = c.draft_id
           left join user_profiles up
             on up.chain_id = d.chain_id and up.address = c.wallet_address
          where c.draft_id = $1 and c.moderation_status = 'visible'
          order by c.created_at asc
          limit 120`,
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

  const wallet = normalizeAddress(body.auth?.walletAddress, draft.chainId);
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

  if (wallet !== draft.creatorWallet) {
    await notifyDraftOwner(pool, draft, {
      eventType: "comment",
      title: "New bunker comment",
      body: `${shortAddress(wallet)} commented on $${draft.ticker}.`,
      metadata: {
        target: `/prepare/${draft.slug}`,
        actor: wallet,
        ticker: draft.ticker,
        commentId: String(inserted.rows[0]?.id || ""),
      },
    });
  }

  return json(res, 201, { comment: mapCommentRow(inserted.rows[0]) });
}
