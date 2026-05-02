import { badMethod, getQuery, isAddress, json, readJson } from "../../server/http.js";

const DRAFT_STATUSES = new Set(["draft", "promotion_published", "ready_to_launch", "deployed", "archived"]);
const VISIBILITIES = new Set(["public", "unlisted", "private"]);
const ZERO_METRICS = {
  views: 0,
  follows: 0,
  comments: 0,
  reactions: 0,
  shares: 0,
  signedActions: 0,
};

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function normalizeAddress(value) {
  const raw = String(value || "").trim().toLowerCase();
  return isAddress(raw) ? raw : "";
}

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .replace(/^\$+/, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 12);
}

function cleanText(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function cleanUrl(value) {
  const raw = cleanText(value, 500);
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) return raw;
  try {
    return new URL(raw).toString();
  } catch {
    return raw;
  }
}

function cleanStringArray(value, maxItems = 12, maxLen = 600) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, maxLen)).filter(Boolean).slice(0, maxItems);
}

function slugify(value) {
  const base = String(value || "draft")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "draft";
}

function makeSlug(name, ticker) {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${slugify(name)}-${String(ticker || "mwz").toLowerCase()}-${suffix}`;
}

async function getPool() {
  if (!String(process.env.DATABASE_URL || "").trim()) return null;
  try {
    const mod = await import("../../server/db.js");
    return mod.pool || null;
  } catch (err) {
    console.warn("[drafts] DB unavailable, falling back to in-memory drafts", err?.message || err);
    return null;
  }
}

function memoryStore() {
  if (!globalThis.__mwz_prepare_mode_store) {
    const now = new Date().toISOString();
    const demoDraft = {
      id: "demo-mwz-draft",
      chainId: 97,
      creatorWallet: "0x0000000000000000000000000000000000000001",
      name: "MEMEWARZONE",
      ticker: "MWZ",
      description: "The launchpad that turns every drop into a war.",
      category: "meme",
      logoUrl: "",
      websiteUrl: "https://memewar.zone",
      xUrl: "https://x.com/memewarzone",
      otherUrl: "",
      slug: "memewarzone-mwz-demo",
      status: "promotion_published",
      visibility: "public",
      campaignAddress: null,
      tokenAddress: null,
      deployTxHash: null,
      archivedAt: null,
      deployedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    globalThis.__mwz_prepare_mode_store = {
      drafts: new Map([[demoDraft.id, demoDraft]]),
      promotions: new Map([[demoDraft.id, defaultPromotion(demoDraft.id, now)]]),
      follows: new Map([[demoDraft.id, new Set()]]),
      comments: new Map([[demoDraft.id, [
        { id: "demo-c1", draftId: demoDraft.id, walletAddress: "@whalepaw", body: "early bag, easy alpha. squad assembled.", reactionCount: 14, createdAt: now },
        { id: "demo-c2", draftId: demoDraft.id, walletAddress: "@grunt_404", body: "LP lock + no silent deployer nonsense = notify-on-launch armed.", reactionCount: 12, createdAt: now },
      ]]]),
      metrics: new Map([[demoDraft.id, { ...ZERO_METRICS, views: 6294, follows: 412, comments: 127, reactions: 219, shares: 93, signedActions: 1843 }]]),
    };
  }
  return globalThis.__mwz_prepare_mode_store;
}

function defaultPromotion(draftId, now = new Date().toISOString()) {
  return {
    draftId,
    missionStatement: "MemeWarzone is the creator-first meme launchpad — every launch becomes a competition, UpVotes drive discovery, and on-chain leagues turn drops into repeatable events.",
    roadmap: ["Recon: recruits, hype, visuals.", "Deploy: bonding curve goes live.", "Graduate: LP locks and DEX migration opens.", "Conquest: weekly meme leagues and holder rewards."],
    launchStrategy: "Build the army first. Launch only when the bunker is full, the comms channels are active, and the squad is ready to push the campaign into the bonding curve.",
    telegramUrl: "",
    discordUrl: "",
    xUrl: "https://x.com/memewarzone",
    websiteUrl: "https://memewar.zone",
    docs: [],
    creatorNote: "No premature trading. No silent deployers. No rugs. This is Prepare Mode.",
    bannerUrl: "",
    shareMessage: "Incoming transmission: this draft is preparing for war on MemeWarzone.",
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function mapDraftRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    chainId: Number(row.chain_id ?? row.chainId ?? 97),
    creatorWallet: String(row.creator_wallet ?? row.creatorWallet ?? "").toLowerCase(),
    name: String(row.name || ""),
    ticker: normalizeTicker(row.ticker),
    description: row.description || null,
    category: row.category || "meme",
    logoUrl: row.logo_url ?? row.logoUrl ?? null,
    websiteUrl: row.website_url ?? row.websiteUrl ?? null,
    xUrl: row.x_url ?? row.xUrl ?? null,
    otherUrl: row.other_url ?? row.otherUrl ?? null,
    slug: String(row.slug || ""),
    status: DRAFT_STATUSES.has(row.status) ? row.status : "draft",
    visibility: VISIBILITIES.has(row.visibility) ? row.visibility : "private",
    campaignAddress: row.campaign_address ?? row.campaignAddress ?? null,
    tokenAddress: row.token_address ?? row.tokenAddress ?? null,
    deployTxHash: row.deploy_tx_hash ?? row.deployTxHash ?? null,
    archivedAt: row.archived_at ?? row.archivedAt ?? null,
    deployedAt: row.deployed_at ?? row.deployedAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
  };
}

function mapPromotionRow(row, draftId) {
  if (!row) return defaultPromotion(draftId);
  return {
    draftId: String(row.draft_id ?? row.draftId ?? draftId),
    missionStatement: row.mission_statement ?? row.missionStatement ?? "",
    roadmap: Array.isArray(row.roadmap) ? row.roadmap : [],
    launchStrategy: row.launch_strategy ?? row.launchStrategy ?? "",
    telegramUrl: row.telegram_url ?? row.telegramUrl ?? "",
    discordUrl: row.discord_url ?? row.discordUrl ?? "",
    xUrl: row.x_url ?? row.xUrl ?? "",
    websiteUrl: row.website_url ?? row.websiteUrl ?? "",
    docs: Array.isArray(row.docs) ? row.docs : [],
    creatorNote: row.creator_note ?? row.creatorNote ?? "",
    bannerUrl: row.banner_url ?? row.bannerUrl ?? "",
    shareMessage: row.share_message ?? row.shareMessage ?? "",
    publishedAt: row.published_at ?? row.publishedAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

function popularityFromMetrics(metrics) {
  const m = { ...ZERO_METRICS, ...(metrics || {}) };
  const rankingScore =
    m.follows * 10 +
    m.comments * 5 +
    m.reactions * 3 +
    m.shares * 4 +
    m.signedActions * 7 +
    Math.min(m.views, 2500) * 0.35;
  const popularityPercentage = Math.max(0, Math.min(100, Math.round((rankingScore / 2200) * 100)));
  const heatLabel = popularityPercentage >= 90 ? "On Fire" : popularityPercentage >= 70 ? "Hot" : popularityPercentage >= 35 ? "Warming" : "Cold";
  return { ...m, popularityPercentage, heatLabel, rankingScore: Math.round(rankingScore) };
}

function canViewDraft(draft, viewer) {
  if (!draft) return false;
  if (draft.visibility !== "private") return true;
  return viewer && draft.creatorWallet.toLowerCase() === viewer.toLowerCase();
}

async function getDraftBundleById(id, viewer) {
  const pool = await getPool();
  if (pool) {
    const draftRes = await pool.query("select * from campaign_drafts where id::text = $1 limit 1", [id]);
    const draft = mapDraftRow(draftRes.rows[0]);
    if (!draft) return null;
    if (!canViewDraft(draft, viewer)) return { forbidden: true };
    const promoRes = await pool.query("select * from campaign_draft_promotion where draft_id = $1 limit 1", [draft.id]);
    const metricsRes = await pool.query("select * from campaign_draft_metrics where draft_id = $1 limit 1", [draft.id]).catch(() => ({ rows: [] }));
    const metrics = metricsRes.rows[0] || ZERO_METRICS;
    return { draft, promotion: mapPromotionRow(promoRes.rows[0], draft.id), popularity: popularityFromMetrics(metrics) };
  }

  const store = memoryStore();
  const draft = store.drafts.get(id);
  if (!draft) return null;
  if (!canViewDraft(draft, viewer)) return { forbidden: true };
  return {
    draft,
    promotion: store.promotions.get(id) || defaultPromotion(id),
    popularity: popularityFromMetrics(store.metrics.get(id)),
  };
}

async function getDraftBundleBySlug(slug, viewer, countView = false) {
  const pool = await getPool();
  if (pool) {
    const draftRes = await pool.query("select * from campaign_drafts where slug = $1 limit 1", [slug]);
    const draft = mapDraftRow(draftRes.rows[0]);
    if (!draft) return null;
    if (!canViewDraft(draft, viewer)) return { forbidden: true };
    if (countView) {
      await pool.query(`insert into campaign_draft_metrics (draft_id, views)
        values ($1, 1)
        on conflict (draft_id) do update set views = campaign_draft_metrics.views + 1, updated_at = now()`, [draft.id]).catch(() => {});
    }
    return getDraftBundleById(draft.id, viewer);
  }

  const store = memoryStore();
  const draft = Array.from(store.drafts.values()).find((item) => item.slug === slug);
  if (!draft) return null;
  if (!canViewDraft(draft, viewer)) return { forbidden: true };
  if (countView) {
    const m = store.metrics.get(draft.id) || { ...ZERO_METRICS };
    m.views += 1;
    store.metrics.set(draft.id, m);
  }
  return getDraftBundleById(draft.id, viewer);
}

export async function drafts(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;

  if (req.method === "GET") {
    const q = getQuery(req);
    const owner = normalizeAddress(q.owner);
    const pool = await getPool();
    if (pool) {
      const result = owner
        ? await pool.query("select * from campaign_drafts where creator_wallet = $1 order by created_at desc limit 50", [owner])
        : await pool.query("select * from campaign_drafts where visibility = 'public' and status <> 'archived' order by created_at desc limit 50");
      return json(res, 200, { items: result.rows.map(mapDraftRow) });
    }
    const store = memoryStore();
    const items = Array.from(store.drafts.values())
      .filter((draft) => owner ? draft.creatorWallet === owner : draft.visibility === "public" && draft.status !== "archived")
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return json(res, 200, { items });
  }

  const body = await readJson(req);
  const creatorWallet = normalizeAddress(body.creatorWallet || body.walletAddress);
  if (!creatorWallet) return json(res, 400, { error: "Draft requires a connected wallet." });

  const name = cleanText(body.name, 80);
  const ticker = normalizeTicker(body.ticker);
  if (!name) return json(res, 400, { error: "Draft name is required." });
  if (!ticker) return json(res, 400, { error: "Draft ticker is required." });

  const chainId = Number(body.chainId || process.env.VITE_TARGET_CHAIN_ID || 97);
  const visibility = VISIBILITIES.has(body.visibility) ? body.visibility : "private";
  const now = new Date().toISOString();

  const pool = await getPool();
  if (pool) {
    const limitRes = await pool.query("select count(*)::int as count from campaign_drafts where creator_wallet = $1 and status <> 'archived'", [creatorWallet]);
    if (Number(limitRes.rows[0]?.count || 0) >= 10) return json(res, 409, { error: "Draft limit reached. Max 10 non-archived drafts per creator." });

    const dupRes = await pool.query("select id from campaign_drafts where chain_id = $1 and lower(ticker) = lower($2) and status <> 'archived' limit 1", [chainId, ticker]);
    if (dupRes.rows.length) return json(res, 409, { error: "Ticker already reserved by an active draft or live campaign." });

    const slug = makeSlug(name, ticker);
    const inserted = await pool.query(`insert into campaign_drafts
      (chain_id, creator_wallet, name, ticker, description, category, logo_url, website_url, x_url, other_url, slug, status, visibility)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12)
      returning *`, [
        chainId,
        creatorWallet,
        name,
        ticker,
        cleanText(body.description, 1200) || null,
        cleanText(body.category, 40) || "meme",
        cleanUrl(body.logoUrl) || null,
        cleanUrl(body.websiteUrl) || null,
        cleanUrl(body.xUrl) || null,
        cleanUrl(body.otherUrl) || null,
        slug,
        visibility,
      ]);
    const draft = mapDraftRow(inserted.rows[0]);
    await pool.query("insert into campaign_draft_promotion (draft_id) values ($1) on conflict (draft_id) do nothing", [draft.id]).catch(() => {});
    return json(res, 201, { draft });
  }

  const store = memoryStore();
  const activeForOwner = Array.from(store.drafts.values()).filter((draft) => draft.creatorWallet === creatorWallet && draft.status !== "archived");
  if (activeForOwner.length >= 10) return json(res, 409, { error: "Draft limit reached. Max 10 non-archived drafts per creator." });
  const dup = Array.from(store.drafts.values()).find((draft) => Number(draft.chainId) === chainId && draft.ticker === ticker && draft.status !== "archived");
  if (dup) return json(res, 409, { error: "Ticker already reserved by an active draft or live campaign." });

  const draft = {
    id: crypto.randomUUID(),
    chainId,
    creatorWallet,
    name,
    ticker,
    description: cleanText(body.description, 1200) || null,
    category: cleanText(body.category, 40) || "meme",
    logoUrl: cleanUrl(body.logoUrl) || null,
    websiteUrl: cleanUrl(body.websiteUrl) || null,
    xUrl: cleanUrl(body.xUrl) || null,
    otherUrl: cleanUrl(body.otherUrl) || null,
    slug: makeSlug(name, ticker),
    status: "draft",
    visibility,
    campaignAddress: null,
    tokenAddress: null,
    deployTxHash: null,
    archivedAt: null,
    deployedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store.drafts.set(draft.id, draft);
  store.promotions.set(draft.id, defaultPromotion(draft.id, now));
  store.metrics.set(draft.id, { ...ZERO_METRICS });
  return json(res, 201, { draft });
}

export async function draftById(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const bundle = await getDraftBundleById(String(req.params?.draftId || ""), normalizeAddress(q.viewer));
  if (!bundle) return json(res, 404, { error: "Draft not found" });
  if (bundle.forbidden) return json(res, 403, { error: "This draft is private." });
  return json(res, 200, bundle);
}

export async function prepareBySlug(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const bundle = await getDraftBundleBySlug(String(req.params?.slug || ""), normalizeAddress(q.viewer), true);
  if (!bundle) return json(res, 404, { error: "Prepare page not found" });
  if (bundle.forbidden) return json(res, 403, { error: "This draft is private." });
  return json(res, 200, bundle);
}

export async function draftPromotion(req, res) {
  if (!methodAllowed(req, res, ["PUT", "POST"])) return;
  const id = String(req.params?.draftId || "");
  const body = await readJson(req);
  const visibility = VISIBILITIES.has(body.visibility) ? body.visibility : undefined;
  const publish = Boolean(body.publish);
  const now = new Date().toISOString();

  const promotion = {
    missionStatement: cleanText(body.missionStatement, 5000),
    roadmap: cleanStringArray(body.roadmap, 8, 240),
    launchStrategy: cleanText(body.launchStrategy, 5000),
    telegramUrl: cleanUrl(body.telegramUrl),
    discordUrl: cleanUrl(body.discordUrl),
    xUrl: cleanUrl(body.xUrl),
    websiteUrl: cleanUrl(body.websiteUrl),
    docs: cleanStringArray(body.docs, 8, 500),
    creatorNote: cleanText(body.creatorNote, 3000),
    bannerUrl: cleanUrl(body.bannerUrl),
    shareMessage: cleanText(body.shareMessage, 500),
  };

  const pool = await getPool();
  if (pool) {
    const bundle = await getDraftBundleById(id, "");
    if (!bundle || bundle.forbidden) return json(res, 404, { error: "Draft not found" });
    await pool.query(`insert into campaign_draft_promotion
      (draft_id, mission_statement, roadmap, launch_strategy, telegram_url, discord_url, x_url, website_url, docs, creator_note, banner_url, share_message, published_at, updated_at)
      values ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,now())
      on conflict (draft_id) do update set
        mission_statement = excluded.mission_statement,
        roadmap = excluded.roadmap,
        launch_strategy = excluded.launch_strategy,
        telegram_url = excluded.telegram_url,
        discord_url = excluded.discord_url,
        x_url = excluded.x_url,
        website_url = excluded.website_url,
        docs = excluded.docs,
        creator_note = excluded.creator_note,
        banner_url = excluded.banner_url,
        share_message = excluded.share_message,
        published_at = coalesce(excluded.published_at, campaign_draft_promotion.published_at),
        updated_at = now()`, [
      id,
      promotion.missionStatement,
      JSON.stringify(promotion.roadmap),
      promotion.launchStrategy,
      promotion.telegramUrl,
      promotion.discordUrl,
      promotion.xUrl,
      promotion.websiteUrl,
      JSON.stringify(promotion.docs),
      promotion.creatorNote,
      promotion.bannerUrl,
      promotion.shareMessage,
      publish ? now : null,
    ]);
    await pool.query(`update campaign_drafts set visibility = coalesce($2, visibility), status = case when $3 then 'promotion_published' else status end, updated_at = now() where id = $1`, [id, visibility || null, publish]);
    const updated = await getDraftBundleById(id, "");
    return json(res, 200, updated);
  }

  const store = memoryStore();
  const draft = store.drafts.get(id);
  if (!draft) return json(res, 404, { error: "Draft not found" });
  const next = { ...(store.promotions.get(id) || defaultPromotion(id)), ...promotion, publishedAt: publish ? now : (store.promotions.get(id)?.publishedAt || null), updatedAt: now };
  store.promotions.set(id, next);
  if (visibility) draft.visibility = visibility;
  if (publish) draft.status = "promotion_published";
  draft.updatedAt = now;
  store.drafts.set(id, draft);
  const updated = await getDraftBundleById(id, "");
  return json(res, 200, updated);
}

export async function draftFollow(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const id = String(req.params?.draftId || "");
  const body = await readJson(req);
  const wallet = normalizeAddress(body.walletAddress || body.address);
  if (!wallet) return json(res, 400, { error: "Connect wallet to watchlist this draft." });

  const pool = await getPool();
  if (pool) {
    await pool.query("insert into campaign_draft_follows (draft_id, wallet_address) values ($1,$2) on conflict (draft_id, wallet_address) do nothing", [id, wallet]);
    const countRes = await pool.query("select count(*)::int as count from campaign_draft_follows where draft_id = $1", [id]);
    await pool.query(`insert into campaign_draft_metrics (draft_id, follows, signed_actions)
      values ($1, 1, 1)
      on conflict (draft_id) do update set follows = greatest(campaign_draft_metrics.follows, $2), signed_actions = campaign_draft_metrics.signed_actions + 1, updated_at = now()`, [id, Number(countRes.rows[0]?.count || 0)]).catch(() => {});
    return json(res, 200, { following: true, followCount: Number(countRes.rows[0]?.count || 0) });
  }

  const store = memoryStore();
  if (!store.drafts.has(id)) return json(res, 404, { error: "Draft not found" });
  const set = store.follows.get(id) || new Set();
  set.add(wallet);
  store.follows.set(id, set);
  const metrics = store.metrics.get(id) || { ...ZERO_METRICS };
  metrics.follows = set.size;
  metrics.signedActions += 1;
  store.metrics.set(id, metrics);
  return json(res, 200, { following: true, followCount: set.size });
}

export async function draftComments(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  const id = String(req.params?.draftId || "");

  if (req.method === "GET") {
    const pool = await getPool();
    if (pool) {
      const result = await pool.query("select * from campaign_draft_comments where draft_id = $1 order by created_at desc limit 50", [id]);
      return json(res, 200, { items: result.rows.map((row) => ({ id: String(row.id), draftId: String(row.draft_id), walletAddress: String(row.wallet_address), body: row.body, reactionCount: Number(row.reaction_count || 0), createdAt: row.created_at })) });
    }
    const store = memoryStore();
    return json(res, 200, { items: store.comments.get(id) || [] });
  }

  const body = await readJson(req);
  const wallet = normalizeAddress(body.walletAddress || body.address);
  const commentBody = cleanText(body.body, 800);
  if (!wallet) return json(res, 400, { error: "Connect wallet to send a transmission." });
  if (!commentBody) return json(res, 400, { error: "Transmission body is required." });

  const pool = await getPool();
  if (pool) {
    const inserted = await pool.query("insert into campaign_draft_comments (draft_id, wallet_address, body) values ($1,$2,$3) returning *", [id, wallet, commentBody]);
    await pool.query(`insert into campaign_draft_metrics (draft_id, comments, signed_actions)
      values ($1, 1, 1)
      on conflict (draft_id) do update set comments = campaign_draft_metrics.comments + 1, signed_actions = campaign_draft_metrics.signed_actions + 1, updated_at = now()`, [id]).catch(() => {});
    const row = inserted.rows[0];
    return json(res, 201, { comment: { id: String(row.id), draftId: String(row.draft_id), walletAddress: String(row.wallet_address), body: row.body, reactionCount: Number(row.reaction_count || 0), createdAt: row.created_at } });
  }

  const store = memoryStore();
  if (!store.drafts.has(id)) return json(res, 404, { error: "Draft not found" });
  const item = { id: crypto.randomUUID(), draftId: id, walletAddress: wallet, body: commentBody, reactionCount: 0, createdAt: new Date().toISOString() };
  const comments = store.comments.get(id) || [];
  comments.unshift(item);
  store.comments.set(id, comments);
  const metrics = store.metrics.get(id) || { ...ZERO_METRICS };
  metrics.comments += 1;
  metrics.signedActions += 1;
  store.metrics.set(id, metrics);
  return json(res, 201, { comment: item });
}
