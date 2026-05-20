import { pool } from "../../server/db.js";
import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { getUserById } from "./_lib/profile.js";

async function requireAdmin(req, res) {
  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  const user = await getUserById(auth.userId);
  if (!user || user.wallet_address !== auth.address) {
    unauthorized(res, "War Missions session is no longer valid.");
    return null;
  }
  if (user.is_banned) {
    res.status(403).json({ error: "This wallet is excluded from War Missions." });
    return null;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required." });
    return null;
  }

  return user;
}

async function getCompletion(completionId) {
  const { rows } = await pool.query(
    `
      select
        qc.*,
        qt.slug as quest_slug,
        qt.title as quest_title,
        qt.verification_type,
        qt.metadata as template_metadata,
        u.wallet_address
      from public.wm_quest_completions qc
      join public.wm_quest_instances qi on qi.id = qc.quest_instance_id
      join public.wm_quest_templates qt on qt.id = qi.quest_template_id
      join public.wm_users u on u.id = qc.user_id
      where qc.id = $1
      limit 1
    `,
    [completionId],
  );
  return rows[0] || null;
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
      input.provider || "admin",
      input.verificationType || "admin_recheck",
      input.status,
      input.message,
      JSON.stringify(input.metadata || {}),
    ],
  ).catch(() => undefined);
}

async function checkTelegramMembership(telegramUserId) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_REQUIRED_CHAT_ID || "").trim();
  if (!botToken || !chatId || !telegramUserId) {
    return { checked: false, ok: false, status: null, error: "Telegram membership check is not configured." };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, user_id: Number(telegramUserId) }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    return { checked: true, ok: false, status: null, error: json?.description || `Telegram check failed (${response.status}).` };
  }
  const status = String(json.result?.status || "");
  return { checked: true, ok: ["creator", "administrator", "member", "restricted"].includes(status), status, error: null };
}

async function checkDiscordMembership(discordUserId) {
  const botToken = String(process.env.DISCORD_BOT_TOKEN || "").trim();
  const guildId = String(process.env.DISCORD_REQUIRED_GUILD_ID || "").trim();
  if (!botToken || !guildId || !discordUserId) {
    return { checked: false, ok: false, status: null, error: "Discord membership check is not configured." };
  }

  const response = await fetch(`https://discord.com/api/guilds/${guildId}/members/${discordUserId}`, {
    headers: { authorization: `Bot ${botToken}` },
  });
  if (response.status === 404) return { checked: true, ok: false, status: "not_member", error: null };
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    return { checked: true, ok: false, status: null, error: json?.message || `Discord check failed (${response.status}).` };
  }
  return { checked: true, ok: true, status: "member", error: null };
}

async function getSocialAccount(userId, provider) {
  const { rows } = await pool.query(
    `
      select provider_user_id, username
      from public.wm_social_accounts
      where user_id = $1 and provider = $2
      limit 1
    `,
    [userId, provider],
  );
  return rows[0] || null;
}

function inferProvider(completion) {
  const payloadProvider = String(completion.verification_payload?.provider || "").trim().toLowerCase();
  if (payloadProvider) return payloadProvider;
  const type = String(completion.verification_type || "").toLowerCase();
  if (type.startsWith("telegram")) return "telegram";
  if (type.startsWith("discord")) return "discord";
  if (type.startsWith("x_")) return "x";
  return "manual";
}

function metricStatus(completion, metrics = {}) {
  const metadata = completion.template_metadata || {};
  const minLikes = Number(metadata.min_likes || 0);
  const minImpressions = Number(metadata.min_impressions || 0);
  const likeCount = Number(metrics.likeCount ?? metrics.likes ?? metrics.like_count ?? completion.verification_payload?.metrics?.like_count ?? 0);
  const impressionCount = Number(metrics.impressionCount ?? metrics.impressions ?? metrics.impression_count ?? completion.verification_payload?.metrics?.impression_count ?? 0);
  const ok = (minLikes <= 0 || likeCount >= minLikes) && (minImpressions <= 0 || impressionCount >= minImpressions);
  return {
    ok,
    metrics: { like_count: Math.max(0, likeCount), impression_count: Math.max(0, impressionCount) },
    reason: ok ? "Metric thresholds met." : "Metric thresholds not met yet.",
  };
}

export default async function wmAdminSocialRecheck(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const completionId = String(req.body?.completionId || "").trim();
    if (!completionId) return res.status(400).json({ error: "completionId is required." });

    const completion = await getCompletion(completionId);
    if (!completion) return res.status(404).json({ error: "Completion not found." });

    const provider = inferProvider(completion);
    let result = { checked: true, ok: false, status: "manual_review", error: null };
    let nextStatus = "review";
    let reason = "Admin recheck requires manual review.";

    if (provider === "telegram") {
      const account = await getSocialAccount(completion.user_id, "telegram");
      result = await checkTelegramMembership(account?.provider_user_id);
      nextStatus = result.ok ? "verified" : "review";
      reason = result.ok ? "Telegram membership confirmed." : result.error || "Telegram membership was not confirmed.";
    } else if (provider === "discord") {
      const account = await getSocialAccount(completion.user_id, "discord");
      result = await checkDiscordMembership(account?.provider_user_id);
      nextStatus = result.ok ? "verified" : "review";
      reason = result.ok ? "Discord membership confirmed." : result.error || "Discord membership was not confirmed.";
    } else if (provider === "x") {
      const metric = metricStatus(completion, req.body?.metrics || {});
      result = { checked: true, ok: metric.ok, status: metric.ok ? "metrics_met" : "metrics_pending", error: null, metrics: metric.metrics };
      nextStatus = metric.ok ? "verified" : "review";
      reason = metric.reason;
    }

    const payload = {
      ...(completion.verification_payload || {}),
      admin_recheck: {
        provider,
        result,
        reason,
        checked_by: admin.id,
        checked_at: new Date().toISOString(),
      },
    };

    const { rows } = await pool.query(
      `
        update public.wm_quest_completions
        set status = $2,
            verification_payload = $3::jsonb,
            rejection_reason = case when $2 = 'review' then $4 else null end,
            verified_at = case when $2 = 'verified' then now() else verified_at end,
            updated_at = now()
        where id = $1
        returning *
      `,
      [completionId, nextStatus, JSON.stringify(payload), reason],
    );

    await writeVerificationLog({
      userId: completion.user_id,
      completionId,
      provider,
      verificationType: completion.verification_type,
      status: nextStatus,
      message: reason,
      metadata: {
        admin_user_id: admin.id,
        quest_slug: completion.quest_slug,
        result,
      },
    });

    return res.status(200).json({ ok: true, completion: rows[0], provider, result, status: nextStatus, reason });
  } catch (error) {
    console.error("[war-missions/admin-social-recheck] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
