import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { getUserById } from "./_lib/profile.js";
import { verifyXFollowQuestForUser } from "./_lib/x-follow.js";

export default async function wmXFollowCheck(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  try {
    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) {
      return unauthorized(res, "War Missions session is no longer valid.");
    }
    if (user.is_banned) return res.status(403).json({ error: "This wallet is excluded from War Missions." });

    const verification = await verifyXFollowQuestForUser(user, "x_follow_check_endpoint");
    return res.status(200).json({
      ok: true,
      linked: verification.linked,
      account: verification.account
        ? {
            provider: "x",
            providerUserId: verification.account.provider_user_id,
            username: verification.account.username || verification.account.provider_user_id,
          }
        : null,
      follows: Boolean(verification.follow?.ok),
      result: verification.follow || null,
      questSlug: "intercept-global-comms",
      status: verification.follow?.ok ? "verified" : "pending",
      awardResult: verification.awardResult || null,
    });
  } catch (error) {
    console.error("[war-missions/x-follow-check] failed", error);
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({ error: error?.message || "Unexpected server error." });
  }
}
