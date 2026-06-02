import { pool } from "../../../server/db.js";
import { getUserById, getUserByWallet } from "./profile.js";

async function resolveUser({ userId, walletAddress }) {
  if (userId) {
    const user = await getUserById(userId);
    if (user) return user;
  }

  if (walletAddress) {
    const user = await getUserByWallet(walletAddress);
    if (user) return user;
  }

  throw new Error("War Missions user was not found.");
}

async function getBadgeTemplateBySlug(slug) {
  const value = String(slug || "").trim();
  if (!value) throw new Error("Badge slug is required.");

  const { rows } = await pool.query(
    `select * from public.wm_badge_templates where slug = $1 limit 1`,
    [value],
  );
  const badge = rows[0];
  if (!badge) throw new Error("Badge template was not found.");
  return badge;
}

export async function awardBadgeManually({ userId, walletAddress, badgeSlug, reason, adminUserId }) {
  const user = await resolveUser({ userId, walletAddress });
  const badge = await getBadgeTemplateBySlug(badgeSlug);
  const awardReason = String(reason || "Manual admin award").trim();
  const source = "admin";
  const metadata = {
    adminUserId: adminUserId || null,
    reason: awardReason,
  };

  const { rows } = await pool.query(
    `
      insert into public.wm_user_badges
        (user_id, badge_template_id, source, reason, metadata, awarded_at, revoked_at)
      values ($1, $2, $3, $4, $5::jsonb, now(), null)
      on conflict (user_id, badge_template_id) do update
        set source = excluded.source,
            reason = excluded.reason,
            metadata = excluded.metadata,
            awarded_at = coalesce(public.wm_user_badges.awarded_at, now()),
            revoked_at = null
      returning *
    `,
    [user.id, badge.id, source, awardReason, JSON.stringify(metadata)],
  );

  return { user, badge, userBadge: rows[0] || null };
}

export async function revokeBadgeManually({ userId, walletAddress, badgeSlug, reason, adminUserId }) {
  const user = await resolveUser({ userId, walletAddress });
  const badge = await getBadgeTemplateBySlug(badgeSlug);
  const revokeReason = String(reason || "Manual admin revoke").trim();
  const metadata = {
    adminUserId: adminUserId || null,
    reason: revokeReason,
  };

  const { rows } = await pool.query(
    `
      update public.wm_user_badges
      set revoked_at = now(),
          reason = $3,
          metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb
      where user_id = $1
        and badge_template_id = $2
        and revoked_at is null
      returning *
    `,
    [user.id, badge.id, revokeReason, JSON.stringify(metadata)],
  );

  return { user, badge, userBadge: rows[0] || null };
}
