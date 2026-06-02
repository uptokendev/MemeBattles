import { pool } from "../../server/db.js";
import { dailyQuestSlugs, ensureCurrentQuestInstance, utcDateString } from "./_lib/periods.js";

const COMPLETE_DAILY_WARPATH_SLUG = "complete-daily-warpath";
const BASE_DAILY_QUEST_SLUGS = [...dailyQuestSlugs].filter((slug) => slug !== COMPLETE_DAILY_WARPATH_SLUG);

function requireInternalToken(req, res) {
  const expected = String(
    process.env.WAR_MISSIONS_INTERNAL_TOKEN ||
      process.env.RANK_EVENTS_TOKEN ||
      process.env.INTERNAL_API_TOKEN ||
      ""
  ).trim();

  if (!expected) {
    res.status(500).json({ ok: false, error: "WAR_MISSIONS_INTERNAL_TOKEN is not configured." });
    return false;
  }

  const got = String(
    req.headers["x-war-missions-internal-token"] ||
      req.headers["x-rank-events-token"] ||
      req.query?.token ||
      req.body?.token ||
      ""
  ).trim();

  if (got !== expected) {
    res.status(401).json({ ok: false, error: "Invalid internal token." });
    return false;
  }

  return true;
}

function parseRolloverDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return utcDateString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("date must be YYYY-MM-DD in UTC.");
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || utcDateString(parsed) !== raw) throw new Error("date must be a valid UTC calendar date.");
  return raw;
}

function dateAtNoonUtc(dateUtc) {
  return new Date(`${dateUtc}T12:00:00.000Z`);
}

function addUtcDays(dateUtc, days) {
  const date = new Date(`${dateUtc}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDateString(date);
}

async function getTemplatesBySlug(slugs) {
  const { rows } = await pool.query(
    `
      select *
      from public.wm_quest_templates
      where active = true and slug = any($1::text[])
      order by slug asc
    `,
    [slugs],
  );
  return new Map(rows.map((row) => [row.slug, row]));
}

async function ensureDailyInstancesForDate(dateUtc) {
  const templatesBySlug = await getTemplatesBySlug([...dailyQuestSlugs]);
  const instancesBySlug = new Map();
  const missingSlugs = [];
  const now = dateAtNoonUtc(dateUtc);

  for (const slug of dailyQuestSlugs) {
    const template = templatesBySlug.get(slug);
    if (!template) {
      missingSlugs.push(slug);
      continue;
    }
    const instance = await ensureCurrentQuestInstance(template, now);
    instancesBySlug.set(slug, instance);
  }

  return { templatesBySlug, instancesBySlug, missingSlugs };
}

async function summarizeDailyCompletions(instanceIds) {
  if (instanceIds.length === 0) return [];
  const { rows } = await pool.query(
    `
      select
        qc.user_id,
        u.wallet_address,
        count(distinct qt.slug)::int as verified_count,
        array_agg(distinct qt.slug order by qt.slug) as verified_slugs
      from public.wm_quest_completions qc
      join public.wm_quest_instances qi on qi.id = qc.quest_instance_id
      join public.wm_quest_templates qt on qt.id = qi.quest_template_id
      join public.wm_users u on u.id = qc.user_id
      where qc.status = 'verified'
        and qc.quest_instance_id = any($1::uuid[])
        and u.is_banned = false
      group by qc.user_id, u.wallet_address
      order by verified_count desc, u.wallet_address asc
    `,
    [instanceIds],
  );
  return rows;
}

async function ensureDailyProgressRow(userId, dateUtc) {
  const { rows } = await pool.query(
    `
      insert into public.wm_daily_progress (user_id, date_utc, quests_completed, daily_xp_earned, completed_all, streak_count)
      values ($1, $2, 0, 0, false, 0)
      on conflict (user_id, date_utc) do update set updated_at = public.wm_daily_progress.updated_at
      returning *
    `,
    [userId, dateUtc],
  );
  return rows[0] || null;
}

async function getPreviousStreak(userId, dateUtc) {
  const previousDate = addUtcDays(dateUtc, -1);
  const { rows } = await pool.query(
    `
      select streak_count, completed_all
      from public.wm_daily_progress
      where user_id = $1 and date_utc = $2
      limit 1
    `,
    [userId, previousDate],
  );
  const previous = rows[0];
  return previous?.completed_all ? Number(previous.streak_count || 0) : 0;
}

async function awardCompleteDailyWarpath({ userId, dateUtc, template, instance, verifiedSlugs }) {
  const now = new Date().toISOString();
  const verificationPayload = {
    source: "daily_rollover",
    date_utc: dateUtc,
    verified_daily_slugs: verifiedSlugs,
    required_daily_slugs: BASE_DAILY_QUEST_SLUGS,
    awarded_at: now,
  };

  const existingResult = await pool.query(
    `
      select id, status
      from public.wm_quest_completions
      where user_id = $1 and quest_instance_id = $2
      limit 1
    `,
    [userId, instance.id],
  );
  const existing = existingResult.rows[0] || null;

  let completionId = existing?.id || null;
  if (existing?.status === "verified") {
    completionId = existing.id;
  } else if (existing) {
    const { rows } = await pool.query(
      `
        update public.wm_quest_completions
        set status = 'verified',
            submitted_value = 'daily_rollover',
            verification_payload = $2::jsonb,
            rejection_reason = null,
            verified_at = $3,
            updated_at = $3
        where id = $1
        returning *
      `,
      [existing.id, JSON.stringify(verificationPayload), now],
    );
    completionId = rows[0]?.id || existing.id;
  } else {
    const { rows } = await pool.query(
      `
        insert into public.wm_quest_completions
          (user_id, quest_instance_id, status, submitted_value, verification_payload, verified_at, updated_at)
        values ($1, $2, 'verified', 'daily_rollover', $3::jsonb, $4, $4)
        returning *
      `,
      [userId, instance.id, JSON.stringify(verificationPayload), now],
    );
    completionId = rows[0]?.id || null;
  }

  if (!completionId) throw new Error("Unable to award complete daily warpath quest.");

  const ledgerResult = await pool.query(
    `select id from public.wm_xp_ledger where quest_completion_id = $1 and status = 'active' limit 1`,
    [completionId],
  );
  const alreadyAwarded = Boolean(ledgerResult.rows[0]);
  const amount = Number(instance.xp_reward || template.xp_reward || 0);

  if (!alreadyAwarded) {
    await pool.query(
      `
        insert into public.wm_xp_ledger (user_id, quest_completion_id, amount, status, reason)
        values ($1, $2, $3, 'active', 'daily_rollover:complete_daily_warpath')
      `,
      [userId, completionId, amount],
    );
  }

  const previousStreak = await getPreviousStreak(userId, dateUtc);
  await ensureDailyProgressRow(userId, dateUtc);
  await pool.query(
    `
      update public.wm_daily_progress
      set completed_all = true,
          quests_completed = greatest(coalesce(quests_completed, 0), $3),
          daily_xp_earned = coalesce(daily_xp_earned, 0) + $4,
          streak_count = greatest(coalesce(streak_count, 0), $5),
          raffle_tickets_earned = greatest(coalesce(raffle_tickets_earned, 0), $6),
          updated_at = now()
      where user_id = $1 and date_utc = $2
    `,
    [
      userId,
      dateUtc,
      BASE_DAILY_QUEST_SLUGS.length + 1,
      alreadyAwarded ? 0 : amount,
      previousStreak + 1,
      1,
    ],
  );

  return { completionId, awarded: !alreadyAwarded, xpAwarded: alreadyAwarded ? 0 : amount };
}

async function finalizeDailyProgressForPartialUsers({ dateUtc, summaries }) {
  const updates = [];
  for (const summary of summaries) {
    await ensureDailyProgressRow(summary.user_id, dateUtc);
    const previousStreak = await getPreviousStreak(summary.user_id, dateUtc);
    const completedAll = Number(summary.verified_count || 0) >= BASE_DAILY_QUEST_SLUGS.length;
    await pool.query(
      `
        update public.wm_daily_progress
        set quests_completed = greatest(coalesce(quests_completed, 0), $3),
            completed_all = completed_all or $4,
            streak_count = case when completed_all or $4 then greatest(coalesce(streak_count, 0), $5) else coalesce(streak_count, 0) end,
            updated_at = now()
        where user_id = $1 and date_utc = $2
      `,
      [summary.user_id, dateUtc, Number(summary.verified_count || 0), completedAll, previousStreak + 1],
    );
    updates.push({
      userId: summary.user_id,
      walletAddress: summary.wallet_address,
      verifiedCount: Number(summary.verified_count || 0),
      completedAll,
    });
  }
  return updates;
}

export default async function wmDailyRollover(req, res) {
  if (!["POST", "GET"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });
  if (!requireInternalToken(req, res)) return;

  try {
    const dateUtc = parseRolloverDate(req.body?.date || req.query?.date);
    const dryRun = String(req.body?.dryRun ?? req.query?.dryRun ?? "").toLowerCase() === "true";

    const { templatesBySlug, instancesBySlug, missingSlugs } = await ensureDailyInstancesForDate(dateUtc);
    const baseInstanceIds = BASE_DAILY_QUEST_SLUGS
      .map((slug) => instancesBySlug.get(slug)?.id)
      .filter(Boolean);
    const summaries = await summarizeDailyCompletions(baseInstanceIds);
    const eligible = summaries.filter((summary) => Number(summary.verified_count || 0) >= BASE_DAILY_QUEST_SLUGS.length);

    const progressUpdates = dryRun ? [] : await finalizeDailyProgressForPartialUsers({ dateUtc, summaries });
    const awarded = [];
    const completeTemplate = templatesBySlug.get(COMPLETE_DAILY_WARPATH_SLUG);
    const completeInstance = instancesBySlug.get(COMPLETE_DAILY_WARPATH_SLUG);

    if (!dryRun && completeTemplate && completeInstance) {
      for (const summary of eligible) {
        const result = await awardCompleteDailyWarpath({
          userId: summary.user_id,
          dateUtc,
          template: completeTemplate,
          instance: completeInstance,
          verifiedSlugs: summary.verified_slugs || [],
        });
        awarded.push({
          userId: summary.user_id,
          walletAddress: summary.wallet_address,
          ...result,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      dryRun,
      dateUtc,
      requiredDailySlugs: BASE_DAILY_QUEST_SLUGS,
      missingSlugs,
      dailyInstancesEnsured: instancesBySlug.size,
      usersWithDailyProgress: summaries.length,
      eligibleForCompleteDailyWarpath: eligible.length,
      completeDailyWarpathAwarded: awarded.filter((item) => item.awarded).length,
      completeDailyWarpathAlreadyAwarded: awarded.filter((item) => !item.awarded).length,
      progressUpdates,
      awarded,
    });
  } catch (error) {
    console.error("[war-missions/daily-rollover] failed", error);
    const message = error?.message || "Unexpected server error.";
    const status = /date must/i.test(message) ? 400 : 500;
    return res.status(status).json({ ok: false, error: message });
  }
}
