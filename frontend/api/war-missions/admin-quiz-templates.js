import { pool } from "../../server/db.js";
import { requireAdmin } from "./_lib/admin-auth.js";

const FIXED_QUIZ_TEMPLATES = [
  {
    categorySlug: "recon",
    slug: "read-the-basics",
    title: "Read the Basics",
    description: "Read the MemeWarzone basics docs and pass the quiz.",
    xpReward: 250,
    metadata: { question_count: 4, passing_score: 3, cooldown_minutes: 30, fixed_quiz: true, track: "recon" },
  },
  {
    categorySlug: "recon",
    slug: "leagues-and-airdrop-briefing",
    title: "Leagues and Airdrop Briefing",
    description: "Read the leagues and airdrop docs and pass the quiz.",
    xpReward: 300,
    metadata: { question_count: 4, passing_score: 3, cooldown_minutes: 30, fixed_quiz: true, track: "recon" },
  },
  {
    categorySlug: "recon",
    slug: "fees-and-treasury-objectives",
    title: "Fees and Treasury Objectives",
    description: "Read the fees and treasury docs and pass the quiz.",
    xpReward: 300,
    metadata: { question_count: 4, passing_score: 3, cooldown_minutes: 30, fixed_quiz: true, track: "recon" },
  },
  {
    categorySlug: "recon",
    slug: "security-and-safety-recon",
    title: "Security & Safety Recon",
    description: "Read the safety rules and anti-farming docs and pass the quiz.",
    xpReward: 350,
    metadata: { question_count: 4, passing_score: 3, cooldown_minutes: 30, fixed_quiz: true, track: "recon" },
  },
  {
    categorySlug: "reinforcements",
    slug: "read-recruiter-program",
    title: "Read Recruiter Program",
    description: "Read the recruiter program docs and pass the quiz.",
    xpReward: 300,
    metadata: { question_count: 4, passing_score: 3, cooldown_minutes: 30, fixed_quiz: true, track: "reinforcements" },
  },
];

function toBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "active"].includes(normalized)) return true;
  if (["false", "0", "no", "inactive"].includes(normalized)) return false;
  return fallback;
}

function serializeTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || "",
    xpReward: Number(row.xp_reward || 0),
    active: Boolean(row.active),
    metadata: row.metadata || {},
  };
}

async function getCategoryMap() {
  const { rows } = await pool.query(
    `
      select id, slug
      from public.wm_quest_categories
      where slug = any($1::text[])
    `,
    [[...new Set(FIXED_QUIZ_TEMPLATES.map((template) => template.categorySlug))]],
  );
  return new Map(rows.map((row) => [row.slug, row.id]));
}

async function getTemplateById(id) {
  const { rows } = await pool.query(
    `
      select id, slug, title, description, xp_reward, active, metadata
      from public.wm_quest_templates
      where id = $1 and verification_type = 'docs_quiz'
      limit 1
    `,
    [id],
  );
  return rows[0] || null;
}

async function ensureFixedQuizTemplates() {
  const categoryMap = await getCategoryMap();
  const { rows: existingRows } = await pool.query(
    `
      select id, slug
      from public.wm_quest_templates
      where verification_type = 'docs_quiz' and slug = any($1::text[])
    `,
    [FIXED_QUIZ_TEMPLATES.map((template) => template.slug)],
  );
  const existing = new Set(existingRows.map((row) => row.slug));

  for (const template of FIXED_QUIZ_TEMPLATES) {
    if (existing.has(template.slug)) continue;
    const categoryId = categoryMap.get(template.categorySlug);
    if (!categoryId) {
      throw new Error(`War Missions category is missing for ${template.categorySlug}.`);
    }

    await pool.query(
      `
        insert into public.wm_quest_templates
          (category_id, slug, title, description, xp_reward, verification_type, repeatable, cooldown_seconds, active, metadata)
        values ($1, $2, $3, $4, $5, 'docs_quiz', false, $6, true, $7::jsonb)
      `,
      [
        categoryId,
        template.slug,
        template.title,
        template.description,
        template.xpReward,
        Number(template.metadata.cooldown_minutes || 30) * 60,
        JSON.stringify(template.metadata),
      ],
    );
  }
}

async function listTemplates() {
  const { rows } = await pool.query(
    `
      select id, slug, title, description, xp_reward, active, metadata
      from public.wm_quest_templates
      where verification_type = 'docs_quiz'
      order by created_at asc, title asc
    `,
  );

  const orderMap = new Map(FIXED_QUIZ_TEMPLATES.map((template, index) => [template.slug, index]));
  return rows
    .map(serializeTemplate)
    .sort((left, right) => {
      const leftOrder = orderMap.has(left.slug) ? orderMap.get(left.slug) : Number.MAX_SAFE_INTEGER;
      const rightOrder = orderMap.has(right.slug) ? orderMap.get(right.slug) : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.title.localeCompare(right.title);
    });
}

async function updateTemplate(body) {
  const id = String(body.id || body.templateId || body.template_id || "").trim();
  if (!id) throw new Error("templateId is required.");

  const current = await getTemplateById(id);
  if (!current) throw new Error("Quiz template was not found.");

  const nextTitle = String(body.title == null ? current.title : body.title || "").trim();
  const nextDescription = String(body.description == null ? current.description || "" : body.description || "").trim();
  if (!nextTitle) throw new Error("title is required.");

  const metadataPatch = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const { rows } = await pool.query(
    `
      update public.wm_quest_templates
      set
        title = $2,
        description = $3,
        active = $4,
        metadata = coalesce(metadata, '{}'::jsonb) || $5::jsonb
      where id = $1 and verification_type = 'docs_quiz'
      returning id, slug, title, description, xp_reward, active, metadata
    `,
    [
      current.id,
      nextTitle,
      nextDescription,
      body.active == null ? current.active : toBoolean(body.active, current.active),
      JSON.stringify({ ...metadataPatch, admin_updated: true }),
    ],
  );
  return serializeTemplate(rows[0] || current);
}

export default async function wmAdminQuizTemplates(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    await ensureFixedQuizTemplates();

    if (req.method === "GET") {
      const templates = await listTemplates();
      return res.status(200).json({ ok: true, admin, templates });
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      const template = await updateTemplate(req.body || {});
      return res.status(200).json({ ok: true, admin, template });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    const message = error?.message || "Unexpected server error.";
    const status = /required|must|not found|missing/i.test(message) ? 400 : 500;
    console.error("[war-missions/admin-quiz-templates] failed", error);
    return res.status(status).json({ ok: false, error: message });
  }
}
