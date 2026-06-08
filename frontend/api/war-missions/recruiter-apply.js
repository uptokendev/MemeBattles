import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { awardQuestForUser, buildWarProfile, getUserById } from "./_lib/profile.js";
import {
  createRecruiterAdminNotification,
  getRecruiterApplicationForUser,
  getRecruiterQuestTemplateByVerificationType,
} from "./_lib/referrals.js";
import { pool } from "../../server/db.js";

function normalizeHandle(value) {
  return String(value || "").trim().replace(/^@+/, "").slice(0, 80);
}

function normalizeExpectedRecruits(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.min(1000, Math.trunc(parsed)));
}

function serializeApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    walletAddress: row.wallet_address,
    xUsername: row.x_username || "",
    telegramUsername: row.telegram_username || "",
    discordUsername: row.discord_username || "",
    motivation: row.motivation || "",
    expectedRecruits: row.expected_recruits == null ? null : Number(row.expected_recruits),
    status: row.status,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at || null,
  };
}

async function createOrUpdateApplication(user, body) {
  const xUsername = normalizeHandle(body.xUsername || body.x_username);
  const telegramUsername = normalizeHandle(body.telegramUsername || body.telegram_username);
  const discordUsername = normalizeHandle(body.discordUsername || body.discord_username);
  const motivation = String(body.motivation || "").trim().slice(0, 2000);
  const expectedRecruits = normalizeExpectedRecruits(body.expectedRecruits || body.expected_recruits);

  if (!motivation) throw new Error("Motivation is required.");
  if (!xUsername && !telegramUsername && !discordUsername) {
    throw new Error("Provide at least one social username.");
  }

  const existing = await getRecruiterApplicationForUser(user.id);
  if (existing?.status === "accepted") return existing;

  if (existing) {
    const { rows } = await pool.query(
      `
        update public.wm_recruiter_applications
        set
          wallet_address = $2,
          x_username = $3,
          telegram_username = $4,
          discord_username = $5,
          motivation = $6,
          expected_recruits = $7,
          status = case when status = 'accepted' then status else 'submitted' end,
          reviewed_by = null,
          reviewed_at = null
        where id = $1
        returning *
      `,
      [existing.id, user.wallet_address, xUsername || null, telegramUsername || null, discordUsername || null, motivation, expectedRecruits],
    );
    return rows[0] || existing;
  }

  const { rows } = await pool.query(
    `
      insert into public.wm_recruiter_applications
        (user_id, wallet_address, x_username, telegram_username, discord_username, motivation, expected_recruits, status)
      values ($1, $2, $3, $4, $5, $6, $7, 'submitted')
      returning *
    `,
    [user.id, user.wallet_address, xUsername || null, telegramUsername || null, discordUsername || null, motivation, expectedRecruits],
  );
  return rows[0] || null;
}

export default async function wmRecruiterApply(req, res) {
  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  try {
    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) return unauthorized(res, "War Missions session is no longer valid.");
    if (user.is_banned) return res.status(403).json({ ok: false, error: "This wallet is excluded from War Missions." });

    if (req.method === "GET") {
      const [application, profile] = await Promise.all([
        getRecruiterApplicationForUser(user.id),
        buildWarProfile(user),
      ]);
      return res.status(200).json({ ok: true, profile, application: serializeApplication(application) });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

    const application = await createOrUpdateApplication(user, req.body || {});

    const applicationQuest = await getRecruiterQuestTemplateByVerificationType("recruiter_application_submitted");
    if (applicationQuest?.slug) {
      await awardQuestForUser(user.id, applicationQuest.slug, "recruiter_application_submitted", {
        applicationId: application.id,
        status: application.status,
      }).catch(() => undefined);
    }

    await createRecruiterAdminNotification({
      type: "recruiter_application_submitted",
      title: "Recruiter application submitted",
      message: application.motivation || user.wallet_address,
      priority: "high",
      relatedUserId: user.id,
      relatedApplicationId: application.id,
    }).catch(() => undefined);

    const profile = await buildWarProfile(user);
    return res.status(200).json({ ok: true, profile, application: serializeApplication(application) });
  } catch (error) {
    console.error("[war-missions/recruiter-apply] failed", error);
    const message = error?.message || "Unexpected server error.";
    const status = /required|provide/i.test(message) ? 400 : 500;
    return res.status(status).json({ ok: false, error: message });
  }
}
