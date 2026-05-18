import { pool } from "../../server/db.js";
import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { getUserById } from "./_lib/profile.js";

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
    if (!account) return res.status(404).json({ error: "Discord is not linked yet." });

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

    return res.status(200).json({
      ok: true,
      provider: "discord",
      username: account.username || account.provider_user_id,
      membership,
    });
  } catch (error) {
    console.error("[war-missions/discord-member-check] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
