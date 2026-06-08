import { pool } from "../../server/db.js";
import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { getUserById } from "./_lib/profile.js";
import { checkTelegramMembership, verifyCommunityJoinQuestForUser } from "./_lib/community-membership.js";

export default async function wmTelegramMemberCheck(req, res) {
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
        where user_id = $1 and provider = 'telegram'
        limit 1
      `,
      [user.id],
    );

    const account = rows[0];
    if (!account) {
      return res.status(409).json({
        ok: false,
        code: "telegram_account_not_linked",
        error: "Telegram account must be connected once for identity verification before this join quest can be checked.",
      });
    }

    const membership = await checkTelegramMembership(account.provider_user_id);
    const result = await verifyCommunityJoinQuestForUser(user, "telegram", "telegram_member_check_endpoint");

    return res.status(200).json({
      ok: true,
      provider: "telegram",
      username: account.username || account.provider_user_id,
      membership,
      result,
      questSlug: "access-underground-comms",
      status: membership.ok ? "verified" : "pending",
      inviteUrl: process.env.TELEGRAM_INVITE_URL || null,
    });
  } catch (error) {
    console.error("[war-missions/telegram-member-check] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
