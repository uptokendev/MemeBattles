import crypto from "node:crypto";
import { pool } from "../../../server/db.js";
import { awardQuestForUser, maybeVerifyReferralForUser } from "./profile.js";
import { submitSocialStartHereQuest } from "./social-quests.js";

const X_FOLLOW_QUEST_SLUG = "intercept-global-comms";
const X_API_BASE = "https://api.x.com/2";

export function normalizeXHandle(value) {
  return String(value || "").trim().replace(/^@+/, "").toLowerCase();
}

export function getXBearerToken() {
  return String(process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN || "").trim();
}

export function getRequiredXTarget() {
  const userId = String(
    process.env.X_REQUIRED_USER_ID ||
      process.env.TWITTER_REQUIRED_USER_ID ||
      process.env.WAR_MISSIONS_X_REQUIRED_USER_ID ||
      "",
  ).trim();
  const username = normalizeXHandle(
    process.env.X_REQUIRED_USERNAME ||
      process.env.TWITTER_REQUIRED_USERNAME ||
      process.env.WAR_MISSIONS_X_REQUIRED_USERNAME ||
      "",
  );
  return { userId: userId || null, username: username || null };
}

export function isXFollowCheckConfigured() {
  const target = getRequiredXTarget();
  return Boolean(getXBearerToken() && (target.userId || target.username));
}

export function isXOAuthConfigured() {
  return Boolean(
    process.env.X_CLIENT_ID &&
      process.env.X_CLIENT_SECRET &&
      process.env.X_REDIRECT_URI &&
      isXFollowCheckConfigured(),
  );
}

export function makePkceVerifier() {
  return crypto.randomBytes(48).toString("base64url");
}

export function pkceChallengeFromVerifier(verifier) {
  return crypto.createHash("sha256").update(String(verifier || "")).digest("base64url");
}

function xHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

async function fetchXJson(url, token) {
  const response = await fetch(url, { headers: xHeaders(token) });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      json?.detail || json?.title || json?.error || `X API request failed (${response.status}).`,
    );
  }
  return json;
}

export async function fetchXCurrentUser(accessToken) {
  const json = await fetchXJson(`${X_API_BASE}/users/me?user.fields=id,name,profile_image_url,username`, accessToken);
  if (!json?.data?.id) throw new Error("X user lookup did not return an id.");
  return json.data;
}

let requiredTargetCache = null;

export async function resolveRequiredXTarget() {
  if (requiredTargetCache) return requiredTargetCache;

  const token = getXBearerToken();
  const configured = getRequiredXTarget();
  if (!token) throw new Error("X bearer token is not configured.");
  if (configured.userId && configured.username) {
    requiredTargetCache = { userId: configured.userId, username: configured.username };
    return requiredTargetCache;
  }
  if (configured.userId) {
    requiredTargetCache = { userId: configured.userId, username: configured.username };
    return requiredTargetCache;
  }
  if (!configured.username) throw new Error("Required X target is not configured.");

  const lookup = await fetchXJson(
    `${X_API_BASE}/users/by/username/${encodeURIComponent(configured.username)}?user.fields=id,username`,
    token,
  );
  const userId = String(lookup?.data?.id || "").trim();
  if (!userId) throw new Error("Required X account could not be resolved.");
  requiredTargetCache = {
    userId,
    username: normalizeXHandle(lookup?.data?.username || configured.username),
  };
  return requiredTargetCache;
}

export async function checkXFollowing(sourceUserId) {
  const normalizedSource = String(sourceUserId || "").trim();
  if (!normalizedSource) {
    return { checked: false, ok: false, status: null, error: "X account is not linked yet." };
  }
  if (!isXFollowCheckConfigured()) {
    return { checked: false, ok: false, status: null, error: "X follow check is not configured." };
  }

  const token = getXBearerToken();
  const target = await resolveRequiredXTarget();
  let pageToken = "";
  let pagesChecked = 0;
  let found = false;

  while (pagesChecked < 20) {
    const url = new URL(`${X_API_BASE}/users/${encodeURIComponent(normalizedSource)}/following`);
    url.searchParams.set("max_results", "1000");
    url.searchParams.set("user.fields", "id,username");
    if (pageToken) url.searchParams.set("pagination_token", pageToken);

    const json = await fetchXJson(url.toString(), token);
    const users = Array.isArray(json?.data) ? json.data : [];
    found = users.some((entry) => {
      const id = String(entry?.id || "").trim();
      const username = normalizeXHandle(entry?.username || "");
      return id === target.userId || (target.username && username === target.username);
    });
    pagesChecked += 1;
    if (found) {
      return {
        checked: true,
        ok: true,
        status: "following",
        error: null,
        sourceUserId: normalizedSource,
        targetUserId: target.userId,
        targetUsername: target.username,
        pagesChecked,
      };
    }

    pageToken = String(json?.meta?.next_token || "").trim();
    if (!pageToken) break;
  }

  return {
    checked: true,
    ok: false,
    status: "not_following",
    error: null,
    sourceUserId: normalizedSource,
    targetUserId: target.userId,
    targetUsername: target.username,
    pagesChecked,
  };
}

export async function getLinkedXAccount(userId) {
  const { rows } = await pool.query(
    `
      select provider_user_id, username
      from public.wm_social_accounts
      where provider = 'x' and user_id = $1
      limit 1
    `,
    [userId],
  );
  return rows[0] || null;
}

export async function upsertXAccount({ userId, xUser }) {
  const providerUserId = String(xUser?.id || "").trim();
  const username = normalizeXHandle(xUser?.username || providerUserId);
  if (!providerUserId) throw new Error("X account did not return a user id.");

  const { rows: reusedRows } = await pool.query(
    `
      select id, user_id
      from public.wm_social_accounts
      where provider = 'x' and provider_user_id = $1
      limit 1
    `,
    [providerUserId],
  );

  if (reusedRows[0] && reusedRows[0].user_id !== userId) {
    const error = new Error("This X account is already linked to another wallet.");
    error.statusCode = 409;
    throw error;
  }

  const { rows: currentRows } = await pool.query(
    `
      select id
      from public.wm_social_accounts
      where provider = 'x' and user_id = $1
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
        values ($1, 'x', $2, $3, now())
      `,
      [userId, providerUserId, username],
    );
  }

  return { providerUserId, username };
}

export async function verifyXFollowQuestForUser(user, source = "x_follow_check", metadata = {}) {
  const account = await getLinkedXAccount(user.id);
  if (!account?.provider_user_id) {
    return { linked: false, follow: { checked: false, ok: false, status: null, error: "X account is not linked yet." } };
  }

  const follow = await checkXFollowing(account.provider_user_id);
  if (!follow.ok) return { linked: true, account, follow, awarded: false };

  const payload = {
    x: {
      id: account.provider_user_id,
      username: account.username || null,
    },
    followCheck: follow,
    ...metadata,
  };

  const questResult = await submitSocialStartHereQuest({
    user,
    provider: "x",
    username: account.username || account.provider_user_id,
    providerUserId: account.provider_user_id,
    verified: true,
    status: "verified",
    source,
    note: "X account linked and required follow confirmed.",
    manualFallback: false,
    metadata: payload,
  });

  const awardResult = await awardQuestForUser(
    user.id,
    X_FOLLOW_QUEST_SLUG,
    `${source}:x_follow`,
    payload,
  );
  await maybeVerifyReferralForUser(user.id).catch(() => undefined);
  await pool.query(
    `
      update public.wm_social_accounts
      set last_verified_at = now()
      where user_id = $1 and provider = 'x'
    `,
    [user.id],
  ).catch(() => undefined);

  return { linked: true, account, follow, questResult, awardResult };
}
