import { badMethod, getQuery, isAddress, isSolanaChain, normalizeAddress as normalizeAddressBase, json, readJson } from "../../server/http.js";
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
    viewerReacted: Boolean(row.viewer_reacted),
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

  const wallet = normalizeAddress(
    body.walletAddress ||
      body.address ||
      body.userAddress ||
      body.followerAddress ||
      body.auth?.walletAddress,
    draft.chainId
  );
  if (!wallet) return json(res, 400, { error: "Connect wallet to follow this draft." });

  if (body.auth?.signature) {
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

  const wallet = normalizeAddress(body.auth?.walletAddress, draft.chainId);
  if (!wallet) return json(res, 400, { error: "Connect wallet to arm notifications." });

  const authOk = await requireDraftActionAuth({
    res,
    pool,
    auth: body.auth,
    expectedWallet: wallet,
    chainId: draft.chainId,
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
      const query = getQuery(req);
      // Prefer draft chain when known; fall back to query chainId, then EVM default for address normalize.
      const draftMeta = await pool
        .query("select chain_id from campaign_drafts where id::text = $1 limit 1", [draftId])
        .catch(() => null);
      const draftChainId = Number(draftMeta?.rows?.[0]?.chain_id || query.chainId || 56);
      const viewerWallet =
        normalizeAddress(query.wallet || query.walletAddress || query.address, draftChainId) || null;

      // LEFT JOIN user_profiles on (chain_id, address) to fetch the author's
      // display name without forcing a separate per-comment lookup on the
      // client. Falls back to null if the author hasn't set a display name.
      const result = await pool.query(
        `select c.*,
                up.display_name as author_display_name,
                case
                  when $2::text is null then false
                  else exists (
                    select 1
                      from campaign_draft_reactions r
                     where r.comment_id = c.id
                       and r.draft_id = c.draft_id
                       and lower(r.wallet_address) = lower($2)
                       and r.reaction_type = 'upvote'
                  )
                end as viewer_reacted
           from campaign_draft_comments c
           left join campaign_drafts d on d.id = c.draft_id
           left join user_profiles up
             on up.chain_id = d.chain_id and up.address = c.wallet_address
          where c.draft_id = $1 and c.moderation_status = 'visible'
          order by c.created_at asc
          limit 120`,
        [draftId, viewerWallet],
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

export async function signedDraftCommentReaction(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;

  const draftId = String(req.params?.draftId || "");
  const commentId = String(req.params?.commentId || "");
  const body = await readJson(req);
  const pool = await getPool();

  if (!commentId) return json(res, 400, { error: "Comment id is required." });
  if (!pool) return json(res, 503, { error: "Comment reactions require DATABASE_URL-backed wallet auth." });

  const draft = await getDraftAuthContext(pool, draftId);
  if (!draft) return json(res, 404, { error: "Draft not found" });

  const wallet = normalizeAddress(
    body.auth?.walletAddress || body.walletAddress || body.address || body.userAddress,
    draft.chainId,
  );
  if (!wallet) return json(res, 400, { error: "Connect wallet to fire this transmission." });

  const authOk = await requireDraftActionAuth({
    res,
    pool,
    auth: body.auth,
    expectedWallet: wallet,
    chainId: draft.chainId,
    action: "react_draft_comment",
    draftId,
  });
  if (!authOk) return;

  const commentRes = await pool.query(
    `select id, reaction_count
       from campaign_draft_comments
      where id::text = $1
        and draft_id::text = $2
        and moderation_status = 'visible'
      limit 1`,
    [commentId, draftId],
  );
  if (!commentRes.rows[0]) return json(res, 404, { error: "Transmission not found." });

  const client = await pool.connect();
  let reacted = false;
  let reactionCount = Number(commentRes.rows[0].reaction_count || 0);

  try {
    await client.query("begin");

    const removed = await client.query(
      `delete from campaign_draft_reactions
        where draft_id::text = $1
          and comment_id::text = $2
          and lower(wallet_address) = lower($3)
          and reaction_type = 'upvote'
        returning id`,
      [draftId, commentId, wallet],
    );

    if (removed.rows.length) {
      reacted = false;
      const updated = await client.query(
        `update campaign_draft_comments
            set reaction_count = greatest(reaction_count - 1, 0),
                updated_at = now()
          where id::text = $1
          returning reaction_count`,
        [commentId],
      );
      reactionCount = Number(updated.rows[0]?.reaction_count || 0);

      await client.query(
        `insert into campaign_draft_metrics (draft_id, reactions, signed_actions)
         values ($1, 0, 0)
         on conflict (draft_id) do update set
           reactions = greatest(campaign_draft_metrics.reactions - 1, 0),
           updated_at = now()`,
        [draftId],
      );
    } else {
      await client.query(
        `insert into campaign_draft_reactions (draft_id, comment_id, wallet_address, reaction_type)
         values ($1, $2, $3, 'upvote')`,
        [draftId, commentId, wallet],
      );
      reacted = true;
      const updated = await client.query(
        `update campaign_draft_comments
            set reaction_count = reaction_count + 1,
                updated_at = now()
          where id::text = $1
          returning reaction_count`,
        [commentId],
      );
      reactionCount = Number(updated.rows[0]?.reaction_count || 0);

      await client.query(
        `insert into campaign_draft_metrics (draft_id, reactions, signed_actions)
         values ($1, 1, 1)
         on conflict (draft_id) do update set
           reactions = campaign_draft_metrics.reactions + 1,
           signed_actions = campaign_draft_metrics.signed_actions + 1,
           updated_at = now()`,
        [draftId],
      );
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    if (String(err?.code || "") === "23505") {
      const countRes = await pool.query(
        `select reaction_count from campaign_draft_comments where id::text = $1 limit 1`,
        [commentId],
      );
      const existing = await pool.query(
        `select 1 from campaign_draft_reactions
          where draft_id::text = $1 and comment_id::text = $2
            and lower(wallet_address) = lower($3) and reaction_type = 'upvote'
          limit 1`,
        [draftId, commentId, wallet],
      );
      return json(res, 200, {
        reacted: Boolean(existing.rows[0]),
        reactionCount: Number(countRes.rows[0]?.reaction_count || 0),
        commentId: String(commentId),
      });
    }
    console.warn("[draft-engagement] reaction toggle failed", err?.message || err);
    return json(res, 500, { error: "Failed to update reaction." });
  } finally {
    client.release();
  }

  return json(res, 200, {
    reacted,
    reactionCount,
    commentId: String(commentId),
  });
}
