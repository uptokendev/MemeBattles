import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { buildWarProfile, getUserById, syncRecruiterMilestoneQuestsForUser } from "./_lib/profile.js";
import { getRecruiterStats } from "./_lib/referrals.js";

export default async function wmReferralStats(req, res) {
  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  try {
    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) return unauthorized(res, "War Missions session is no longer valid.");
    if (user.is_banned) return res.status(403).json({ ok: false, error: "This wallet is excluded from War Missions." });

    await syncRecruiterMilestoneQuestsForUser(user.id).catch(() => undefined);

    const [profile, recruiterStats] = await Promise.all([
      buildWarProfile(user),
      getRecruiterStats(user.id),
    ]);

    return res.status(200).json({
      ok: true,
      profile,
      role: user.role,
      application: recruiterStats.application,
      referralLink: recruiterStats.referralLink,
      summary: recruiterStats.summary,
      recruits: recruiterStats.recruits,
    });
  } catch (error) {
    console.error("[war-missions/referral-stats] failed", error);
    return res.status(500).json({ ok: false, error: error?.message || "Unexpected server error." });
  }
}