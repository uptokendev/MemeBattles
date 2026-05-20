import { pool } from "../../server/db.js";
import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { getUserById } from "./_lib/profile.js";

function clampLimit(value) {
  const parsed = Number(value || 25);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["ready", "pending", "review", "locked", "verified", "started", "rejected", "revoked", "expired"].includes(status)
    ? status
    : "";
}

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

export default async function wmAdminSocialChecksList(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const limit = clampLimit(req.query?.limit);
    const status = normalizeStatus(req.query?.status) || "review";
    const provider = String(req.query?.provider || "").trim().toLowerCase();

    const params = [status, limit];
    let providerFilter = "";
    if (provider) {
      params.push(provider);
      providerFilter = `and coalesce(qc.verification_payload->>'provider', vl.provider, '') = $${params.length}`;
    }

    const { rows } = await pool.query(
      `
        select
          qc.id as completion_id,
          qc.status,
          qc.submitted_value,
          qc.verification_payload,
          qc.rejection_reason,
          qc.verified_at,
          qc.updated_at,
          qc.created_at,
          u.id as user_id,
          u.wallet_address,
          u.display_name,
          u.role as user_role,
          u.risk_score,
          qt.slug as quest_slug,
          qt.title as quest_title,
          qt.verification_type,
          qi.period_type,
          qi.period_start,
          qi.period_end,
          vl.provider as latest_log_provider,
          vl.verification_type as latest_log_type,
          vl.status as latest_log_status,
          vl.message as latest_log_message,
          vl.metadata as latest_log_metadata,
          vl.created_at as latest_log_created_at
        from public.wm_quest_completions qc
        join public.wm_users u on u.id = qc.user_id
        join public.wm_quest_instances qi on qi.id = qc.quest_instance_id
        join public.wm_quest_templates qt on qt.id = qi.quest_template_id
        left join lateral (
          select *
          from public.wm_verification_logs vl
          where vl.quest_completion_id = qc.id
          order by vl.created_at desc
          limit 1
        ) vl on true
        where qc.status = $1
          and qt.verification_type in ('manual_review', 'social_metric', 'social_account', 'telegram_join', 'discord_join')
          ${providerFilter}
        order by qc.updated_at desc nulls last, qc.created_at desc nulls last
        limit $2
      `,
      params,
    );

    return res.status(200).json({
      ok: true,
      status,
      provider: provider || null,
      rows: rows.map((row) => ({
        completionId: row.completion_id,
        status: row.status,
        submittedValue: row.submitted_value,
        verificationPayload: row.verification_payload || {},
        rejectionReason: row.rejection_reason || null,
        verifiedAt: row.verified_at || null,
        updatedAt: row.updated_at || null,
        createdAt: row.created_at || null,
        user: {
          id: row.user_id,
          walletAddress: row.wallet_address,
          displayName: row.display_name || null,
          role: row.user_role,
          riskScore: Number(row.risk_score || 0),
        },
        quest: {
          slug: row.quest_slug,
          title: row.quest_title,
          verificationType: row.verification_type,
          periodType: row.period_type,
          periodStart: row.period_start || null,
          periodEnd: row.period_end || null,
        },
        latestLog: row.latest_log_created_at
          ? {
              provider: row.latest_log_provider || null,
              verificationType: row.latest_log_type || null,
              status: row.latest_log_status || null,
              message: row.latest_log_message || null,
              metadata: row.latest_log_metadata || {},
              createdAt: row.latest_log_created_at,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("[war-missions/admin-social-checks-list] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
