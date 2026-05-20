import { pool } from "../../../server/db.js";
import { awardQuestForUser, maybeVerifyReferralForUser } from "./profile.js";

export const COMMUNITY_JOIN_QUESTS = {
  telegram: "access-underground-comms",
  discord: "report-to-base-camp",
};

const VALID_MEMBER_STATUSES = new Set(["creator", "administrator", "member", "restricted"]);

function statusOk(status) {
  return VALID_MEMBER_STATUSES.has(String(status || "").toLowerCase());
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

async function getLinkedAccount(userId, provider) {
  const { rows } = await pool.query(
    `
      select provider, provider_user_id, username
      from public.wm_social_accounts
      where user_id = $1 and provider = $2
      limit 1
    `,
    [userId, provider],
  );
  return rows[0] || null;
}

async function getLinkedAccountUser(provider, providerUserId) {
  const { rows } = await pool.query(
    `
      select
        sa.provider,
        sa.provider_user_id,
        sa.username,
        u.*
      from public.wm_social_accounts sa
      join public.wm_users u on u.id = sa.user_id
      where sa.provider = $1 and sa.provider_user_id = $2
      limit 1
    `,
    [provider, String(providerUserId || "")],
  );
  return rows[0] || null;
}

async function isQuestVerified(userId, questSlug) {
  const { rows } = await pool.query(
    `
      select qc.id
      from public.wm_quest_completions qc
      join public.wm_quest_instances qi on qi.id = qc.quest_instance_id
      join public.wm_quest_templates qt on qt.id = qi.quest_template_id
      where qc.user_id = $1 and qt.slug = $2 and qc.status = 'verified'
      limit 1
    `,
    [userId, questSlug],
  );
  return Boolean(rows[0]);
}

export async function checkTelegramMembership(telegramUserId) {
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
    return {
      checked: true,
      ok: false,
      status: null,
      error: json?.description || `Telegram getChatMember failed (${response.status}).`,
    };
  }

  const status = String(json.result?.status || "");
  return { checked: true, ok: statusOk(status), status, error: null };
}

export async function checkDiscordMembership(discordUserId) {
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
    return {
      checked: true,
      ok: false,
      status: null,
      error: json?.message || `Discord get guild member failed (${response.status}).`,
    };
  }

  return { checked: true, ok: true, status: "member", error: null };
}

async function checkMembership(provider, providerUserId) {
  if (provider === "telegram") return checkTelegramMembership(providerUserId);
  if (provider === "discord") return checkDiscordMembership(providerUserId);
  return { checked: false, ok: false, status: null, error: "Unsupported provider." };
}

export async function awardCommunityJoinQuest({ user, provider, account, membership, source = "community_membership_check", event = {} }) {
  const questSlug = COMMUNITY_JOIN_QUESTS[provider];
  if (!questSlug || !user?.id || !account?.provider_user_id) {
    return { ok: false, awarded: false, reason: "invalid_input" };
  }

  if (user.is_banned) return { ok: false, awarded: false, reason: "user_banned" };

  if (!membership?.ok) {
    await writeVerificationLog({
      userId: user.id,
      provider,
      verificationType: `${provider}_join`,
      status: "pending",
      message: membership?.error || `${provider} membership was not confirmed yet.`,
      metadata: { account, membership, source, event },
    });
    return { ok: true, awarded: false, status: "pending", membership };
  }

  const verificationPayload = {
    provider,
    username: account.username || account.provider_user_id,
    provider_user_id: account.provider_user_id,
    membership,
    source,
    event,
    checked_at: new Date().toISOString(),
  };

  const award = await awardQuestForUser(user.id, questSlug, `${provider}_join_verified`, verificationPayload);
  await maybeVerifyReferralForUser(user.id).catch(() => undefined);

  await pool.query(
    `
      update public.wm_social_accounts
      set last_verified_at = now()
      where user_id = $1 and provider = $2
    `,
    [user.id, provider],
  ).catch(() => undefined);

  await writeVerificationLog({
    userId: user.id,
    completionId: award.completionId,
    provider,
    verificationType: `${provider}_join`,
    status: "verified",
    message: `${provider === "telegram" ? "Telegram group" : "Discord server"} membership confirmed automatically.`,
    metadata: verificationPayload,
  });

  return { ok: true, awarded: award.awarded, status: "verified", award, membership };
}

export async function verifyCommunityJoinQuestForUser(user, provider, source = "community_membership_check") {
  const questSlug = COMMUNITY_JOIN_QUESTS[provider];
  if (!questSlug) return { ok: false, provider, reason: "unsupported_provider" };
  if (!user?.id || user.is_banned) return { ok: false, provider, reason: "user_not_allowed" };
  if (await isQuestVerified(user.id, questSlug)) return { ok: true, provider, status: "already_verified", awarded: false };

  const account = await getLinkedAccount(user.id, provider);
  if (!account) return { ok: false, provider, reason: "account_not_linked" };

  const membership = await checkMembership(provider, account.provider_user_id);
  return awardCommunityJoinQuest({ user, provider, account, membership, source });
}

export async function verifyCommunityJoinQuestsForUser(user, source = "community_membership_check") {
  const results = [];
  for (const provider of ["telegram", "discord"]) {
    results.push(await verifyCommunityJoinQuestForUser(user, provider, source).catch((error) => ({
      ok: false,
      provider,
      error: error?.message || "Membership verification failed.",
    })));
  }
  return results;
}

export async function verifyCommunityJoinQuestByProviderUserId(provider, providerUserId, source = "community_membership_event", event = {}) {
  const row = await getLinkedAccountUser(provider, providerUserId);
  if (!row) return { ok: false, provider, reason: "linked_account_not_found" };

  const user = {
    id: row.id,
    wallet_address: row.wallet_address,
    role: row.role,
    risk_score: row.risk_score,
    is_banned: row.is_banned,
  };
  const account = {
    provider: row.provider,
    provider_user_id: row.provider_user_id,
    username: row.username || row.provider_user_id,
  };
  const membership = await checkMembership(provider, providerUserId);
  return awardCommunityJoinQuest({ user, provider, account, membership, source, event });
}

export function telegramChatMatchesRequired(chat = {}) {
  const configured = String(process.env.TELEGRAM_REQUIRED_CHAT_ID || "").trim();
  if (!configured) return false;

  const chatId = String(chat.id || "").trim();
  const username = String(chat.username || "").trim().replace(/^@+/, "").toLowerCase();
  const title = String(chat.title || "").trim().toLowerCase();
  const normalizedConfigured = configured.replace(/^@+/, "").toLowerCase();

  return configured === chatId || normalizedConfigured === username || normalizedConfigured === title;
}

export function isCommunityMemberStatus(status) {
  return statusOk(status);
}
