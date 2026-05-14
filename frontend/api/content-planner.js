import { pool } from "../server/db.js";

const PLATFORMS = new Set(["x", "instagram", "threads", "tiktok", "article", "website"]);
const POST_STATUSES = new Set(["idea", "draft", "ready", "scheduled", "published", "archived"]);
const VARIANT_STATUSES = new Set(["draft", "ready", "scheduled", "published", "failed", "archived"]);
const SCHEDULE_STATUSES = new Set(["scheduled", "posted", "missed", "cancelled", "failed"]);

function sendError(res, status, error, details) {
  return res.status(status).json({ ok: false, error, details });
}

function cleanString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanNullableString(value) {
  if (value == null) return null;
  const text = cleanString(value);
  return text || null;
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function cleanJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

async function defaultWorkspaceId() {
  const existing = await pool.query("SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1");
  if (existing.rows?.[0]?.id) return existing.rows[0].id;

  const created = await pool.query("INSERT INTO workspaces (name) VALUES ('Warzone Content Studio') RETURNING id");
  return created.rows[0].id;
}

export async function contentPlannerPosts(req, res) {
  if (req.method === "GET") {
    const status = cleanString(req.query?.status || "") || null;
    const result = await pool.query(
      `SELECT p.*, c.name AS campaign_name,
        COALESCE(json_agg(v.* ORDER BY v.platform) FILTER (WHERE v.id IS NOT NULL), '[]') AS variants
       FROM content_posts p
       LEFT JOIN content_campaigns c ON c.id = p.campaign_id
       LEFT JOIN content_post_variants v ON v.post_id = p.id
       WHERE ($1::text IS NULL OR p.status = $1)
       GROUP BY p.id, c.name
       ORDER BY p.updated_at DESC`,
      [status]
    );
    return res.json({ ok: true, items: result.rows });
  }

  if (req.method === "POST") {
    const title = cleanString(req.body?.title);
    if (!title) return sendError(res, 400, "title is required");

    const workspaceId = cleanString(req.body?.workspaceId) || await defaultWorkspaceId();
    const status = POST_STATUSES.has(req.body?.status) ? req.body.status : "draft";

    const result = await pool.query(
      `INSERT INTO content_posts (
        workspace_id, campaign_id, title, status, base_content_json, base_content_text,
        internal_notes, topic, goal, target_audience
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        workspaceId,
        cleanNullableString(req.body?.campaignId),
        title,
        status,
        cleanJson(req.body?.baseContentJson),
        cleanString(req.body?.baseContentText),
        cleanNullableString(req.body?.internalNotes),
        cleanNullableString(req.body?.topic),
        cleanNullableString(req.body?.goal),
        cleanNullableString(req.body?.targetAudience),
      ]
    );

    return res.status(201).json({ ok: true, item: result.rows[0] });
  }

  return sendError(res, 405, "Method not allowed");
}

export async function contentPlannerPostById(req, res) {
  const { id } = req.params;

  if (req.method === "GET") {
    const post = await pool.query("SELECT * FROM content_posts WHERE id = $1", [id]);
    if (!post.rows[0]) return sendError(res, 404, "Post not found");

    const variants = await pool.query("SELECT * FROM content_post_variants WHERE post_id = $1 ORDER BY platform ASC", [id]);
    const schedules = await pool.query(
      `SELECT s.*, v.platform, v.content_text, v.headline
       FROM content_schedules s
       JOIN content_post_variants v ON v.id = s.variant_id
       WHERE v.post_id = $1
       ORDER BY s.scheduled_at ASC`,
      [id]
    );

    return res.json({ ok: true, item: post.rows[0], variants: variants.rows, schedules: schedules.rows });
  }

  if (req.method === "PATCH") {
    const status = req.body?.status == null ? null : POST_STATUSES.has(req.body.status) ? req.body.status : null;
    const result = await pool.query(
      `UPDATE content_posts SET
        campaign_id = COALESCE($2, campaign_id),
        title = COALESCE($3, title),
        status = COALESCE($4, status),
        base_content_json = COALESCE($5, base_content_json),
        base_content_text = COALESCE($6, base_content_text),
        internal_notes = COALESCE($7, internal_notes),
        topic = COALESCE($8, topic),
        goal = COALESCE($9, goal),
        target_audience = COALESCE($10, target_audience),
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        cleanNullableString(req.body?.campaignId),
        cleanNullableString(req.body?.title),
        status,
        req.body?.baseContentJson ? cleanJson(req.body.baseContentJson) : null,
        req.body?.baseContentText == null ? null : cleanString(req.body.baseContentText),
        cleanNullableString(req.body?.internalNotes),
        cleanNullableString(req.body?.topic),
        cleanNullableString(req.body?.goal),
        cleanNullableString(req.body?.targetAudience),
      ]
    );
    if (!result.rows[0]) return sendError(res, 404, "Post not found");
    return res.json({ ok: true, item: result.rows[0] });
  }

  if (req.method === "DELETE") {
    const result = await pool.query("DELETE FROM content_posts WHERE id = $1 RETURNING id", [id]);
    if (!result.rows[0]) return sendError(res, 404, "Post not found");
    return res.json({ ok: true, deletedId: result.rows[0].id });
  }

  return sendError(res, 405, "Method not allowed");
}

export async function contentPlannerPostVariants(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed");

  const { id } = req.params;
  const platform = cleanString(req.body?.platform);
  if (!PLATFORMS.has(platform)) return sendError(res, 400, "Invalid platform");

  const status = VARIANT_STATUSES.has(req.body?.status) ? req.body.status : "draft";
  const result = await pool.query(
    `INSERT INTO content_post_variants (
      post_id, platform, status, content_json, content_text, headline, caption, hook,
      call_to_action, hashtags, article_slug, article_excerpt, article_cover_url, platform_meta
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (post_id, platform) DO UPDATE SET
      status = EXCLUDED.status,
      content_json = EXCLUDED.content_json,
      content_text = EXCLUDED.content_text,
      headline = EXCLUDED.headline,
      caption = EXCLUDED.caption,
      hook = EXCLUDED.hook,
      call_to_action = EXCLUDED.call_to_action,
      hashtags = EXCLUDED.hashtags,
      article_slug = EXCLUDED.article_slug,
      article_excerpt = EXCLUDED.article_excerpt,
      article_cover_url = EXCLUDED.article_cover_url,
      platform_meta = EXCLUDED.platform_meta,
      updated_at = NOW()
     RETURNING *`,
    [
      id,
      platform,
      status,
      cleanJson(req.body?.contentJson),
      cleanString(req.body?.contentText),
      cleanNullableString(req.body?.headline),
      cleanNullableString(req.body?.caption),
      cleanNullableString(req.body?.hook),
      cleanNullableString(req.body?.callToAction),
      cleanArray(req.body?.hashtags),
      cleanNullableString(req.body?.articleSlug),
      cleanNullableString(req.body?.articleExcerpt),
      cleanNullableString(req.body?.articleCoverUrl),
      cleanJson(req.body?.platformMeta),
    ]
  );

  return res.status(201).json({ ok: true, item: result.rows[0] });
}

export async function contentPlannerVariantById(req, res) {
  if (req.method !== "PATCH") return sendError(res, 405, "Method not allowed");

  const { id } = req.params;
  const status = req.body?.status == null ? null : VARIANT_STATUSES.has(req.body.status) ? req.body.status : null;

  const result = await pool.query(
    `UPDATE content_post_variants SET
      status = COALESCE($2, status),
      content_json = COALESCE($3, content_json),
      content_text = COALESCE($4, content_text),
      headline = COALESCE($5, headline),
      caption = COALESCE($6, caption),
      hook = COALESCE($7, hook),
      call_to_action = COALESCE($8, call_to_action),
      hashtags = COALESCE($9, hashtags),
      article_slug = COALESCE($10, article_slug),
      article_excerpt = COALESCE($11, article_excerpt),
      article_cover_url = COALESCE($12, article_cover_url),
      platform_meta = COALESCE($13, platform_meta),
      updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      status,
      req.body?.contentJson ? cleanJson(req.body.contentJson) : null,
      req.body?.contentText == null ? null : cleanString(req.body.contentText),
      cleanNullableString(req.body?.headline),
      cleanNullableString(req.body?.caption),
      cleanNullableString(req.body?.hook),
      cleanNullableString(req.body?.callToAction),
      Array.isArray(req.body?.hashtags) ? cleanArray(req.body.hashtags) : null,
      cleanNullableString(req.body?.articleSlug),
      cleanNullableString(req.body?.articleExcerpt),
      cleanNullableString(req.body?.articleCoverUrl),
      req.body?.platformMeta ? cleanJson(req.body.platformMeta) : null,
    ]
  );

  if (!result.rows[0]) return sendError(res, 404, "Variant not found");
  return res.json({ ok: true, item: result.rows[0] });
}

export async function contentPlannerVariantSchedule(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed");

  const { variantId } = req.params;
  const scheduledAt = cleanString(req.body?.scheduledAt);
  if (!scheduledAt) return sendError(res, 400, "scheduledAt is required");

  const status = SCHEDULE_STATUSES.has(req.body?.status) ? req.body.status : "scheduled";
  const result = await pool.query(
    `INSERT INTO content_schedules (variant_id, scheduled_at, timezone, status, published_at, published_url, publish_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      variantId,
      scheduledAt,
      cleanString(req.body?.timezone, "Europe/Amsterdam") || "Europe/Amsterdam",
      status,
      cleanNullableString(req.body?.publishedAt),
      cleanNullableString(req.body?.publishedUrl),
      cleanNullableString(req.body?.publishNotes),
    ]
  );

  await pool.query("UPDATE content_post_variants SET status = 'scheduled', updated_at = NOW() WHERE id = $1 AND status <> 'published'", [variantId]);
  return res.status(201).json({ ok: true, item: result.rows[0] });
}

export async function contentPlannerCalendar(req, res) {
  if (req.method !== "GET") return sendError(res, 405, "Method not allowed");

  const from = cleanString(req.query?.from) || new Date(Date.now() - 30 * 86400000).toISOString();
  const to = cleanString(req.query?.to) || new Date(Date.now() + 90 * 86400000).toISOString();

  const result = await pool.query(
    `SELECT
      s.*,
      v.platform,
      v.status AS variant_status,
      v.content_text,
      v.headline,
      p.id AS post_id,
      p.title AS post_title,
      p.status AS post_status,
      c.name AS campaign_name
     FROM content_schedules s
     JOIN content_post_variants v ON v.id = s.variant_id
     JOIN content_posts p ON p.id = v.post_id
     LEFT JOIN content_campaigns c ON c.id = p.campaign_id
     WHERE s.scheduled_at >= $1 AND s.scheduled_at <= $2
     ORDER BY s.scheduled_at ASC`,
    [from, to]
  );

  return res.json({ ok: true, items: result.rows });
}

export async function contentPlannerSchedulesById(req, res) {
  if (req.method !== "PATCH") return sendError(res, 405, "Method not allowed");

  const { id } = req.params;
  const status = req.body?.status == null ? null : SCHEDULE_STATUSES.has(req.body.status) ? req.body.status : null;
  const result = await pool.query(
    `UPDATE content_schedules SET
      scheduled_at = COALESCE($2, scheduled_at),
      timezone = COALESCE($3, timezone),
      status = COALESCE($4, status),
      published_at = COALESCE($5, published_at),
      published_url = COALESCE($6, published_url),
      publish_notes = COALESCE($7, publish_notes),
      updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      cleanNullableString(req.body?.scheduledAt),
      cleanNullableString(req.body?.timezone),
      status,
      cleanNullableString(req.body?.publishedAt),
      cleanNullableString(req.body?.publishedUrl),
      cleanNullableString(req.body?.publishNotes),
    ]
  );

  if (!result.rows[0]) return sendError(res, 404, "Schedule not found");
  return res.json({ ok: true, item: result.rows[0] });
}

export async function contentPlannerCampaigns(req, res) {
  if (req.method === "GET") {
    const result = await pool.query("SELECT * FROM content_campaigns ORDER BY updated_at DESC");
    return res.json({ ok: true, items: result.rows });
  }

  if (req.method === "POST") {
    const name = cleanString(req.body?.name);
    if (!name) return sendError(res, 400, "name is required");
    const workspaceId = cleanString(req.body?.workspaceId) || await defaultWorkspaceId();
    const result = await pool.query(
      `INSERT INTO content_campaigns (workspace_id, name, description, status, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [workspaceId, name, cleanNullableString(req.body?.description), req.body?.status || "active", cleanNullableString(req.body?.startsAt), cleanNullableString(req.body?.endsAt)]
    );
    return res.status(201).json({ ok: true, item: result.rows[0] });
  }

  return sendError(res, 405, "Method not allowed");
}

export async function contentPlannerCampaignById(req, res) {
  if (req.method !== "PATCH") return sendError(res, 405, "Method not allowed");
  const { id } = req.params;
  const result = await pool.query(
    `UPDATE content_campaigns SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      status = COALESCE($4, status),
      starts_at = COALESCE($5, starts_at),
      ends_at = COALESCE($6, ends_at),
      updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, cleanNullableString(req.body?.name), cleanNullableString(req.body?.description), cleanNullableString(req.body?.status), cleanNullableString(req.body?.startsAt), cleanNullableString(req.body?.endsAt)]
  );
  if (!result.rows[0]) return sendError(res, 404, "Campaign not found");
  return res.json({ ok: true, item: result.rows[0] });
}

export async function contentPlannerTags(req, res) {
  if (req.method === "GET") {
    const result = await pool.query("SELECT * FROM content_tags ORDER BY name ASC");
    return res.json({ ok: true, items: result.rows });
  }

  if (req.method === "POST") {
    const name = cleanString(req.body?.name);
    if (!name) return sendError(res, 400, "name is required");
    const workspaceId = cleanString(req.body?.workspaceId) || await defaultWorkspaceId();
    const result = await pool.query(
      `INSERT INTO content_tags (workspace_id, name)
       VALUES ($1, $2)
       ON CONFLICT (workspace_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [workspaceId, name]
    );
    return res.status(201).json({ ok: true, item: result.rows[0] });
  }

  return sendError(res, 405, "Method not allowed");
}
