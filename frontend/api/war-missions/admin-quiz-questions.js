import { pool } from "../../server/db.js";
import { requireAdmin } from "./_lib/admin-auth.js";

function normalizeAnswer(value, index) {
  const answer = value && typeof value === "object" ? value : {};
  const key = String(answer.key || String.fromCharCode(97 + index)).trim().toLowerCase();
  const text = String(answer.text || "").trim();
  return { key, text };
}

function normalizeAnswers(raw) {
  const answers = Array.isArray(raw) ? raw.map(normalizeAnswer).filter((answer) => answer.key && answer.text) : [];
  const keys = new Set();
  for (const answer of answers) {
    if (keys.has(answer.key)) throw new Error("Answer keys must be unique.");
    keys.add(answer.key);
  }
  return answers;
}

function toBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "active"].includes(normalized)) return true;
  if (["false", "0", "no", "inactive"].includes(normalized)) return false;
  return fallback;
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

async function listQuizTemplates() {
  const { rows } = await pool.query(
    `
      select id, slug, title, metadata
      from public.wm_quest_templates
      where verification_type = 'docs_quiz' and active = true
      order by created_at asc
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    metadata: row.metadata || {},
  }));
}

async function getTemplateBySlug(slug) {
  const { rows } = await pool.query(
    `
      select id, slug, title, metadata
      from public.wm_quest_templates
      where slug = $1 and verification_type = 'docs_quiz'
      limit 1
    `,
    [slug],
  );
  return rows[0] || null;
}

async function listQuestions({ questSlug = null, includeInactive = false }) {
  const params = [];
  const filters = ["qt.verification_type = 'docs_quiz'"];
  if (questSlug) {
    params.push(questSlug);
    filters.push(`qt.slug = $${params.length}`);
  }
  if (!includeInactive) filters.push("qq.active = true");

  const { rows } = await pool.query(
    `
      select
        qq.id,
        qq.quest_template_id,
        coalesce(qq.prompt, qq.question) as prompt,
        qq.answers,
        coalesce(qq.correct_answer_key, qq.correct_answer) as correct_answer_key,
        qq.correct_answer,
        qq.explanation,
        qq.active,
        qq.display_order,
        qq.metadata,
        qq.created_at,
        qq.updated_at,
        qt.slug as quest_slug,
        qt.title as quest_title
      from public.wm_quiz_questions qq
      join public.wm_quest_templates qt on qt.id = qq.quest_template_id
      where ${filters.join(" and ")}
      order by qt.slug asc, qq.display_order asc, qq.created_at asc
    `,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    questTemplateId: row.quest_template_id,
    questSlug: row.quest_slug,
    questTitle: row.quest_title,
    prompt: row.prompt,
    answers: row.answers || [],
    correctAnswerKey: row.correct_answer_key,
    explanation: row.explanation || "",
    active: Boolean(row.active),
    displayOrder: Number(row.display_order || 0),
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function validateQuestionInput(body, { partial = false } = {}) {
  const prompt = body.prompt == null ? null : String(body.prompt || "").trim();
  const answers = body.answers == null ? null : normalizeAnswers(body.answers);
  const correctAnswerKey = body.correctAnswerKey == null && body.correct_answer_key == null
    ? null
    : String(body.correctAnswerKey || body.correct_answer_key || "").trim().toLowerCase();

  if (!partial || prompt != null) {
    if (!prompt) throw new Error("prompt is required.");
  }
  if (!partial || answers != null) {
    if (!answers || answers.length < 2) throw new Error("At least two answers are required.");
  }
  if (!partial || correctAnswerKey != null) {
    if (!correctAnswerKey) throw new Error("correctAnswerKey is required.");
    if (answers && !answers.some((answer) => answer.key === correctAnswerKey)) {
      throw new Error("correctAnswerKey must match one of the answer keys.");
    }
  }

  return { prompt, answers, correctAnswerKey };
}

async function createQuestion(body) {
  const questSlug = String(body.questSlug || body.quest_slug || "").trim();
  if (!questSlug) throw new Error("questSlug is required.");
  const template = await getTemplateBySlug(questSlug);
  if (!template) throw new Error("Quiz quest template was not found.");

  const input = validateQuestionInput(body);
  const explanation = body.explanation == null ? null : String(body.explanation || "").trim();
  const displayOrder = toInt(body.displayOrder ?? body.display_order, 0);
  const active = toBoolean(body.active, true);
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

  const { rows } = await pool.query(
    `
      insert into public.wm_quiz_questions
        (quest_template_id, prompt, question, answers, correct_answer_key, correct_answer, explanation, active, display_order, metadata, updated_at)
      values ($1, $2, $2, $3::jsonb, $4, $4, $5, $6, $7, $8::jsonb, now())
      returning *
    `,
    [
      template.id,
      input.prompt,
      JSON.stringify(input.answers),
      input.correctAnswerKey,
      explanation,
      active,
      displayOrder,
      JSON.stringify({ ...metadata, admin_created: true }),
    ],
  );
  return rows[0] || null;
}

async function updateQuestion(body) {
  const id = String(body.id || body.questionId || body.question_id || "").trim();
  if (!id) throw new Error("id is required.");

  const currentResult = await pool.query(`select * from public.wm_quiz_questions where id = $1 limit 1`, [id]);
  const current = currentResult.rows[0];
  if (!current) throw new Error("Quiz question was not found.");

  const input = validateQuestionInput(body, { partial: true });
  const nextAnswers = input.answers || current.answers || [];
  const nextCorrectKey = input.correctAnswerKey || current.correct_answer_key || current.correct_answer;
  if (!nextAnswers.some((answer) => answer.key === nextCorrectKey)) {
    throw new Error("correctAnswerKey must match one of the answer keys.");
  }

  let questTemplateId = current.quest_template_id;
  const questSlug = String(body.questSlug || body.quest_slug || "").trim();
  if (questSlug) {
    const template = await getTemplateBySlug(questSlug);
    if (!template) throw new Error("Quiz quest template was not found.");
    questTemplateId = template.id;
  }

  const metadataPatch = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const nextPrompt = input.prompt || current.prompt || current.question;
  const { rows } = await pool.query(
    `
      update public.wm_quiz_questions
      set
        quest_template_id = $2,
        prompt = $3,
        question = $3,
        answers = $4::jsonb,
        correct_answer_key = $5,
        correct_answer = $5,
        explanation = $6,
        active = $7,
        display_order = $8,
        metadata = coalesce(metadata, '{}'::jsonb) || $9::jsonb,
        updated_at = now()
      where id = $1
      returning *
    `,
    [
      id,
      questTemplateId,
      nextPrompt,
      JSON.stringify(nextAnswers),
      nextCorrectKey,
      body.explanation == null ? current.explanation : String(body.explanation || "").trim(),
      body.active == null ? current.active : toBoolean(body.active, current.active),
      body.displayOrder == null && body.display_order == null ? current.display_order : toInt(body.displayOrder ?? body.display_order, current.display_order),
      JSON.stringify({ ...metadataPatch, admin_updated: true }),
    ],
  );
  return rows[0] || null;
}

async function deleteQuestion(body) {
  const id = String(body.id || body.questionId || body.question_id || "").trim();
  if (!id) throw new Error("id is required.");
  const hardDelete = toBoolean(body.hardDelete || body.hard_delete, false);
  if (hardDelete) {
    const { rows } = await pool.query(`delete from public.wm_quiz_questions where id = $1 returning *`, [id]);
    return rows[0] || null;
  }
  const { rows } = await pool.query(
    `update public.wm_quiz_questions set active = false, updated_at = now() where id = $1 returning *`,
    [id],
  );
  return rows[0] || null;
}

function serializeRawQuestion(row) {
  if (!row) return null;
  return {
    id: row.id,
    questTemplateId: row.quest_template_id,
    prompt: row.prompt || row.question,
    answers: row.answers || [],
    correctAnswerKey: row.correct_answer_key || row.correct_answer,
    explanation: row.explanation || "",
    active: Boolean(row.active),
    displayOrder: Number(row.display_order || 0),
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default async function wmAdminQuizQuestions(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const questSlug = String(req.query?.questSlug || req.query?.quest_slug || "").trim() || null;
      const includeInactive = toBoolean(req.query?.includeInactive || req.query?.include_inactive, false);
      const [questions, templates] = await Promise.all([
        listQuestions({ questSlug, includeInactive }),
        listQuizTemplates(),
      ]);
      return res.status(200).json({ ok: true, admin, templates, questions });
    }

    if (req.method === "POST") {
      const question = await createQuestion(req.body || {});
      return res.status(201).json({ ok: true, admin, question: serializeRawQuestion(question) });
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      const question = await updateQuestion(req.body || {});
      return res.status(200).json({ ok: true, admin, question: serializeRawQuestion(question) });
    }

    if (req.method === "DELETE") {
      const question = await deleteQuestion({ ...(req.query || {}), ...(req.body || {}) });
      return res.status(200).json({ ok: true, admin, question: serializeRawQuestion(question) });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    const message = error?.message || "Unexpected server error.";
    const status = /required|must|not found/i.test(message) ? 400 : 500;
    console.error("[war-missions/admin-quiz-questions] failed", error);
    return res.status(status).json({ ok: false, error: message });
  }
}
