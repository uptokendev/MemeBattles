import { pool } from "../../server/db.js";
import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { ensureCurrentQuestInstance } from "./_lib/periods.js";
import { buildWarProfile, getUserById } from "./_lib/profile.js";

const PROVIDER_QUEST_SLUG = {
  x: "intercept-global-comms",
  telegram: "access-underground-comms",
  discord: "report-to-base-camp",
};

const PROVIDERS = new Set(Object.keys(PROVIDER_QUEST_SLUG));

function normalizeHandle(value) {
  return String(value || "").trim().replace(/^@+/, "");
}

async function createAdminNotification(input) {
  await pool.query(
    `
      insert into public.wm_admin_notifications
        (type, title, message, priority, status, related_user_id, related_completion_id, related_application_id)
      values ($1, $2, $3, $4, 'open', $5, $6, $7)
    `,
    [
      input.type,
      input.title,
      input.message || null,
      input.priority || "normal",
      input.relatedUserId || null,
      input.relatedCompletionId || null,
      input.relatedApplicationId || null,
    ],
  ).catch(() => undefined);
}

async function writeVerificationLog(input) {
  await pool.query(
    `
      insert into public.wm_verification_logs
        (user_id, quest_completion_id, provider, verification_type, status, message, metadata)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      input.userId || null,
      input.completionId || null,
      input.provider,
      input.verificationType,
      input.status,
      input.message,
      JSON.stringify(input.metadata || {}),
    ],
  ).catch(() => undefined);
}

async function submitSocialStartHereQuest({ user, provider, username, providerUserId }) {
  const questSlug = PROVIDER_QUEST_SLUG[provider];
  const { rows: templateRows } = await pool.query(
    `select * from public.wm_quest_templates where slug = $1 and active = true limit 1`,
    [questSlug],
  );
  const template = templateRows[0];
  if (!template) throw new Error("Quest was not found.");

  const instance = await ensureCurrentQuestInstance(template);
  const { rows: existingRows } = await pool.query(
    `
      select *
      from public.wm_quest_completions
      where user_id = $1 and quest_instance_id = $2
      limit 1
    `,
    [user.id, instance.id],
  );

  const existing = existingRows[0] || null;
  if (existing?.status === "verified") {
    return { completion: existing, status: existing.status, alreadyCompleted: true };
  }

  const payload = {
    provider,
    username,
    providerUserId,
    source: "social_identity_link",
    note: "Social identity linked; bot/API verification may approve later.",
    manual_fallback: true,
    provider_configured: provider === "x"
      ? Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET && process.env.X_REDIRECT_URI)
      : provider === "telegram"
        ? Boolean(process.env.TELEGRAM_BOT_TOKEN)
        : provider === "discord"
          ? Boolean(process.env.DISCORD_BOT_TOKEN)
          : false,
    submitted_at: new Date().toISOString(),
  };

  let completion;
  if (existing) {
    const { rows } = await pool.query(
      `
        update public.wm_quest_completions
        set status = 'review',
            submitted_value = $2,
            verification_payload = $3::jsonb,
            rejection_reason = null,
            verified_at = null,
            updated_at = now()
        where id = $1
        returning *
      `,
      [existing.id, username, JSON.stringify(payload)],
    );
    completion = rows[0] || existing;
  } else {
    const { rows } = await pool.query(
      `
        insert into public.wm_quest_completions
          (user_id, quest_instance_id, status, submitted_value, verification_payload, rejection_reason, verified_at, updated_at)
        values ($1, $2, 'review', $3, $4::jsonb, null, null, now())
        returning *
      `,
      [user.id, instance.id, username, JSON.stringify(payload)],
    );
    completion = rows[0];
  }

  if (!completion) throw new Error("Unable to create social verification review.");

  await writeVerificationLog({
    userId: user.id,
    completionId: completion.id,
    provider,
    verificationType: template.verification_type,
    status: "review",
    message: "Social identity linked; waiting for manual or bot/API verification.",
    metadata: payload,
  });

  await createAdminNotification({
    type: "quest_review_requested",
    title: `${template.title} needs review`,
    message: `${provider.toUpperCase()} linked: ${username}`,
    priority: "normal",
    relatedUserId: user.id,
    relatedCompletionId: completion.id,
  });

  return { completion, status: "review", alreadyCompleted: false };
}

export default async function wmSocialLink(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  try {
    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) return unauthorized(res, "War Missions session is no longer valid.");
    if (user.is_banned) return res.status(403).json({ error: "This wallet is excluded from War Missions." });

    const body = req.body || {};
    const provider = String(body.provider || "").trim().toLowerCase();
    const providerUserId = normalizeHandle(body.providerUserId || body.username);
    const username = normalizeHandle(body.username || providerUserId);

    if (!PROVIDERS.has(provider)) return res.status(400).json({ error: "Unsupported social provider." });
    if (!providerUserId) return res.status(400).json({ error: "Provide providerUserId or username." });

    const { rows: reusedRows } = await pool.query(
      `
        select id, user_id
        from public.wm_social_accounts
        where provider = $1 and provider_user_id = $2
        limit 1
      `,
      [provider, providerUserId],
    );
    if (reusedRows[0] && reusedRows[0].user_id !== user.id) {
      return res.status(409).json({ error: "This social account is already linked to another wallet." });
    }

    const { rows: currentRows } = await pool.query(
      `
        select id
        from public.wm_social_accounts
        where provider = $1 and user_id = $2
        limit 1
      `,
      [provider, user.id],
    );

    if (currentRows[0]) {
      await pool.query(
        `
          update public.wm_social_accounts
          set provider_user_id = $2,
              username = $3,
              last_verified_at = null
          where id = $1
        `,
        [currentRows[0].id, providerUserId, username],
      );
    } else {
      await pool.query(
        `
          insert into public.wm_social_accounts
            (user_id, provider, provider_user_id, username)
          values ($1, $2, $3, $4)
        `,
        [user.id, provider, providerUserId, username],
      );
    }

    const questResult = await submitSocialStartHereQuest({ user, provider, username, providerUserId }).catch(async (error) => {
      await createAdminNotification({
        type: "social_start_here_submission_failed",
        title: `${provider.toUpperCase()} linked but Start Here quest was not submitted`,
        message: error?.message || "Unknown quest submission error.",
        priority: "high",
        relatedUserId: user.id,
      });
      return { status: "review", alreadyCompleted: false };
    });

    const profile = await buildWarProfile(user);
    return res.status(200).json({
      ok: true,
      provider,
      username,
      questSlug: PROVIDER_QUEST_SLUG[provider],
      status: questResult.status || "review",
      alreadyCompleted: Boolean(questResult.alreadyCompleted),
      profile,
    });
  } catch (error) {
    console.error("[war-missions/social-link] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
