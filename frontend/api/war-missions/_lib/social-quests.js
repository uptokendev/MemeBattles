import { pool } from "../../../server/db.js";
import { ensureCurrentQuestInstance } from "./periods.js";

export const PROVIDER_QUEST_SLUG = {
  x: "intercept-global-comms",
  telegram: "access-underground-comms",
  discord: "report-to-base-camp",
};

export async function createAdminNotification(input) {
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

export async function writeVerificationLog(input) {
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

function isProviderConfigured(provider) {
  if (provider === "x") {
    const hasTarget = Boolean(
      process.env.X_REQUIRED_USER_ID ||
        process.env.TWITTER_REQUIRED_USER_ID ||
        process.env.WAR_MISSIONS_X_REQUIRED_USER_ID ||
        process.env.X_REQUIRED_USERNAME ||
        process.env.TWITTER_REQUIRED_USERNAME ||
        process.env.WAR_MISSIONS_X_REQUIRED_USERNAME,
    );
    return Boolean(
      process.env.X_CLIENT_ID &&
        process.env.X_CLIENT_SECRET &&
        process.env.X_REDIRECT_URI &&
        (process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN) &&
        hasTarget,
    );
  }
  if (provider === "telegram") return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME);
  if (provider === "discord") return Boolean(process.env.DISCORD_BOT_TOKEN);
  return false;
}

export async function submitSocialStartHereQuest({
  user,
  provider,
  username,
  providerUserId,
  status = "review",
  verified = false,
  source = "social_identity_link",
  note = "Social identity linked; bot/API verification may approve later.",
  manualFallback = true,
  metadata = {},
}) {
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

  const nextStatus = verified ? "verified" : status;
  const payload = {
    provider,
    username,
    providerUserId,
    source,
    note,
    manual_fallback: Boolean(manualFallback),
    provider_configured: isProviderConfigured(provider),
    submitted_at: new Date().toISOString(),
    ...metadata,
  };

  let completion;
  if (existing) {
    const { rows } = await pool.query(
      `
        update public.wm_quest_completions
        set status = $2,
            submitted_value = $3,
            verification_payload = $4::jsonb,
            rejection_reason = null,
            verified_at = case when $5 then now() else null end,
            updated_at = now()
        where id = $1
        returning *
      `,
      [existing.id, nextStatus, username, JSON.stringify(payload), Boolean(verified)],
    );
    completion = rows[0] || existing;
  } else {
    const { rows } = await pool.query(
      `
        insert into public.wm_quest_completions
          (user_id, quest_instance_id, status, submitted_value, verification_payload, rejection_reason, verified_at, updated_at)
        values ($1, $2, $3, $4, $5::jsonb, null, case when $6 then now() else null end, now())
        returning *
      `,
      [user.id, instance.id, nextStatus, username, JSON.stringify(payload), Boolean(verified)],
    );
    completion = rows[0];
  }

  if (!completion) throw new Error("Unable to create social verification review.");

  await writeVerificationLog({
    userId: user.id,
    completionId: completion.id,
    provider,
    verificationType: template.verification_type,
    status: nextStatus,
    message: verified
      ? "Social identity verified through bot/API connector."
      : "Social identity linked; waiting for manual or bot/API verification.",
    metadata: payload,
  });

  if (!verified && manualFallback !== false) {
    await createAdminNotification({
      type: "quest_review_requested",
      title: `${template.title} needs review`,
      message: `${provider.toUpperCase()} linked: ${username}`,
      priority: "normal",
      relatedUserId: user.id,
      relatedCompletionId: completion.id,
    });
  }

  return { completion, status: nextStatus, alreadyCompleted: false };
}
