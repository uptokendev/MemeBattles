import { requireAdmin } from "./_lib/admin-auth.js";
import { writeAdminAuditLog } from "./_lib/admin-audit.js";
import { awardBadgeManually, revokeBadgeManually } from "./_lib/war-badges.js";

export default async function wmAdminBadgeAward(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    const action = String(req.body?.action || "award").trim();
    const badgeSlug = String(req.body?.badgeSlug || "").trim();
    const reason = String(req.body?.reason || "").trim();

    if (!req.body?.userId && !req.body?.walletAddress) return res.status(400).json({ error: "Provide userId or walletAddress." });
    if (!badgeSlug) return res.status(400).json({ error: "Provide badgeSlug." });
    if (!reason) return res.status(400).json({ error: "Provide a reason." });
    if (action !== "award" && action !== "revoke") return res.status(400).json({ error: "Unsupported badge action." });

    const result = action === "revoke"
      ? await revokeBadgeManually({
          userId: req.body?.userId,
          walletAddress: req.body?.walletAddress,
          badgeSlug,
          reason,
          adminUserId: admin.username || "admin",
        })
      : await awardBadgeManually({
          userId: req.body?.userId,
          walletAddress: req.body?.walletAddress,
          badgeSlug,
          reason,
          adminUserId: admin.username || "admin",
        });

    await writeAdminAuditLog({
      adminUserId: admin.username || null,
      action: action === "revoke" ? "badge.revoke" : "badge.award",
      targetType: "wm_user_badge",
      targetId: result.userBadge?.id || null,
      after: {
        user_id: result.user.id,
        wallet_address: result.user.wallet_address,
        badge_slug: result.badge.slug,
        reason,
      },
    }).catch(() => undefined);

    return res.status(200).json({
      ok: true,
      action,
      user: { id: result.user.id, walletAddress: result.user.wallet_address },
      badge: { slug: result.badge.slug, title: result.badge.title },
      userBadge: result.userBadge,
    });
  } catch (error) {
    console.error("[war-missions/admin-badge-award] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
