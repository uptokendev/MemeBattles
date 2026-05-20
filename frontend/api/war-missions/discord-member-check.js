import { pool } from "../../server/db.js";
import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { awardQuestForUser, getUserById, maybeVerifyReferralForUser } from "./_lib/profile.js";

async function checkMembership(discordUserId) {
  const botToken = String(process.env.DISCORD_BOT_TOKEN || "").trim();
  const guildId = String(process.env.DISCORD_REQUIRED_GUILD_ID || "").trim();

  if (!botToken || !guildId) {
    return { checked: false, ok: false, status: null, error: "Discord membership check is not configured." };
  }

  const response = await fetch(`https://discord.com/api/guilds/${guildId}/members/${discordUserId}`, {
    headers: { authorization: `Bot ${botToken}` },
  });

  if (response.status === 404) {
    return { checked: true, ok: false, status: "not_member", error: null };
  }

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

async function getQuestTemplate(slug) {
  if (!slug) return null;
  const { rows } = await pool.query(
    `select slug, title, verification_type from public.wm_quest_templates where slug = $1 and active = true limit 1`,
    [slug],
  );
  return rows[0] || null;
}

async function writeVerificationLog(input) {
  await pool.query(
    `
      insert into public.wm_verification_logs
        (user_id, quest_completion_id, provider, verification_type, status, message, metadata)
      values ($1, $2, 'discord', $3, $4, $5, $6::jsonb)
    `,
    [
      input.userId,
      input.completionId || null,
      input.verificationType || "discord_join",
      input.status,
      input.message,
      JSON.stringify(input.metadata || {}),
    ],
  ).catch(() => undefined);
}

export default async function wmDiscordMemberCheck(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  try {
    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) {
      return unauthorized(res, "War Missions session is no longer valid.");
    }
    if (user.is_banned) return res.status(403).json({ error: "This wallet is excluded from War Missions." });

    const { rows } = await pool.query(
      `
        select provider_user_id, username
        from public.wm_social_accounts
        where user_id = $1 and provider = 'discord'
        limit 1
      `,
      [user.id],
    );

    const account = rows[0];
    if (!account) {
      return res.status(409).json({
        ok: false,
        code: "discord_account_not_linked",
        error: "Discord account must be connected once for verification before this join quest can be checked.",
      });
    }

    const membership = await checkMembership(account.provider_user_id);
    if (membership.ok) {
      await pool.query(
        `
          update public.wm_social_accounts
          set last_verified_at = now()
          where user_id = $1 and provider = 'discord'
        `,
        [user.id],
      );
    }

    const questSlug = String(req.body?.questSlug || "").trim();
    let quest = null;
    let award = null;
    const questStatus = membership.ok ? "verified" : "pending";

    if (questSlug) {
      quest = await getQuestTemplate(questSlug);
      if (!quest) return res.status(404).json({ error: "Discord join quest was not found." });
      if (quest.verification_type !== "discord_join") {
        return res.status(400).json({ error: "Quest is not a Discord join quest." });
      }

      if (membership.ok) {
        const verificationPayload = {
          provider: "discord",
          username: account.username || account.provider_user_id,
          provider_user_id: account.provider_user_id,
          membership,
          checked_at: new Date().toISOString(),
          source: "discord_member_check",
        };
        award = await awardQuestForUser(user.id, quest.slug, "discord_join_verified", verificationPayload);
        await maybeVerifyReferralForUser(user.id).catch(() => undefined);
        await writeVerificationLog({
          userId: user.id,
          completionId: award.completionId,
          verificationType: quest.verification_type,
          status: "verified",
          message: "Discord server membership confirmed.",
          metadata: verificationPayload,
        });
      } else {
        await writeVerificationLog({
          userId: user.id,
          verificationType: quest.verification_type,
          status: "pending",
          message: membership.error || "Discord server membership was not confirmed.",
          metadata: { provider: "discord", username: account.username || account.provider_user_id, membership },
        });
      }
    }

    return res.status(200).json({
      ok: true,
      provider: "discord",
      username: account.username || account.provider_user_id,
      membership,
      questSlug: quest?.slug || null,
      status: questStatus,
      award,
      inviteUrl: process.env.DISCORD_INVITE_URL || null,
    });
  } catch (error) {
    console.error("[war-missions/discord-member-check] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
