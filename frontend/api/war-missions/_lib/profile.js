import { pool } from "../../../server/db.js";

export async function getUserById(userId) {
  const { rows } = await pool.query(
    `select * from public.wm_users where id = $1 limit 1`,
    [userId],
  );
  return rows[0] || null;
}

async function getXpTotal(userId) {
  const { rows } = await pool.query(
    `select coalesce(sum(amount), 0)::int as total from public.wm_xp_ledger where user_id = $1 and status = 'active'`,
    [userId],
  );
  return Number(rows[0]?.total || 0);
}

function utcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function getDailyProgress(userId) {
  const dateUtc = utcDateString();
  const { rows } = await pool.query(
    `
      select date_utc, quests_completed, daily_xp_earned, completed_all, streak_count, raffle_tickets_earned, updated_at
      from public.wm_daily_progress
      where user_id = $1 and date_utc = $2
      limit 1
    `,
    [userId, dateUtc],
  );
  const current = rows[0];
  const tomorrow = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1));
  return {
    dateUtc: current?.date_utc || dateUtc,
    questsCompleted: Number(current?.quests_completed || 0),
    dailyXpEarned: Number(current?.daily_xp_earned || 0),
    completedAll: Boolean(current?.completed_all),
    streakCount: Number(current?.streak_count || 0),
    raffleTicketsEarned: Number(current?.raffle_tickets_earned || 0),
    resetAt: tomorrow.toISOString(),
    updatedAt: current?.updated_at || null,
  };
}

async function getCompletedQuestSlugs(userId) {
  const { rows } = await pool.query(
    `
      select distinct qt.slug
      from public.wm_quest_completions qc
      join public.wm_quest_instances qi on qi.id = qc.quest_instance_id
      join public.wm_quest_templates qt on qt.id = qi.quest_template_id
      where qc.user_id = $1 and qc.status = 'verified'
      order by qt.slug asc
    `,
    [userId],
  );
  return rows.map((row) => row.slug).filter(Boolean);
}

function emptyBadgeSummary() {
  const types = ["identity", "mission", "xp", "streak", "recruiter", "manual"];
  return {
    total: 0,
    unlocked: 0,
    byType: Object.fromEntries(types.map((type) => [type, { total: 0, unlocked: 0 }])),
  };
}

export async function getBadgesForUser(userId = null) {
  const [templatesResult, userBadgesResult] = await Promise.all([
    pool.query(`select * from public.wm_badge_templates where active = true order by display_order asc`),
    userId
      ? pool.query(`select * from public.wm_user_badges where user_id = $1 and revoked_at is null`, [userId])
      : Promise.resolve({ rows: [] }),
  ]);

  const activeBadgeByTemplateId = new Map(userBadgesResult.rows.map((badge) => [badge.badge_template_id, badge]));
  const badges = templatesResult.rows.map((template) => {
    const userBadge = activeBadgeByTemplateId.get(template.id);
    return {
      slug: template.slug,
      title: template.title,
      description: template.description,
      type: template.type,
      rarity: template.rarity,
      iconKey: template.icon_key,
      criteria: template.criteria || {},
      displayOrder: template.display_order,
      unlocked: Boolean(userBadge),
      awardedAt: userBadge?.awarded_at || null,
      source: userBadge?.source || null,
      reason: userBadge?.reason || null,
    };
  });

  const badgeSummary = emptyBadgeSummary();
  badgeSummary.total = badges.length;
  badgeSummary.unlocked = badges.filter((badge) => badge.unlocked).length;
  for (const badge of badges) {
    if (!badgeSummary.byType[badge.type]) badgeSummary.byType[badge.type] = { total: 0, unlocked: 0 };
    badgeSummary.byType[badge.type].total += 1;
    if (badge.unlocked) badgeSummary.byType[badge.type].unlocked += 1;
  }

  return { badges, badgeSummary };
}

export async function buildWarProfile(user) {
  const [xpTotal, completedQuestSlugs, dailyProgress, badgeState] = await Promise.all([
    getXpTotal(user.id),
    getCompletedQuestSlugs(user.id),
    getDailyProgress(user.id),
    getBadgesForUser(user.id),
  ]);

  return {
    id: user.id,
    walletAddress: user.wallet_address,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    role: user.role,
    riskScore: user.risk_score,
    isBanned: user.is_banned,
    xpTotal,
    completedQuestSlugs,
    dailyProgress,
    badges: badgeState.badges,
    badgeSummary: badgeState.badgeSummary,
  };
}

export async function updateUserProfile(userId, body = {}) {
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(body, "displayName")) {
    payload.display_name = body.displayName ? String(body.displayName).trim().slice(0, 80) : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "avatarUrl")) {
    payload.avatar_url = body.avatarUrl ? String(body.avatarUrl).trim().slice(0, 500) : null;
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) return getUserById(userId);

  const assignments = keys.map((key, index) => `${key} = $${index + 2}`).join(", ");
  const values = keys.map((key) => payload[key]);
  const { rows } = await pool.query(
    `update public.wm_users set ${assignments}, updated_at = now() where id = $1 returning *`,
    [userId, ...values],
  );
  if (!rows[0]) throw new Error("Unable to update War Missions profile.");
  return rows[0];
}
