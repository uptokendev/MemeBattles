import { pool } from "../../server/db.js";
import { requireAdmin } from "./_lib/admin-auth.js";
import { writeAdminAuditLog } from "./_lib/admin-audit.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeQuestion(row) {
  return {
    id: row.id,
    questTemplateId: row.quest_template_id,
    prompt: row.prompt || row.question || row.question_text || row.title || "Quiz question",
    type: row.question_type || row.type || "multiple_choice",
    options: row.options || row.choices || [],
    correctAnswer: row.correct_answer ?? row.correctAnswer ?? null,
    explanation: row.explanation || null,
    displayOrder: toNumber(row.display_order),
    active: row.active !== false,
    metadata: row.metadata || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function resolveTemplateId(bodyOrQuery) {
  if (bodyOrQuery.questTemplateId) return bodyOrQuery.questTemplateId;
  if (bodyOrQuery.quest_template_id) return bodyOrQuery.quest_template_id;

  const slug = String(bodyOrQuery.questSlug || bodyOrQuery.templateSlug || "").trim();
  if (!slug) return null;

  const { rows } = await pool.query(
    `select id from public.wm_quest_templates where slug = $1 limit 1`,
    [slug],
  );
  return rows[0]?.id || null;
}

async function listQuestions(req) {
  const templateId = await resolveTemplateId(req.query || {});
  const params = [];
  let where = "where coalesce(active, true) = true";
  if (templateId) {
    params.push(templateId);
    where += ` and quest_template_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `
      select *
      from public.wm_quiz_questions
      ${where}
      order by display_order asc nulls last, created_at asc nulls last, id asc
    `,
    params,
  );
  return rows.map(normalizeQuestion);
}

async function upsertQuestion(body) {
  const templateId = await resolveTemplateId(body || {});
  if (!templateId) throw new Error("questTemplateId or questSlug is required.");

  const prompt = String(body.prompt || body.question || body.questionText || "").trim();
  if (!prompt) throw new Error("Question prompt is required.");

  const payload = {
    quest_template_id: templateId,
    prompt,
    question_type: String(body.type || body.questionType || "multiple_choice").trim() || "multiple_choice",
    options: Array.isArray(body.options) ? body.options : Array.isArray(body.choices) ? body.choices : [],
    correct_answer: body.correctAnswer ?? body.correct_answer ?? body.answer ?? null,
    explanation: body.explanation || null,
    display_order: toNumber(body.displayOrder ?? body.display_order, 0),
    active: body.active !== false,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };

  if (body.id) {
    const { rows } = await pool.query(
      `
        update public.wm_quiz_questions
        set quest_template_id = $2,
            prompt = $3,
            question_type = $4,
            options = $5::jsonb,
            correct_answer = $6,
            explanation = $7,
            display_order = $8,
            active = $9,
            metadata = $10::jsonb,
            updated_at = now()
        where id = $1
        returning *
      `,
      [body.id, payload.quest_template_id, payload.prompt, payload.question_type, JSON.stringify(payload.options), payload.correct_answer, payload.explanation, payload.display_order, payload.active, JSON.stringify(payload.metadata)],
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `
      insert into public.wm_quiz_questions
        (quest_template_id, prompt, question_type, options, correct_answer, explanation, display_order, active, metadata)
      values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9::jsonb)
      returning *
    `,
    [payload.quest_template_id, payload.prompt, payload.question_type, JSON.stringify(payload.options), payload.correct_answer, payload.explanation, payload.display_order, payload.active, JSON.stringify(payload.metadata)],
  );
  return rows[0];
}

async function deleteQuestion(bodyOrQuery) {
  const id = bodyOrQuery.id;
  if (!id) throw new Error("Question id is required.");

  const { rows } = await pool.query(
    `update public.wm_quiz_questions set active = false, updated_at = now() where id = $1 returning *`,
    [id],
  );
  return rows[0] || null;
}

export default async function wmAdminQuizQuestions(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const questions = await listQuestions(req);
      return res.status(200).json({ ok: true, questions });
    }

    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      const row = await upsertQuestion(req.body || {});
      await writeAdminAuditLog({
        adminUserId: admin.username || null,
        action: "quiz_question.upsert",
        targetType: "wm_quiz_question",
        targetId: row?.id || null,
        after: row,
      });
      return res.status(200).json({ ok: true, question: normalizeQuestion(row) });
    }

    if (req.method === "DELETE") {
      const row = await deleteQuestion({ ...(req.query || {}), ...(req.body || {}) });
      await writeAdminAuditLog({
        adminUserId: admin.username || null,
        action: "quiz_question.delete",
        targetType: "wm_quiz_question",
        targetId: row?.id || req.query?.id || req.body?.id || null,
        after: row,
      });
      return res.status(200).json({ ok: true, question: row ? normalizeQuestion(row) : null });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (error) {
    console.error("[war-missions/admin-quiz-questions] failed", error);
    return res.status(500).json({ ok: false, error: error?.message || "Unexpected server error." });
  }
}
