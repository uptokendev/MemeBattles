import { pool } from "../../server/db.js";
import { requireAdmin } from "./_lib/admin-auth.js";
import { writeAdminAuditLog } from "./_lib/admin-audit.js";

async function upsertCategory(body) {
  const payload = {
    slug: String(body.slug || "").trim(),
    title: String(body.title || "").trim(),
    description: body.description || null,
    display_order: Number(body.displayOrder || 0),
    active: body.active !== false,
  };
  if (!payload.slug || !payload.title) throw new Error("Category slug and title are required.");

  if (body.id) {
    const { rows } = await pool.query(
      `update public.wm_quest_categories set slug=$2,title=$3,description=$4,display_order=$5,active=$6 where id=$1 returning *`,
      [body.id, payload.slug, payload.title, payload.description, payload.display_order, payload.active],
    );
    return rows[0];
  }

  const existing = await pool.query(`select * from public.wm_quest_categories where slug = $1 limit 1`, [payload.slug]);
  if (existing.rows[0]) {
    const { rows } = await pool.query(
      `update public.wm_quest_categories set title=$2,description=$3,display_order=$4,active=$5 where id=$1 returning *`,
      [existing.rows[0].id, payload.title, payload.description, payload.display_order, payload.active],
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `insert into public.wm_quest_categories (slug,title,description,display_order,active) values ($1,$2,$3,$4,$5) returning *`,
    [payload.slug, payload.title, payload.description, payload.display_order, payload.active],
  );
  return rows[0];
}

async function upsertTemplate(body) {
  const categorySlug = String(body.categorySlug || "").trim();
  const categoryResult = await pool.query(`select id from public.wm_quest_categories where slug = $1 limit 1`, [categorySlug]);
  const category = categoryResult.rows[0];
  if (!category) throw new Error("Category was not found.");

  const payload = {
    category_id: category.id,
    slug: String(body.slug || "").trim(),
    title: String(body.title || "").trim(),
    description: body.description || null,
    xp_reward: Number(body.xpReward || 0),
    verification_type: String(body.verificationType || "").trim(),
    repeatable: Boolean(body.repeatable),
    max_completions_per_day: body.maxCompletionsPerDay ?? null,
    max_completions_per_week: body.maxCompletionsPerWeek ?? null,
    cooldown_seconds: body.cooldownSeconds ?? null,
    active: body.active !== false,
    metadata: body.metadata || {},
  };
  if (!payload.slug || !payload.title || !payload.verification_type) throw new Error("Template slug, title, and verificationType are required.");

  if (body.id) {
    const { rows } = await pool.query(
      `update public.wm_quest_templates set category_id=$2,slug=$3,title=$4,description=$5,xp_reward=$6,verification_type=$7,repeatable=$8,max_completions_per_day=$9,max_completions_per_week=$10,cooldown_seconds=$11,active=$12,metadata=$13::jsonb where id=$1 returning *`,
      [body.id, payload.category_id, payload.slug, payload.title, payload.description, payload.xp_reward, payload.verification_type, payload.repeatable, payload.max_completions_per_day, payload.max_completions_per_week, payload.cooldown_seconds, payload.active, JSON.stringify(payload.metadata)],
    );
    return rows[0];
  }

  const existing = await pool.query(`select * from public.wm_quest_templates where slug = $1 limit 1`, [payload.slug]);
  if (existing.rows[0]) {
    const { rows } = await pool.query(
      `update public.wm_quest_templates set category_id=$2,title=$3,description=$4,xp_reward=$5,verification_type=$6,repeatable=$7,max_completions_per_day=$8,max_completions_per_week=$9,cooldown_seconds=$10,active=$11,metadata=$12::jsonb where id=$1 returning *`,
      [existing.rows[0].id, payload.category_id, payload.title, payload.description, payload.xp_reward, payload.verification_type, payload.repeatable, payload.max_completions_per_day, payload.max_completions_per_week, payload.cooldown_seconds, payload.active, JSON.stringify(payload.metadata)],
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `insert into public.wm_quest_templates (category_id,slug,title,description,xp_reward,verification_type,repeatable,max_completions_per_day,max_completions_per_week,cooldown_seconds,active,metadata) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) returning *`,
    [payload.category_id, payload.slug, payload.title, payload.description, payload.xp_reward, payload.verification_type, payload.repeatable, payload.max_completions_per_day, payload.max_completions_per_week, payload.cooldown_seconds, payload.active, JSON.stringify(payload.metadata)],
  );
  return rows[0];
}

async function upsertInstance(body) {
  const templateSlug = String(body.slug || "").trim();
  const templateResult = await pool.query(`select id,xp_reward,metadata from public.wm_quest_templates where slug = $1 limit 1`, [templateSlug]);
  const template = templateResult.rows[0];
  if (!template) throw new Error("Template was not found.");

  const payload = {
    quest_template_id: template.id,
    period_type: body.periodType || "once",
    xp_reward: Number(body.xpReward || template.xp_reward || 0),
    active: body.active !== false,
    metadata: body.metadata || template.metadata || {},
  };

  if (body.id) {
    const { rows } = await pool.query(
      `update public.wm_quest_instances set quest_template_id=$2,period_type=$3,xp_reward=$4,active=$5,metadata=$6::jsonb where id=$1 returning *`,
      [body.id, payload.quest_template_id, payload.period_type, payload.xp_reward, payload.active, JSON.stringify(payload.metadata)],
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `insert into public.wm_quest_instances (quest_template_id,period_type,xp_reward,active,metadata) values ($1,$2,$3,$4,$5::jsonb) returning *`,
    [payload.quest_template_id, payload.period_type, payload.xp_reward, payload.active, JSON.stringify(payload.metadata)],
  );
  return rows[0];
}

export default async function wmAdminQuestUpsert(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    const entity = String(req.body?.entity || "template").trim();
    if (entity !== "category" && entity !== "template" && entity !== "instance") {
      return res.status(400).json({ error: "Unsupported entity." });
    }

    const result = entity === "category"
      ? await upsertCategory(req.body || {})
      : entity === "template"
        ? await upsertTemplate(req.body || {})
        : await upsertInstance(req.body || {});

    await writeAdminAuditLog({
      adminUserId: admin.username || null,
      action: `${entity}.upsert`,
      targetType: `wm_quest_${entity}`,
      targetId: result?.id || null,
      after: result,
    }).catch(() => undefined);

    return res.status(200).json({ ok: true, entity, row: result });
  } catch (error) {
    console.error("[war-missions/admin-quest-upsert] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
