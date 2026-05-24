import crypto from "node:crypto";
import { pool } from "../../server/db.js";
import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { getUserById } from "./_lib/profile.js";

function makeChallengeToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function discordRedirectUri(req) {
  const configured = String(process.env.DISCORD_REDIRECT_URI || "").trim();
  if (configured) return configured;

  const proto = String(req.headers?.["x-forwarded-proto"] || "https");
  const host = String(req.headers?.host || "quests.memewar.zone");
  return `${proto}://${host}/api/wm-discord-oauth-callback`;
}

async function loadReusableChallenge(token) {
  const { rows } = await pool.query(
    `
      select *
      from public.wm_social_link_challenges
      where provider = 'discord'
        and token = $1
        and consumed_at is null
        and expires_at > now()
      order by created_at desc
      limit 1
    `,
    [String(token || "")],
  );
  return rows[0] || null;
}

export default async function wmDiscordOAuthStart(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const clientId = String(process.env.DISCORD_CLIENT_ID || "").trim();
    if (!clientId) return res.status(503).json({ error: "Discord OAuth is not configured yet." });

    const auth = readWarAuth(req);
    const linkToken = String(req.query?.linkToken || "").trim();

    let user = null;
    let token = "";

    if (auth) {
      user = await getUserById(auth.userId);
      if (!user || user.wallet_address !== auth.address) {
        return unauthorized(res, "War Missions session is no longer valid.");
      }
      if (user.is_banned) return res.status(403).json({ error: "This wallet is excluded from War Missions." });

      token = makeChallengeToken();
      await pool.query(
        `
          insert into public.wm_social_link_challenges
            (user_id, provider, token, expires_at)
          values ($1, 'discord', $2, now() + interval '10 minutes')
        `,
        [user.id, token],
      );
    } else if (linkToken) {
      const challenge = await loadReusableChallenge(linkToken);
      if (!challenge) {
        return res.status(401).json({ error: "Discord reconnect link expired. Refresh the quest page and try again." });
      }

      user = await getUserById(challenge.user_id);
      if (!user || user.is_banned) {
        return res.status(403).json({ error: "This wallet is excluded from War Missions." });
      }

      token = challenge.token;
    } else {
      return unauthorized(res);
    }

    const redirectUri = discordRedirectUri(req);
    const url = new URL("https://discord.com/oauth2/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", "identify");
    url.searchParams.set("state", token);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("prompt", "consent");

    if (req.method === "POST") {
      return res.status(200).json({ ok: true, provider: "discord", authorizeUrl: url.toString() });
    }

    return res.redirect(url.toString());
  } catch (error) {
    console.error("[war-missions/discord-oauth-start] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
