import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { getUserById } from "./_lib/profile.js";
import {
  getLatestQuizAttempt,
  getQuizQuestions,
  getQuizTemplateBySlug,
  passingScore,
  presentQuizQuestions,
  questionsRequired,
  quizCooldownMinutes,
} from "./_lib/quiz.js";

export default async function wmQuizLoad(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  try {
    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) {
      return unauthorized(res, "War Missions session is no longer valid.");
    }
    if (user.is_banned) return res.status(403).json({ error: "This wallet is excluded from War Missions." });

    const questSlug = String(req.query?.questSlug || "").trim();
    if (!questSlug) return res.status(400).json({ error: "questSlug is required." });

    const template = await getQuizTemplateBySlug(questSlug);
    if (!template) return res.status(404).json({ error: "Quiz quest was not found." });

    const questions = await getQuizQuestions(template.id);
    if (questions.length === 0) {
      return res.status(409).json({ error: "Quiz questions are not configured yet." });
    }

    const totalQuestions = questionsRequired(template, questions.length);
    const neededToPass = passingScore(template, totalQuestions);
    const retryCooldownMinutes = quizCooldownMinutes(template);

    const latestAttempt = await getLatestQuizAttempt(user.id, template.id);
    const cooldownUntil = latestAttempt?.cooldown_until || null;
    if (cooldownUntil && new Date(cooldownUntil).getTime() > Date.now()) {
      return res.status(200).json({
        ok: true,
        questSlug,
        title: template.title,
        cooldownUntil,
        cooldownActive: true,
        retryCooldownMinutes,
        totalQuestions,
        passingScore: neededToPass,
        questions: [],
      });
    }

    const presentedQuestions = presentQuizQuestions(template, questions);
    return res.status(200).json({
      ok: true,
      questSlug,
      title: template.title,
      cooldownUntil: null,
      cooldownActive: false,
      retryCooldownMinutes,
      totalQuestions: presentedQuestions.length,
      passingScore: passingScore(template, presentedQuestions.length),
      questions: presentedQuestions,
    });
  } catch (error) {
    console.error("[war-missions/quiz-load] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
