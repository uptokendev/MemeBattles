import { pool } from "../../server/db.js";
import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { getUserById, maybeVerifyReferralForUser } from "./_lib/profile.js";

const ALLOWED_STATUSES = new Set(["verified", "rejected", "review", "pending", "revoked", "expired"]);

async function requireAdmin(req, res) {
  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  const user = await getUserById(auth.userId);
  if (!user || user.wallet_address !== auth.address) {
    unauthorized(res, "War Missions session is no longer valid.");
    return null;
  }
  if (user.is_banned) {
    res.status(403).json({ error: "This wallet is excluded from War Missions." });
    return null;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required." });
    return null;
  }

  return user;
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ALLOWED_STATUSES.has(status) ? status : "";
}

async function getCompletion(completionId) {
  const { rows } = await pool.query(
    `
      select
        qc.*,
        qi.xp_reward as instance_xp_reward,
        qt.id as template_id,
        qt.slug as quest_slug,
        qt.title as quest_title,
        qt.xp_reward as template_xp_reward,
        qt.verification_type,
        u.wallet_address
      from public.wm_quest_completions qc
      join public.wm_quest_instances qi on qi.id = qc.quest_instance_id
      join public.wm_quest_templates qt on qt.id = qi.quest_template_id
      join public.wm_users u on u.id = qc.user_id
      where qc.id = $1
      limit 1
    `,
    [completionId],
  );
  return rows[0] || null;
}

async function writeVerificationLog(input) {
  await pool.query(
    `
      insert into public.wm_verification_logs
        (user_id, quest_completion_id, provider, verification_type, status, message, metadata)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      input.userId || null,
      input.completionId || null,
      input.provider || "admin",
      input.verificationType || "admin_review",
      input.status,
      input.message,
      JSON.stringify(input.metadata || {}),
    ],
  ).catch(() => undefined);
}

async function closeRelatedNotifications(completionId, status) {
  if (!["verified", "rejected", "revoked", "expired"].includes(status)) return;
  await pool.query(
    `
      update public.wm_admin_notifications
      set status = 'resolved', updated_at = now()
      where related_completion_id = $1 and status <> 'resolved'
    `,
    [completionId],
  ).catch(() => undefined);
}

async function ensureXpAward(completion, reason) {
  const { rows: ledgerRows } = await pool.query(
    `select id from public.wm_xp_ledger where quest_completion_id = $1 and status = 'active' limit 1`,
    [completion.id],
  );
  if (ledgerRows[0]) return { awarded: false, reason: "already_awarded" };

  const amount = Number(completion.instance_xp_reward || completion.template_xp_reward || 0);
  if (amount <= 0) return { awarded: false, reason: "no_xp_reward" };

  await pool.query(
    `
      insert into public.wm_xp_ledger (user_id, quest_completion_id, amount, status, reason)
      values ($1, $2, $3, 'active', $4)
    `,
    [completion.user_id, completion.id, amount, reason],
  );

  return { awarded: true, amount, reason: "awarded" };
}

async function revokeXpAward(completionId, reason) {
  const { rowCount } = await pool.query(
    `
      update public.wm_xp_ledger
      set status = 'revoked', reason = $2, updated_at = now()
      where quest_completion_id = $1 and status = 'active'
    `,
    [completionId, reason],
  ).catch(() => ({ rowCount: 0 }));
  return { revoked: Number(rowCount || 0) };
}

export default async function wmAdminReviewCompletion(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const completionId = String(req.body?.completionId || "").trim();
    const status = normalizeStatus(req.body?.status || "verified");
    const reason = String(req.body?.reason || `Admin ${status || "review"}`).trim().slice(0, 500);

    if (!completionId) return res.status(400).json({ error: "completionId is required." });
    if (!status) return res.status(400).json({ error: "Invalid review status." });

    const completion = await getCompletion(completionId);
    if (!completion) return res.status(404).json({ error: "Completion not found." });

    const existingPayload = completion.verification_payload || {};
    const nextPayload = {
      ...existingPayload,
      admin_review: {
        status,
        reason,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
      },
    };

    const { rows } = await pool.query(
      `
        update public.wm_quest_completions
        set status = $2,
            verification_payload = $3::jsonb,
            rejection_reason = case when $2 in ('rejected', 'revoked', 'expired') then $4 else null end,
            verified_at = case when $2 = 'verified' then now() else null end,
            updated_at = now()
        where id = $1
        returning *
      `,
      [completionId, status, JSON.stringify(nextPayload), reason],
    );

    const updated = rows[0];
    let xp = { awarded: false, revoked: 0 };
    if (status === "verified") {
      xp = await ensureXpAward(completion, reason);
      await maybeVerifyReferralForUser(completion.user_id).catch(() => undefined);
    } else if (["rejected", "revoked", "expired"].includes(status)) {
      xp = await revokeXpAward(completionId, reason);
    }

    await writeVerificationLog({
      userId: completion.user_id,
      completionId,
      provider: "admin",
      verificationType: completion.verification_type,
      status,
      message: reason,
      metadata: {
        admin_user_id: admin.id,
        quest_slug: completion.quest_slug,
        wallet_address: completion.wallet_address,
        xp,
      },
    });

    await closeRelatedNotifications(completionId, status);

    return res.status(200).json({
      ok: true,
      completion: updated,
      xp,
    });
  } catch (error) {
    console.error("[war-missions/admin-review-completion] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
