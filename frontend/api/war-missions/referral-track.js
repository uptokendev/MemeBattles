import { readWarAuth } from "./_lib/auth.js";
import { getUserById } from "./_lib/profile.js";
import {
  clearReferralCookie,
  createReferralCookie,
  getActiveReferralLinkByCode,
  linkReferralToUser,
  readReferralCode,
} from "./_lib/referrals.js";

function getCode(req) {
  return String(req.body?.code || req.query?.code || readReferralCode(req) || "").trim();
}

export default async function wmReferralTrack(req, res) {
  if (!["GET", "POST", "DELETE"].includes(String(req.method || "").toUpperCase())) {
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearReferralCookie(req));
    return res.status(200).json({ ok: true, tracked: false, cleared: true });
  }

  try {
    const code = getCode(req);
    if (!code) return res.status(400).json({ ok: false, error: "Referral code is required." });

    const referralLink = await getActiveReferralLinkByCode(code);
    if (!referralLink) {
      res.setHeader("Set-Cookie", clearReferralCookie(req));
      return res.status(404).json({ ok: false, error: "Referral code was not found." });
    }

    const cookies = [createReferralCookie(req, referralLink.code)];
    const auth = readWarAuth(req);
    let linked = null;
    if (auth?.userId) {
      const user = await getUserById(auth.userId);
      if (user && user.wallet_address === auth.address) {
        linked = await linkReferralToUser({
          recruiterUserId: referralLink.recruiter_user_id,
          referredUserId: user.id,
          referralCode: referralLink.code,
        });
      }
    }

    res.setHeader("Set-Cookie", cookies);
    return res.status(200).json({
      ok: true,
      tracked: true,
      referralCode: referralLink.code,
      linked,
    });
  } catch (error) {
    console.error("[war-missions/referral-track] failed", error);
    return res.status(500).json({ ok: false, error: error?.message || "Unexpected server error." });
  }
}
