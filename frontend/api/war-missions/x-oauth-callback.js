import { pool } from "../../server/db.js";
import { getUserById } from "./_lib/profile.js";
import {
  fetchXCurrentUser,
  isXOAuthConfigured,
  upsertXAccount,
  verifyXFollowQuestForUser,
} from "./_lib/x-follow.js";

function questsUrl(params = {}) {
  const url = new URL(String(process.env.WAR_MISSIONS_QUESTS_URL || "https://quests.memewar.zone"));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function xRedirectUri(req) {
  const configured = String(process.env.X_REDIRECT_URI || "").trim();
  if (configured) return configured;

  const proto = String(req.headers?.["x-forwarded-proto"] || "https");
  const host = String(req.headers?.host || "quests.memewar.zone");
  return `${proto}://${host}/api/wm-x-oauth-callback`;
}

async function consumeXChallenge(token) {
  const { rows } = await pool.query(
    `
      update public.wm_social_link_challenges
      set consumed_at = now()
      where id = (
        select id
        from public.wm_social_link_challenges
        where provider = 'x'
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

async function exchangeCodeForToken({ code, redirectUri, codeVerifier }) {
  const clientId = String(process.env.X_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.X_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret || !isXOAuthConfigured()) {
    throw new Error("X follow verification is not configured yet.");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("code_verifier", codeVerifier);
  body.set("client_id", clientId);

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.access_token) {
    throw new Error(json?.error_description || json?.error || `X token exchange failed (${response.status}).`);
  }

  return json;
}

export default async function wmXOAuthCallback(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  try {
    const error = String(req.query?.error || "").trim();
    if (error) return res.redirect(questsUrl({ social_error: error }));

    const code = String(req.query?.code || "").trim();
    const state = String(req.query?.state || "").trim();
    if (!code || !state) return res.redirect(questsUrl({ social_error: "x_missing_code" }));

    const challenge = await consumeXChallenge(state);
    if (!challenge) return res.redirect(questsUrl({ social_error: "x_link_expired" }));

    const user = await getUserById(challenge.user_id);
    if (!user || user.is_banned) return res.redirect(questsUrl({ social_error: "x_user_not_allowed" }));

    const token = await exchangeCodeForToken({
      code,
      redirectUri: xRedirectUri(req),
      codeVerifier: state,
    });
    const xUser = await fetchXCurrentUser(token.access_token);
    await upsertXAccount({ userId: user.id, xUser });

    const verification = await verifyXFollowQuestForUser(user, "x_oauth_callback", {
      x: {
        id: xUser.id,
        username: xUser.username || null,
        name: xUser.name || null,
        profileImageUrl: xUser.profile_image_url || null,
      },
    });

    return res.redirect(
      questsUrl({ social: verification.follow?.ok ? "x-connected-and-following" : "x-connected" }),
    );
  } catch (error) {
    console.error("[war-missions/x-oauth-callback] failed", error);
    return res.redirect(questsUrl({ social_error: error?.message || "x_connection_failed" }));
  }
}
