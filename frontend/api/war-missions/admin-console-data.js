import { pool } from "../../server/db.js";
import { requireAdmin } from "./_lib/admin-auth.js";

function clampLimit(value, fallback = 50) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

async function safeQuery(sql, params = [], fallback = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows || fallback;
  } catch (error) {
    console.error("[war-missions/admin-console-data] query failed", error?.message || error);
    return fallback;
  }
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function wmAdminConsoleData(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    const limit = clampLimit(req.query?.limit, 50);

    const [summaryRows, users, completions, socialAccounts, notifications, verificationLogs, prizePools, prizeWinners] = await Promise.all([
      safeQuery(
        `
          select
            (select count(*) from public.wm_users) as users_total,
            (select count(*) from public.wm_users where role = 'admin') as admins_total,
            (select count(*) from public.wm_users where is_banned = true) as banned_total,
            (select count(*) from public.wm_quest_completions) as completions_total,
            (select count(*) from public.wm_quest_completions where status = 'verified') as completions_verified,
            (select count(*) from public.wm_quest_completions where status in ('review', 'pending', 'started', 'ready')) as completions_open,
            (select count(*) from public.wm_quest_completions where status in ('rejected', 'revoked', 'expired')) as completions_rejected,
            (select count(*) from public.wm_social_accounts) as social_accounts_total,
            (select count(*) from public.wm_social_accounts where provider = 'telegram') as telegram_accounts_total,
            (select count(*) from public.wm_social_accounts where provider = 'discord') as discord_accounts_total,
            (select count(*) from public.wm_social_accounts where provider = 'x') as x_accounts_total,
            (select count(*) from public.wm_admin_notifications where status <> 'resolved') as notifications_open,
            (select coalesce(sum(amount), 0) from public.wm_xp_ledger where status = 'active') as active_xp_total
        `,
      ),
      safeQuery(
        `
          select
            u.id,
            u.wallet_address,
            u.display_name,
            u.role,
            u.is_banned,
            u.risk_score,
            u.created_at,
            u.updated_at,
            count(distinct qc.id) as completion_count,
            count(distinct qc.id) filter (where qc.status = 'verified') as verified_count,
            count(distinct sa.id) as social_count,
            coalesce(sum(xp.amount) filter (where xp.status = 'active'), 0) as active_xp
          from public.wm_users u
          left join public.wm_quest_completions qc on qc.user_id = u.id
          left join public.wm_social_accounts sa on sa.user_id = u.id
          left join public.wm_xp_ledger xp on xp.user_id = u.id
          group by u.id
          order by u.updated_at desc nulls last, u.created_at desc nulls last
          limit $1
        `,
        [limit],
      ),
      safeQuery(
        `
          select
            qc.id,
            qc.status,
            qc.submitted_value,
            qc.verification_payload,
            qc.rejection_reason,
            qc.verified_at,
            qc.created_at,
            qc.updated_at,
            u.wallet_address,
            u.display_name,
            u.risk_score,
            qt.slug as quest_slug,
            qt.title as quest_title,
            qt.verification_type,
            qi.period_type,
            vl.provider as latest_log_provider,
            vl.status as latest_log_status,
            vl.message as latest_log_message,
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
          order by
            case qc.status when 'review' then 0 when 'pending' then 1 when 'started' then 2 when 'ready' then 3 else 9 end,
            qc.updated_at desc nulls last,
            qc.created_at desc nulls last
          limit $1
        `,
        [limit],
      ),
      safeQuery(
        `
          select
            sa.id,
            sa.user_id,
            sa.provider,
            sa.provider_user_id,
            sa.username,
            sa.last_verified_at,
            sa.created_at,
            u.wallet_address,
            u.display_name
          from public.wm_social_accounts sa
          join public.wm_users u on u.id = sa.user_id
          order by sa.last_verified_at desc nulls last, sa.created_at desc nulls last
          limit $1
        `,
        [limit],
      ),
      safeQuery(
        `
          select id, type, title, message, priority, status, related_user_id, related_completion_id, related_application_id, created_at, updated_at
          from public.wm_admin_notifications
          order by
            case status when 'open' then 0 when 'pending' then 1 when 'resolved' then 9 else 2 end,
            case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
            created_at desc
          limit $1
        `,
        [limit],
      ),
      safeQuery(
        `
          select
            vl.id,
            vl.user_id,
            vl.quest_completion_id,
            vl.provider,
            vl.verification_type,
            vl.status,
            vl.message,
            vl.metadata,
            vl.created_at,
            u.wallet_address
          from public.wm_verification_logs vl
          left join public.wm_users u on u.id = vl.user_id
          order by vl.created_at desc
          limit $1
        `,
        [limit],
      ),
      safeQuery(
        `
          select id, period_type, reward_asset, reward_amount, status, metadata, created_at, updated_at
          from public.wm_prize_pools
          order by created_at desc
          limit $1
        `,
        [limit],
      ),
      safeQuery(
        `
          select id, prize_pool_id, wallet_address, rank, reward_amount, status, metadata, created_at, updated_at
          from public.wm_prize_winners
          order by created_at desc
          limit $1
        `,
        [limit],
      ),
    ]);

    const summary = summaryRows[0] || {};

    return res.status(200).json({
      ok: true,
      admin,
      summary: {
        usersTotal: toNumber(summary.users_total),
        adminsTotal: toNumber(summary.admins_total),
        bannedTotal: toNumber(summary.banned_total),
        completionsTotal: toNumber(summary.completions_total),
        completionsVerified: toNumber(summary.completions_verified),
        completionsOpen: toNumber(summary.completions_open),
        completionsRejected: toNumber(summary.completions_rejected),
        socialAccountsTotal: toNumber(summary.social_accounts_total),
        telegramAccountsTotal: toNumber(summary.telegram_accounts_total),
        discordAccountsTotal: toNumber(summary.discord_accounts_total),
        xAccountsTotal: toNumber(summary.x_accounts_total),
        notificationsOpen: toNumber(summary.notifications_open),
        activeXpTotal: toNumber(summary.active_xp_total),
      },
      users: users.map((row) => ({
        id: row.id,
        walletAddress: row.wallet_address,
        displayName: row.display_name || null,
        role: row.role,
        isBanned: Boolean(row.is_banned),
        riskScore: toNumber(row.risk_score),
        completionCount: toNumber(row.completion_count),
        verifiedCount: toNumber(row.verified_count),
        socialCount: toNumber(row.social_count),
        activeXp: toNumber(row.active_xp),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
      })),
      completions: completions.map((row) => ({
        id: row.id,
        status: row.status,
        submittedValue: row.submitted_value || null,
        verificationPayload: row.verification_payload || {},
        rejectionReason: row.rejection_reason || null,
        verifiedAt: row.verified_at || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        user: {
          walletAddress: row.wallet_address,
          displayName: row.display_name || null,
          riskScore: toNumber(row.risk_score),
        },
        quest: {
          slug: row.quest_slug,
          title: row.quest_title,
          verificationType: row.verification_type,
          periodType: row.period_type || null,
        },
        latestLog: row.latest_log_created_at
          ? {
              provider: row.latest_log_provider || null,
              status: row.latest_log_status || null,
              message: row.latest_log_message || null,
              createdAt: row.latest_log_created_at,
            }
          : null,
      })),
      socialAccounts: socialAccounts.map((row) => ({
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        providerUserId: row.provider_user_id,
        username: row.username || row.provider_user_id,
        lastVerifiedAt: row.last_verified_at || null,
        createdAt: row.created_at || null,
        walletAddress: row.wallet_address,
        displayName: row.display_name || null,
      })),
      notifications,
      verificationLogs: verificationLogs.map((row) => ({
        id: row.id,
        userId: row.user_id || null,
        completionId: row.quest_completion_id || null,
        provider: row.provider || null,
        verificationType: row.verification_type || null,
        status: row.status || null,
        message: row.message || null,
        metadata: row.metadata || {},
        createdAt: row.created_at || null,
        walletAddress: row.wallet_address || null,
      })),
      prizePools,
      prizeWinners,
    });
  } catch (error) {
    console.error("[war-missions/admin-console-data] failed", error);
    return res.status(500).json({ ok: false, error: error?.message || "Unexpected server error." });
  }
}
