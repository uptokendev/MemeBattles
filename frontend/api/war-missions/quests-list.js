import { pool } from "../../server/db.js";
import { readWarAuth } from "./_lib/auth.js";
import { ensureCurrentQuestInstances } from "./_lib/periods.js";
import { buildWarProfile, getUserById } from "./_lib/profile.js";

async function getOptionalProfile(req) {
  const auth = readWarAuth(req);
  if (!auth) return null;

  const user = await getUserById(auth.userId);
  if (!user || user.wallet_address !== auth.address || user.is_banned) return null;
  return buildWarProfile(user);
}

function normalizeQuest(template, instance, completion) {
  return {
    instanceId: instance?.id || null,
    templateId: template.id,
    slug: template.slug,
    title: template.title,
    description: template.description,
    xpReward: Number(instance?.xp_reward || template.xp_reward || 0),
    verificationType: template.verification_type,
    repeatable: Boolean(template.repeatable),
    periodType: instance?.period_type || null,
    metadata: { ...(template.metadata || {}), ...(instance?.metadata || {}) },
    status: completion?.status || null,
    rejectionReason: completion?.rejection_reason || null,
  };
}

export default async function wmQuestsList(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  try {
    const [categoriesResult, templatesResult, profile] = await Promise.all([
      pool.query(`select * from public.wm_quest_categories where active = true order by display_order asc`),
      pool.query(`select * from public.wm_quest_templates where active = true order by created_at asc`),
      getOptionalProfile(req),
    ]);

    const categories = categoriesResult.rows;
    const templates = templatesResult.rows;
    const instanceByTemplateId = await ensureCurrentQuestInstances(templates);

    let completions = [];
    if (profile?.id) {
      const completionsResult = await pool.query(
        `
          select *
          from public.wm_quest_completions
          where user_id = $1
          order by updated_at desc
        `,
        [profile.id],
      );
      completions = completionsResult.rows;
    }

    const completionByInstanceId = new Map(completions.map((completion) => [completion.quest_instance_id, completion]));
    const questsByCategoryId = new Map();

    for (const template of templates) {
      const instance = instanceByTemplateId.get(template.id) || null;
      const completion = instance ? completionByInstanceId.get(instance.id) || null : null;
      const quest = normalizeQuest(template, instance, completion);
      questsByCategoryId.set(template.category_id, [...(questsByCategoryId.get(template.category_id) || []), quest]);
    }

    return res.status(200).json({
      ok: true,
      profile,
      categories: categories.map((category) => ({
        slug: category.slug,
        title: category.title,
        description: category.description,
        displayOrder: category.display_order,
        quests: questsByCategoryId.get(category.id) || [],
      })),
    });
  } catch (error) {
    console.error("[war-missions/quests-list] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
