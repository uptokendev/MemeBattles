import { pool } from "../../../server/db.js";

function metadataValue(template, key, fallback) {
  const metadata = template?.metadata && typeof template.metadata === "object" ? template.metadata : {};
  const quiz = metadata.quiz && typeof metadata.quiz === "object" ? metadata.quiz : {};
  return quiz[key] ?? metadata[key] ?? fallback;
}

function normalizeAnswer(value) {
  if (Array.isArray(value)) return value.map(normalizeAnswer).sort().join("|");
  return String(value ?? "").trim().toLowerCase();
}

function parseOptions(row) {
  const raw = row.options ?? row.choices ?? row.answers ?? [];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.entries(raw).map(([value, label]) => ({ value, label }));
  return [];
}

function publicQuestion(row) {
  return {
    id: String(row.id),
    prompt: row.prompt || row.question || row.question_text || row.title || "Quiz question",
    type: row.question_type || row.type || "multiple_choice",
    options: parseOptions(row),
    metadata: row.metadata || {},
  };
}

export async function getQuizTemplateBySlug(slug) {
  const value = String(slug || "").trim();
  if (!value) return null;

  const { rows } = await pool.query(
    `
      select *
      from public.wm_quest_templates
      where slug = $1
        and (verification_type = 'quiz' or metadata->>'type' = 'quiz' or metadata->'quiz' is not null)
      limit 1
    `,
    [value],
  );
  return rows[0] || null;
}

export async function getQuizQuestions(questTemplateId) {
  if (!questTemplateId) return [];

  const { rows } = await pool.query(
    `
      select *
      from public.wm_quiz_questions
      where quest_template_id = $1
        and coalesce(active, true) = true
      order by display_order asc nulls last, created_at asc nulls last, id asc
    `,
    [questTemplateId],
  );
  return rows || [];
}

export function questionsRequired(template, availableCount) {
  const configured = Number(metadataValue(template, "questionsRequired", availableCount));
  if (!Number.isFinite(configured) || configured <= 0) return availableCount;
  return Math.min(Math.floor(configured), availableCount);
}

export function passingScore(template, totalQuestions) {
  const configured = Number(metadataValue(template, "passingScore", 0));
  if (Number.isFinite(configured) && configured > 0) return Math.min(Math.floor(configured), totalQuestions);

  const percent = Number(metadataValue(template, "passingPercent", 70));
  const safePercent = Number.isFinite(percent) && percent > 0 ? percent : 70;
  return Math.max(1, Math.ceil((Number(totalQuestions || 0) * safePercent) / 100));
}

export function quizCooldownMinutes(template) {
  const configured = Number(metadataValue(template, "cooldownMinutes", 15));
  return Number.isFinite(configured) && configured >= 0 ? configured : 15;
}

export function presentQuizQuestions(template, questions) {
  const count = questionsRequired(template, questions.length);
  return questions.slice(0, count).map(publicQuestion);
}

export function scoreQuizSubmission(questions, submittedAnswers = {}, questionIds = []) {
  const allowedIds = new Set(questionIds.map((id) => String(id)));
  const selected = allowedIds.size > 0 ? questions.filter((question) => allowedIds.has(String(question.id))) : questions;

  const results = selected.map((question) => {
    const id = String(question.id);
    const submitted = submittedAnswers[id] ?? submittedAnswers[question.slug] ?? submittedAnswers[question.prompt];
    const expected = question.correct_answer ?? question.correctAnswer ?? question.answer;
    const correct = normalizeAnswer(submitted) === normalizeAnswer(expected);
    return { questionId: id, correct };
  });

  return {
    score: results.filter((result) => result.correct).length,
    totalQuestions: results.length,
    results,
  };
}

export async function getLatestQuizAttempt(userId, questTemplateId) {
  const { rows } = await pool.query(
    `
      select *
      from public.wm_quiz_attempts
      where user_id = $1 and quest_template_id = $2
      order by created_at desc
      limit 1
    `,
    [userId, questTemplateId],
  );
  return rows[0] || null;
}

export async function recordQuizAttempt({ userId, questTemplateId, questCompletionId, answers, score, totalQuestions, passed, cooldownUntil, metadata }) {
  const { rows } = await pool.query(
    `
      insert into public.wm_quiz_attempts
        (user_id, quest_template_id, quest_completion_id, answers, score, total_questions, passed, cooldown_until, metadata)
      values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9::jsonb)
      returning *
    `,
    [
      userId,
      questTemplateId,
      questCompletionId || null,
      JSON.stringify(answers || {}),
      Number(score || 0),
      Number(totalQuestions || 0),
      Boolean(passed),
      cooldownUntil || null,
      JSON.stringify(metadata || {}),
    ],
  );
  return rows[0] || null;
}
