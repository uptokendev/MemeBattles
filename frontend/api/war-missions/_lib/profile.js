import { pool } from "../../../server/db.js";
import { normalizeAddress } from "./auth.js";
import { ensureCurrentQuestInstance } from "./periods.js";
import { getRecruiterMilestoneQuestTargets, getRecruiterProgressCounts } from "./referrals.js";

export async function getUserById(userId) {
  const { rows } = await pool.query(
    `select * from public.wm_users where id = $1 limit 1`,
    [userId],
  );
  return rows[0] || null;
}

export async function getUserByWallet(address) {
  const walletAddress = normalizeAddress(address);
  const { rows } = await pool.query(
    `select * from public.wm_users where lower(wallet_address) = $1 limit 1`,
    [walletAddress],
  );
  return rows[0] || null;
}

export async function ensureUser(address) {
  const walletAddress = normalizeAddress(address);
  const existing = await getUserByWallet(walletAddress);
  if (existing) return existing;

  const { rows } = await pool.query(
    `
      insert into public.wm_users (wallet_address, role)
      values ($1, 'user')
      on conflict (wallet_address) do update set wallet_address = excluded.wallet_address
      returning *
    `,
    [walletAddress],
  );
  if (!rows[0]) throw new Error("Unable to create War Missions profile.");
  return rows[0];
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

async function updateDailyProgressForAward(userId, questSlug, amount) {
  const dailyQuestSlugs = new Set([
    "drop-frontline-propaganda",
    "provide-covering-fire",
    "relay-the-battleplan",
    "maintain-radio-discipline",
    "complete-daily-warpath",
  ]);
  if (!dailyQuestSlugs.has(questSlug)) return;

  const dateUtc = utcDateString();
  const { rows } = await pool.query(
    `select * from public.wm_daily_progress where user_id = $1 and date_utc = $2 limit 1`,
    [userId, dateUtc],
  );
  const existing = rows[0];
  const completedAll = questSlug === "complete-daily-warpath";

  if (existing) {
    await pool.query(
      `
        update public.wm_daily_progress
        set quests_completed = coalesce(quests_completed, 0) + 1,
            daily_xp_earned = coalesce(daily_xp_earned, 0) + $3,
            completed_all = completed_all or $4,
            updated_at = now()
        where user_id = $1 and date_utc = $2
      `,
      [userId, dateUtc, amount, completedAll],
    );
    return;
  }

  await pool.query(
    `
      insert into public.wm_daily_progress
        (user_id, date_utc, quests_completed, daily_xp_earned, completed_all, streak_count)
      values ($1, $2, 1, $3, $4, 0)
    `,
    [userId, dateUtc, amount, completedAll],
  );
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

export async function syncDailyWarpathQuestForUser(userId) {
  const requiredQuestSlugs = [
    "drop-frontline-propaganda",
    "provide-covering-fire",
    "relay-the-battleplan",
    "maintain-radio-discipline",
  ];
  const completedQuestSlugs = new Set(await getCompletedQuestSlugs(userId));

  if (!requiredQuestSlugs.every((slug) => completedQuestSlugs.has(slug))) {
    return { eligible: false, awarded: false, reason: "requirements_incomplete" };
  }

  const result = await awardQuestForUser(userId, "complete-daily-warpath", "daily_warpath_auto_complete", {
    source: "quests_list_auto_sync",
    requiredQuestSlugs,
  });

  return {
    eligible: true,
    awarded: result.awarded,
    reason: result.reason,
    completionId: result.completionId,
  };
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

export async function awardQuestForUser(userId, slug, reason, verificationPayload = {}) {
  const { rows: templateRows } = await pool.query(
    `select * from public.wm_quest_templates where slug = $1 and active = true limit 1`,
    [slug],
  );
  const template = templateRows[0];
  if (!template) return { awarded: false, completionId: null, reason: "quest_template_missing" };

  const instance = await ensureCurrentQuestInstance(template);
  const now = new Date().toISOString();

  const { rows: existingRows } = await pool.query(
    `
      select id, status
      from public.wm_quest_completions
      where user_id = $1 and quest_instance_id = $2
      limit 1
    `,
    [userId, instance.id],
  );

  let completionId = existingRows[0]?.id || null;
  if (existingRows[0]?.status === "verified") {
    completionId = existingRows[0].id;
  } else if (existingRows[0]) {
    const { rows } = await pool.query(
      `
        update public.wm_quest_completions
        set status = 'verified',
            verification_payload = $2::jsonb,
            rejection_reason = null,
            verified_at = $3,
            updated_at = $3
        where id = $1
        returning *
      `,
      [existingRows[0].id, JSON.stringify(verificationPayload), now],
    );
    completionId = rows[0]?.id || existingRows[0].id;
  } else {
    const { rows } = await pool.query(
      `
        insert into public.wm_quest_completions
          (user_id, quest_instance_id, status, submitted_value, verification_payload, verified_at, updated_at)
        values ($1, $2, 'verified', $3, $4::jsonb, $5, $5)
        returning *
      `,
      [userId, instance.id, reason, JSON.stringify(verificationPayload), now],
    );
    completionId = rows[0]?.id || null;
  }

  if (!completionId) throw new Error("Unable to create quest completion.");

  const { rows: ledgerRows } = await pool.query(
    `select id from public.wm_xp_ledger where quest_completion_id = $1 and status = 'active' limit 1`,
    [completionId],
  );
  if (ledgerRows[0]) return { awarded: false, completionId, reason: "already_awarded" };

  const amount = Number(instance.xp_reward || template.xp_reward || 0);
  await pool.query(
    `
      insert into public.wm_xp_ledger (user_id, quest_completion_id, amount, status, reason)
      values ($1, $2, $3, 'active', $4)
    `,
    [userId, completionId, amount, reason],
  );
  await updateDailyProgressForAward(userId, template.slug, amount);
  return { awarded: true, completionId, reason: "awarded" };
}

async function hasCompletedStartHere(userId) {
  const required = ["intercept-global-comms", "access-underground-comms", "report-to-base-camp", "take-the-oath"];
  const completed = new Set(await getCompletedQuestSlugs(userId));
  return required.every((slug) => completed.has(slug));
}

async function syncRecruiterMilestoneQuestsForUsers(recruiterUserIds) {
  const uniqueRecruiterIds = [...new Set((recruiterUserIds || []).filter(Boolean))];
  if (uniqueRecruiterIds.length === 0) return { recruitersSynced: 0, questsAwarded: 0 };

  const targets = await getRecruiterMilestoneQuestTargets();
  if (!targets.length) return { recruitersSynced: uniqueRecruiterIds.length, questsAwarded: 0 };

  let questsAwarded = 0;
  for (const recruiterUserId of uniqueRecruiterIds) {
    const counts = await getRecruiterProgressCounts(recruiterUserId);
    for (const target of targets) {
      const currentCount = target.metric === "startHereRecruits" ? counts.startHereRecruits : counts.verifiedRecruits;
      if (currentCount < target.target) continue;
      const result = await awardQuestForUser(recruiterUserId, target.slug, `recruiter_milestone:${target.metric}`, {
        progressMetric: target.metric,
        requiredCount: target.target,
        currentCount,
      });
      if (result.awarded) questsAwarded += 1;
    }
  }

  return { recruitersSynced: uniqueRecruiterIds.length, questsAwarded };
}

export async function syncRecruiterMilestoneQuestsForUser(recruiterUserId) {
  return syncRecruiterMilestoneQuestsForUsers([recruiterUserId]);
}

export async function maybeVerifyReferralForUser(userId) {
  if (!(await hasCompletedStartHere(userId))) return { verified: false, recruitersSynced: 0, questsAwarded: 0 };

  await pool.query(
    `
      update public.wm_referral_attributions
      set status = 'verified', verified_at = now()
      where referred_user_id = $1 and status = any($2::text[])
    `,
    [userId, ["pending", "linked"]],
  );

  const { rows } = await pool.query(
    `select distinct recruiter_user_id from public.wm_referral_attributions where referred_user_id = $1 and status = 'verified'`,
    [userId],
  );
  const syncResult = await syncRecruiterMilestoneQuestsForUsers(rows.map((row) => row.recruiter_user_id));
  return {
    verified: rows.length > 0,
    recruitersSynced: syncResult.recruitersSynced,
    questsAwarded: syncResult.questsAwarded,
  };
}