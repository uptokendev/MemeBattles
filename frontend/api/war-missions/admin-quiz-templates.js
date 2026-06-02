import { pool } from "../../server/db.js";
import { requireAdmin } from "./_lib/admin-auth.js";
import { writeAdminAuditLog } from "./_lib/admin-audit.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTemplate(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || null,
    xpReward: toNumber(row.xp_reward),
    verificationType: row.verification_type,
    active: row.active !== false,
    metadata: row.metadata || {},
    questionCount: toNumber(row.question_count),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function listTemplates(req) {
  const activeOnly = req.query?.activeOnly !== "false";
  const { rows } = await pool.query(
    `
      select
        qt.*,
        count(qq.id) as question_count
      from public.wm_quest_templates qt
      left join public.wm_quiz_questions qq on qq.quest_template_id = qt.id
      where (qt.verification_type = 'quiz' or qt.metadata->>'type' = 'quiz' or qt.metadata->'quiz' is not null)
        and ($1::boolean = false or qt.active = true)
      group by qt.id
      order by qt.updated_at desc nulls last, qt.created_at desc nulls last, qt.slug asc
    `,
    [activeOnly],
  );
  return rows.map(normalizeTemplate);
}

async function upsertTemplate(body) {
  const slug = String(body.slug || "").trim();
  const title = String(body.title || "").trim();
  if (!slug || !title) throw new Error("Template slug and title are required.");

  const payload = {
    slug,
    title,
    description: body.description || null,
    xp_reward: toNumber(body.xpReward ?? body.xp_reward, 0),
    verification_type: "quiz",
    repeatable: Boolean(body.repeatable),
    active: body.active !== false,
    metadata: {
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
      type: "quiz",
      quiz: body.quiz && typeof body.quiz === "object" ? body.quiz : body.metadata?.quiz || {},
    },
  };

  if (body.id) {
    const { rows } = await pool.query(
      `
        update public.wm_quest_templates
        set slug = $2,
            title = $3,
            description = $4,
            xp_reward = $5,
            verification_type = $6,
            repeatable = $7,
            active = $8,
            metadata = $9::jsonb,
            updated_at = now()
        where id = $1
        returning *
      `,
      [body.id, payload.slug, payload.title, payload.description, payload.xp_reward, payload.verification_type, payload.repeatable, payload.active, JSON.stringify(payload.metadata)],
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `
      insert into public.wm_quest_templates
        (slug, title, description, xp_reward, verification_type, repeatable, active, metadata)
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      on conflict (slug) do update
        set title = excluded.title,
            description = excluded.description,
            xp_reward = excluded.xp_reward,
            verification_type = excluded.verification_type,
            repeatable = excluded.repeatable,
            active = excluded.active,
            metadata = excluded.metadata,
            updated_at = now()
      returning *
    `,
    [payload.slug, payload.title, payload.description, payload.xp_reward, payload.verification_type, payload.repeatable, payload.active, JSON.stringify(payload.metadata)],
  );
  return rows[0];
}

export default async function wmAdminQuizTemplates(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const templates = await listTemplates(req);
      return res.status(200).json({ ok: true, templates });
    }

    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      const row = await upsertTemplate(req.body || {});
      await writeAdminAuditLog({
        adminUserId: admin.username || null,
        action: "quiz_template.upsert",
        targetType: "wm_quest_template",
        targetId: row?.id || null,
        after: row,
      });
      return res.status(200).json({ ok: true, template: normalizeTemplate(row) });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (error) {
    console.error("[war-missions/admin-quiz-templates] failed", error);
    return res.status(500).json({ ok: false, error: error?.message || "Unexpected server error." });
  }
}
