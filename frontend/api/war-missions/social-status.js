import { pool } from "../../server/db.js";
import { readWarAuth } from "./_lib/auth.js";
import { buildWarProfile, getUserById } from "./_lib/profile.js";
import { verifyCommunityJoinQuestsForUser } from "./_lib/community-membership.js";
import { isXOAuthConfigured, verifyXFollowQuestForUser } from "./_lib/x-follow.js";

function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME);
}

function isDiscordConfigured() {
  return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_REDIRECT_URI);
}

function socialConfig() {
  return {
    xOAuthConfigured: isXOAuthConfigured(),
    telegramConfigured: isTelegramConfigured(),
    telegramInviteUrl: process.env.TELEGRAM_INVITE_URL || null,
    discordConfigured: isDiscordConfigured(),
    discordInviteUrl: process.env.DISCORD_INVITE_URL || null,
    questsUrl: process.env.WAR_MISSIONS_QUESTS_URL || "https://quests.memewar.zone",
  };
}

export default async function wmSocialStatus(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const unauthenticated = {
    ok: true,
    authenticated: false,
    ...socialConfig(),
    profile: null,
    accounts: [],
    communityChecks: [],
  };

  try {
    const auth = readWarAuth(req);
    if (!auth) return res.status(200).json(unauthenticated);

    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address || user.is_banned) return res.status(200).json(unauthenticated);

    const [communityChecks, xFollowCheck, accountsResult, profile] = await Promise.all([
      verifyCommunityJoinQuestsForUser(user, "social_status_auto_check").catch((error) => [{
        ok: false,
        error: error?.message || "Community membership auto-check failed.",
      }]),
      verifyXFollowQuestForUser(user, "social_status_auto_check").catch((error) => ({
        linked: false,
        follow: { checked: false, ok: false, status: null, error: error?.message || "X follow auto-check failed." },
      })),
      pool.query(
        `
          select provider, provider_user_id, username, last_verified_at
          from public.wm_social_accounts
          where user_id = $1
          order by provider asc
        `,
        [user.id],
      ),
      buildWarProfile(user),
    ]);

    return res.status(200).json({
      ok: true,
      authenticated: true,
      ...socialConfig(),
      profile,
      accounts: accountsResult.rows.map((account) => ({
        provider: account.provider,
        providerUserId: account.provider_user_id,
        username: account.username || account.provider_user_id,
        lastVerifiedAt: account.last_verified_at || null,
        createdAt: null,
      })),
      communityChecks: [
        ...communityChecks,
        {
          provider: "x",
          linked: Boolean(xFollowCheck.linked),
          ok: Boolean(xFollowCheck.follow?.ok),
          status: xFollowCheck.follow?.status || null,
          error: xFollowCheck.follow?.error || null,
        },
      ],
    });
  } catch (error) {
    console.error("[war-missions/social-status] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
