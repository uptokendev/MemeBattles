import { readWarAuth } from "./_lib/auth.js";
import { buildWarProfile, getBadgesForUser, getUserById } from "./_lib/profile.js";

export default async function wmBadgesList(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  try {
    const auth = readWarAuth(req);
    if (!auth) {
      const badgeState = await getBadgesForUser(null);
      return res.status(200).json({ ok: true, authenticated: false, ...badgeState });
    }

    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address || user.is_banned) {
      const badgeState = await getBadgesForUser(null);
      return res.status(200).json({ ok: true, authenticated: false, ...badgeState });
    }

    const profile = await buildWarProfile(user);
    return res.status(200).json({
      ok: true,
      authenticated: true,
      badges: profile.badges,
      badgeSummary: profile.badgeSummary,
    });
  } catch (error) {
    console.error("[war-missions/badges-list] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
