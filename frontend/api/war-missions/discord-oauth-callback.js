import { pool } from "../../server/db.js";
import { getUserById } from "./_lib/profile.js";
import { submitSocialStartHereQuest } from "./_lib/social-quests.js";

function questsUrl(params = {}) {
  const url = new URL(String(process.env.WAR_MISSIONS_QUESTS_URL || "https://quests.memewar.zone"));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function discordRedirectUri(req) {
  const configured = String(process.env.DISCORD_REDIRECT_URI || "").trim();
  if (configured) return configured;

  const proto = String(req.headers?.["x-forwarded-proto"] || "https");
  const host = String(req.headers?.host || "quests.memewar.zone");
  return `${proto}://${host}/api/wm-discord-oauth-callback`;
}

async function consumeDiscordChallenge(token) {
  const { rows } = await pool.query(
    `
      update public.wm_social_link_challenges
      set consumed_at = now()
      where id = (
        select id
        from public.wm_social_link_challenges
        where provider = 'discord'
          and token = $1
          and consumed_at is null
          and expires_at > now()
        order by created_at desc
        limit 1
      )
      returning *
    `,
    [token],
  );
  return rows[0] || null;
}

async function exchangeCodeForToken({ code, redirectUri }) {
  const clientId = String(process.env.DISCORD_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.DISCORD_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) throw new Error("Discord OAuth is not configured yet.");

  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.access_token) {
    throw new Error(json?.error_description || json?.error || `Discord token exchange failed (${response.status}).`);
  }

  return json;
}

async function fetchDiscordUser(accessToken) {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.id) {
    throw new Error(json?.message || `Discord user lookup failed (${response.status}).`);
  }

  return json;
}

async function getDiscordGuildMemberStatus(discordUserId) {
  const botToken = String(process.env.DISCORD_BOT_TOKEN || "").trim();
  const guildId = String(process.env.DISCORD_REQUIRED_GUILD_ID || "").trim();

  if (!botToken || !guildId || !discordUserId) {
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

function discordDisplayName(discordUser) {
  const globalName = String(discordUser?.global_name || "").trim();
  if (globalName) return globalName;
  const username = String(discordUser?.username || "").trim();
  const discriminator = String(discordUser?.discriminator || "").trim();
  if (username && discriminator && discriminator !== "0") return `${username}#${discriminator}`;
  return username || String(discordUser?.id || "").trim();
}

async function upsertDiscordAccount({ userId, discordUser }) {
  const providerUserId = String(discordUser.id);
  const username = discordDisplayName(discordUser);

  const { rows: reusedRows } = await pool.query(
    `
      select id, user_id
      from public.wm_social_accounts
      where provider = 'discord' and provider_user_id = $1
      limit 1
    `,
    [providerUserId],
  );

  if (reusedRows[0] && reusedRows[0].user_id !== userId) {
    const error = new Error("This Discord account is already linked to another wallet.");
    error.statusCode = 409;
    throw error;
  }

  const { rows: currentRows } = await pool.query(
    `
      select id
      from public.wm_social_accounts
      where provider = 'discord' and user_id = $1
      limit 1
    `,
    [userId],
  );

  if (currentRows[0]) {
    await pool.query(
      `
        update public.wm_social_accounts
        set provider_user_id = $2,
            username = $3,
            last_verified_at = now()
        where id = $1
      `,
      [currentRows[0].id, providerUserId, username],
    );
  } else {
    await pool.query(
      `
        insert into public.wm_social_accounts
          (user_id, provider, provider_user_id, username, last_verified_at)
        values ($1, 'discord', $2, $3, now())
      `,
      [userId, providerUserId, username],
    );
  }

  return { providerUserId, username };
}

export default async function wmDiscordOAuthCallback(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  try {
    const error = String(req.query?.error || "");
    if (error) {
      return res.redirect(questsUrl({ social_error: error }));
    }

    const code = String(req.query?.code || "").trim();
    const state = String(req.query?.state || "").trim();
    const guildId = String(req.query?.guild_id || "").trim();

    // Discord bot installs are callback-less. If a generated bot invite accidentally redirects here,
    // do not treat it as a user social-link attempt.
    if (code && guildId && !state) {
      return res.redirect(questsUrl({ discord_bot_added: "1" }));
    }

    if (!code || !state) return res.redirect(questsUrl({ social_error: "discord_missing_code" }));

    const challenge = await consumeDiscordChallenge(state);
    if (!challenge) return res.redirect(questsUrl({ social_error: "discord_link_expired" }));

    const user = await getUserById(challenge.user_id);
    if (!user || user.is_banned) return res.redirect(questsUrl({ social_error: "discord_user_not_allowed" }));

    const token = await exchangeCodeForToken({ code, redirectUri: discordRedirectUri(req) });
    const discordUser = await fetchDiscordUser(token.access_token);
    const membership = await getDiscordGuildMemberStatus(discordUser.id);
    const linked = await upsertDiscordAccount({ userId: user.id, discordUser });

    await submitSocialStartHereQuest({
      user,
      provider: "discord",
      username: linked.username,
      providerUserId: linked.providerUserId,
      verified: true,
      source: "discord_oauth_callback",
      note: membership.ok
        ? "Discord identity linked and required server membership confirmed."
        : "Discord identity linked through OAuth. Server membership check was not confirmed yet.",
      manualFallback: false,
      metadata: {
        discord: {
          id: discordUser.id,
          username: discordUser.username || null,
          globalName: discordUser.global_name || null,
          discriminator: discordUser.discriminator || null,
          avatar: discordUser.avatar || null,
        },
        membership,
      },
    });

    return res.redirect(questsUrl({ social: "discord-connected" }));
  } catch (error) {
    console.error("[war-missions/discord-oauth-callback] failed", error);
    return res.redirect(questsUrl({ social_error: error?.message || "discord_connection_failed" }));
  }
}
