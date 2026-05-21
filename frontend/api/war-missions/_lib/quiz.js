import { pool } from "../../../server/db.js";

function shuffle(items) {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [list[index], list[target]] = [list[target], list[index]];
  }
  return list;
}

export async function getQuizTemplateBySlug(slug) {
  const { rows } = await pool.query(
    `
      select *
      from public.wm_quest_templates
      where slug = $1 and active = true and verification_type = 'docs_quiz'
      limit 1
    `,
    [slug],
  );
  return rows[0] || null;
}

export async function getQuizQuestions(questTemplateId) {
  const { rows } = await pool.query(
    `
      select
        id,
        coalesce(prompt, question) as prompt,
        answers,
        coalesce(correct_answer_key, correct_answer) as correct_answer_key,
        explanation,
        display_order,
        metadata
      from public.wm_quiz_questions
      where quest_template_id = $1 and active = true
      order by display_order asc, created_at asc
    `,
    [questTemplateId],
  );
  return rows;
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

export function quizCooldownMinutes(template) {
  const configured = Number(template?.metadata?.retry_cooldown_minutes || 0);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 30;
}

export function questionsRequired(template, availableCount) {
  const configured = Number(template?.metadata?.question_count || 4);
  const desired = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 4;
  return Math.min(Math.max(1, desired), availableCount);
}

export function passingScore(template, totalQuestions) {
  const configured = Number(template?.metadata?.passing_score || 0);
  if (Number.isFinite(configured) && configured > 0) return Math.min(Math.floor(configured), totalQuestions);
  return Math.min(3, totalQuestions);
}

export function presentQuizQuestions(template, questions) {
  const selectedCount = questionsRequired(template, questions.length);
  const selected = shuffle(questions).slice(0, selectedCount);
  return shuffle(selected).map((question) => ({
    id: question.id,
    prompt: question.prompt,
    answers: shuffle(Array.isArray(question.answers) ? question.answers : []).map((answer) => ({
      key: answer?.key,
      text: answer?.text,
    })),
  }));
}

export function scoreQuizSubmission(questions, submittedAnswers = {}, questionIds = null) {
  const selectedIds = Array.isArray(questionIds) && questionIds.length > 0
    ? questionIds.map((value) => String(value || "").trim()).filter(Boolean)
    : Object.keys(submittedAnswers || {}).map((value) => String(value || "").trim()).filter(Boolean);
  const selectedSet = new Set(selectedIds);
  const scopedQuestions = questions.filter((question) => selectedSet.has(String(question.id)));
  const byId = new Map(scopedQuestions.map((question) => [question.id, question]));
  let score = 0;
  const results = [];

  for (const question of scopedQuestions) {
    const selectedKey = String(submittedAnswers?.[question.id] || "").trim();
    const correctKey = String(question.correct_answer_key || "").trim();
    const correct = selectedKey && selectedKey === correctKey;
    if (correct) score += 1;
    results.push({
      questionId: question.id,
      selectedKey: selectedKey || null,
      correctKey,
      correct,
      explanation: question.explanation || null,
    });
  }

  return {
    score,
    totalQuestions: byId.size,
    results,
  };
}

export async function recordQuizAttempt({
  userId,
  questTemplateId,
  questCompletionId = null,
  answers,
  score,
  totalQuestions,
  passed,
  cooldownUntil = null,
  metadata = {},
}) {
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
      questCompletionId,
      JSON.stringify(answers || {}),
      score,
      totalQuestions,
      Boolean(passed),
      cooldownUntil,
      JSON.stringify(metadata || {}),
    ],
  );
  return rows[0] || null;
}
