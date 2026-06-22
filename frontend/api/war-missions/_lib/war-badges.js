import { pool } from "../../../server/db.js";
import { normalizeAddress } from "./auth.js";

async function getUserByWalletOrId(input) {
  if (input.userId) {
    const { rows } = await pool.query(`select * from public.wm_users where id = $1 limit 1`, [input.userId]);
    return rows[0] || null;
  }

  const walletAddress = normalizeAddress(input.walletAddress || "");
  if (!walletAddress) return null;
  const { rows } = await pool.query(`select * from public.wm_users where lower(wallet_address) = $1 limit 1`, [walletAddress]);
  return rows[0] || null;
}

async function getBadgeTemplateBySlug(slug, activeOnly = true) {
  const { rows } = await pool.query(
    `select * from public.wm_badge_templates where slug = $1 ${activeOnly ? "and active = true" : ""} limit 1`,
    [slug],
  );
  return rows[0] || null;
}

export async function awardBadgeManually(input) {
  const user = await getUserByWalletOrId(input);
  if (!user) throw new Error("Target War Missions user was not found.");

  const template = await getBadgeTemplateBySlug(input.badgeSlug, true);
  if (!template) throw new Error("Badge template was not found.");

  const { rows: existingRows } = await pool.query(
    `select * from public.wm_user_badges where user_id = $1 and badge_template_id = $2 limit 1`,
    [user.id, template.id],
  );
  const existing = existingRows[0] || null;
  const now = new Date().toISOString();
  const metadata = { badge_slug: template.slug, manual_action_at: now };

  if (existing) {
    const { rows } = await pool.query(
      `
        update public.wm_user_badges
        set source = 'admin',
            reason = $2,
            metadata = $3::jsonb,
            awarded_by = $4,
            awarded_at = $5,
            revoked_at = null
        where id = $1
        returning *
      `,
      [existing.id, input.reason, JSON.stringify(metadata), input.adminUserId, now],
    );
    return { user, badge: template, userBadge: rows[0] || existing };
  }

  const { rows } = await pool.query(
    `
      insert into public.wm_user_badges (user_id, badge_template_id, source, reason, metadata, awarded_by, awarded_at)
      values ($1, $2, 'admin', $3, $4::jsonb, $5, $6)
      returning *
    `,
    [user.id, template.id, input.reason, JSON.stringify(metadata), input.adminUserId, now],
  );
  return { user, badge: template, userBadge: rows[0] || null };
}

export async function revokeBadgeManually(input) {
  const user = await getUserByWalletOrId(input);
  if (!user) throw new Error("Target War Missions user was not found.");

  const template = await getBadgeTemplateBySlug(input.badgeSlug, false);
  if (!template) throw new Error("Badge template was not found.");

  const { rows: existingRows } = await pool.query(
    `select * from public.wm_user_badges where user_id = $1 and badge_template_id = $2 limit 1`,
    [user.id, template.id],
  );
  const existing = existingRows[0] || null;
  if (!existing) throw new Error("User does not have this badge yet.");

  const now = new Date().toISOString();
  const { rows } = await pool.query(
    `
      update public.wm_user_badges
      set source = 'admin',
          reason = $2,
          metadata = $3::jsonb,
          awarded_by = $4,
          revoked_at = $5
      where id = $1
      returning *
    `,
    [existing.id, input.reason, JSON.stringify({ ...(existing.metadata || {}), badge_slug: template.slug, manual_revoked_at: now, manual_revoked_by: input.adminUserId }), input.adminUserId, now],
  );

  return { user, badge: template, userBadge: rows[0] || existing };
}
