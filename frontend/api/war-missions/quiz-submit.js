import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { ensureCurrentQuestInstance } from "./_lib/periods.js";
import { awardQuestForUser, buildWarProfile, getUserById, maybeVerifyReferralForUser } from "./_lib/profile.js";
import { pool } from "../../server/db.js";
import {
  getLatestQuizAttempt,
  getQuizQuestions,
  getQuizTemplateBySlug,
  passingScore,
  quizCooldownMinutes,
  recordQuizAttempt,
  scoreQuizSubmission,
} from "./_lib/quiz.js";

async function getExistingCompletion(userId, instanceId) {
  const { rows } = await pool.query(
    `
      select *
      from public.wm_quest_completions
      where user_id = $1 and quest_instance_id = $2
      limit 1
    `,
    [userId, instanceId],
  );
  return rows[0] || null;
}

async function upsertCompletion({ userId, instanceId, existing, status, verificationPayload }) {
  const now = new Date().toISOString();
  if (existing) {
    const { rows } = await pool.query(
      `
        update public.wm_quest_completions
        set status = $2,
            verification_payload = $3::jsonb,
            rejection_reason = case when $2 = 'rejected' then 'quiz_failed' else null end,
            verified_at = case when $2 = 'verified' then $4 else null end,
            updated_at = $4
        where id = $1
        returning *
      `,
      [existing.id, status, JSON.stringify(verificationPayload || {}), now],
    );
    return rows[0] || existing;
  }

  const { rows } = await pool.query(
    `
      insert into public.wm_quest_completions
        (user_id, quest_instance_id, status, submitted_value, verification_payload, rejection_reason, verified_at, updated_at)
      values ($1, $2, $3, 'quiz', $4::jsonb, case when $3 = 'rejected' then 'quiz_failed' else null end, case when $3 = 'verified' then $5 else null end, $5)
      returning *
    `,
    [userId, instanceId, status, JSON.stringify(verificationPayload || {}), now],
  );
  return rows[0] || null;
}

export default async function wmQuizSubmit(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  try {
    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) {
      return unauthorized(res, "War Missions session is no longer valid.");
    }
    if (user.is_banned) return res.status(403).json({ error: "This wallet is excluded from War Missions." });

    const body = req.body || {};
    const questSlug = String(body.questSlug || "").trim();
    const submittedAnswers = body.answers && typeof body.answers === "object" ? body.answers : {};
    const questionIds = Array.isArray(body.questionIds)
      ? body.questionIds.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    if (!questSlug) return res.status(400).json({ error: "questSlug is required." });

    const template = await getQuizTemplateBySlug(questSlug);
    if (!template) return res.status(404).json({ error: "Quiz quest was not found." });

    const latestAttempt = await getLatestQuizAttempt(user.id, template.id);
    if (latestAttempt?.cooldown_until && new Date(latestAttempt.cooldown_until).getTime() > Date.now()) {
      return res.status(429).json({ error: "Quiz retry cooldown is still active.", cooldownUntil: latestAttempt.cooldown_until });
    }

    const questions = await getQuizQuestions(template.id);
    if (questions.length === 0) return res.status(409).json({ error: "Quiz questions are not configured yet." });

    const evaluation = scoreQuizSubmission(questions, submittedAnswers, questionIds);
    if (evaluation.totalQuestions === 0) {
      return res.status(400).json({ error: "questionIds are required to score this quiz attempt." });
    }
    const neededToPass = passingScore(template, evaluation.totalQuestions);
    const passed = evaluation.score >= neededToPass;
    const cooldownUntil = passed
      ? null
      : new Date(Date.now() + quizCooldownMinutes(template) * 60 * 1000).toISOString();

    const instance = await ensureCurrentQuestInstance(template);
    const existingCompletion = await getExistingCompletion(user.id, instance.id);
    const verificationPayload = {
      quiz: {
        score: evaluation.score,
        totalQuestions: evaluation.totalQuestions,
        passingScore: neededToPass,
        passed,
        results: evaluation.results,
      },
    };
    const completion = await upsertCompletion({
      userId: user.id,
      instanceId: instance.id,
      existing: existingCompletion,
      status: passed ? "verified" : "rejected",
      verificationPayload,
    });

    const attempt = await recordQuizAttempt({
      userId: user.id,
      questTemplateId: template.id,
      questCompletionId: completion?.id || null,
      answers: submittedAnswers,
      score: evaluation.score,
      totalQuestions: evaluation.totalQuestions,
      passed,
      cooldownUntil,
      metadata: {
        results: evaluation.results,
        passingScore: neededToPass,
      },
    });

    let awardResult = null;
    if (passed) {
      awardResult = await awardQuestForUser(
        user.id,
        template.slug,
        "docs_quiz_passed",
        verificationPayload,
      );
      await maybeVerifyReferralForUser(user.id).catch(() => undefined);
    }

    const profile = await buildWarProfile(user);
    return res.status(200).json({
      ok: true,
      questSlug,
      passed,
      score: evaluation.score,
      totalQuestions: evaluation.totalQuestions,
      passingScore: neededToPass,
      cooldownUntil,
      attemptId: attempt?.id || null,
      completionId: completion?.id || null,
      awardResult,
      profile,
    });
  } catch (error) {
    console.error("[war-missions/quiz-submit] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
