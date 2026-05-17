import { pool } from "../../../server/db.js";

export const dailyQuestSlugs = new Set([
  "drop-frontline-propaganda",
  "provide-covering-fire",
  "relay-the-battleplan",
  "maintain-radio-discipline",
  "complete-daily-warpath",
]);

export const blackMarketQuestSlugs = new Set([
  "signal-leak",
  "broadcasting-static",
  "viral-contagion",
  "total-info-dominance",
]);

export function utcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function getTemplatePeriodType(template) {
  const configured = typeof template.metadata?.period_type === "string" ? template.metadata.period_type : "";
  if (["daily", "weekly", "season", "once"].includes(configured)) return configured;
  if (!template.repeatable) return "once";
  if (dailyQuestSlugs.has(template.slug) || template.max_completions_per_day) return "daily";
  if (blackMarketQuestSlugs.has(template.slug) || template.max_completions_per_week) return "weekly";
  return "daily";
}

export function getPeriodWindow(periodType, now = new Date()) {
  if (periodType === "once") return { periodStart: null, periodEnd: null };

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (periodType === "weekly") {
    const day = start.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setUTCDate(start.getUTCDate() + mondayOffset);
  }
  if (periodType === "season") start.setUTCDate(1);

  const end = new Date(start);
  if (periodType === "daily") end.setUTCDate(end.getUTCDate() + 1);
  if (periodType === "weekly") end.setUTCDate(end.getUTCDate() + 7);
  if (periodType === "season") end.setUTCMonth(end.getUTCMonth() + 1);

  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

async function getExistingCurrentInstance(template, periodType, periodStart, periodEnd) {
  if (periodType === "once") {
    const { rows } = await pool.query(
      `
        select *
        from public.wm_quest_instances
        where quest_template_id = $1 and period_type = 'once' and active = true
        order by created_at asc
        limit 1
      `,
      [template.id],
    );
    return rows[0] || null;
  }

  if (!periodStart || !periodEnd) return null;
  const { rows } = await pool.query(
    `
      select *
      from public.wm_quest_instances
      where quest_template_id = $1
        and period_type = $2
        and period_start >= $3
        and period_start < $4
      order by created_at asc
      limit 1
    `,
    [template.id, periodType, periodStart, periodEnd],
  );
  return rows[0] || null;
}

async function deactivateStaleInstances(template, periodType, periodStart) {
  if (periodType === "once") return;

  await pool.query(
    `
      update public.wm_quest_instances
      set active = false
      where quest_template_id = $1
        and period_type = $2
        and active = true
        and period_start is null
    `,
    [template.id, periodType],
  ).catch(() => undefined);

  if (periodStart) {
    await pool.query(
      `
        update public.wm_quest_instances
        set active = false
        where quest_template_id = $1
          and period_type = $2
          and active = true
          and period_start < $3
      `,
      [template.id, periodType, periodStart],
    ).catch(() => undefined);
  }
}

export async function ensureCurrentQuestInstance(template, now = new Date()) {
  const periodType = getTemplatePeriodType(template);
  const { periodStart, periodEnd } = getPeriodWindow(periodType, now);
  const existing = await getExistingCurrentInstance(template, periodType, periodStart, periodEnd);
  await deactivateStaleInstances(template, periodType, periodStart);
  if (existing) return existing;

  const metadata = {
    ...(template.metadata || {}),
    generated_by: "war_periods",
    generated_at: now.toISOString(),
  };

  try {
    const { rows } = await pool.query(
      `
        insert into public.wm_quest_instances
          (quest_template_id, period_type, period_start, period_end, xp_reward, active, metadata)
        values ($1, $2, $3, $4, $5, true, $6::jsonb)
        returning *
      `,
      [template.id, periodType, periodStart, periodEnd, Number(template.xp_reward || 0), JSON.stringify(metadata)],
    );
    if (rows[0]) return rows[0];
  } catch (error) {
    const retry = await getExistingCurrentInstance(template, periodType, periodStart, periodEnd);
    if (retry) return retry;
    throw error;
  }

  throw new Error("Unable to generate current quest instance.");
}

export async function ensureCurrentQuestInstances(templates, now = new Date()) {
  const entries = [];
  for (const template of templates) {
    const instance = await ensureCurrentQuestInstance(template, now);
    entries.push([template.id, instance]);
  }
  return new Map(entries);
}
