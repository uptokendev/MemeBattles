import { pool } from "../../server/db.js";
import { verifyCommunityJoinQuestForUser } from "./_lib/community-membership.js";

const VALID_PROVIDERS = new Set(["telegram", "discord"]);

function clampLimit(value) {
  const parsed = Number(value || 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

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
      ""
  ).trim();

  if (got !== expected) {
    res.status(401).json({ ok: false, error: "Invalid internal token." });
    return false;
  }

  return true;
}

async function getLinkedUsers({ provider, limit }) {
  const params = [limit];
  let providerFilter = "";

  if (provider) {
    params.push(provider);
    providerFilter = `and sa.provider = $${params.length}`;
  }

  const { rows } = await pool.query(
    `
      select distinct
        u.id,
        u.wallet_address,
        u.display_name,
        u.role,
        u.risk_score,
        u.is_banned
      from public.wm_users u
      join public.wm_social_accounts sa on sa.user_id = u.id
      where u.is_banned = false
        and sa.provider in ('telegram', 'discord')
        ${providerFilter}
      order by u.id desc
      limit $1
    `,
    params,
  );

  return rows;
}

export default async function wmCommunityMembershipSweep(req, res) {
  if (!["POST", "GET"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });
  if (!requireInternalToken(req, res)) return;

  try {
    const provider = String(req.body?.provider || req.query?.provider || "").trim().toLowerCase();
    if (provider && !VALID_PROVIDERS.has(provider)) {
      return res.status(400).json({ ok: false, error: "provider must be telegram, discord, or omitted." });
    }

    const limit = clampLimit(req.body?.limit || req.query?.limit);
    const users = await getLinkedUsers({ provider, limit });
    const results = [];

    for (const user of users) {
      if (provider) {
        const result = await verifyCommunityJoinQuestForUser(user, provider, "community_membership_sweep").catch((error) => ({
          ok: false,
          provider,
          error: error?.message || "Community membership check failed.",
        }));
        results.push({ userId: user.id, walletAddress: user.wallet_address, provider, result });
      } else {
        for (const nextProvider of ["telegram", "discord"]) {
          const result = await verifyCommunityJoinQuestForUser(user, nextProvider, "community_membership_sweep").catch((error) => ({
            ok: false,
            provider: nextProvider,
            error: error?.message || "Community membership check failed.",
          }));
          results.push({ userId: user.id, walletAddress: user.wallet_address, provider: nextProvider, result });
        }
      }
    }

    const awarded = results.filter((item) => item.result?.award?.awarded || item.result?.awarded).length;
    const verified = results.filter((item) => item.result?.status === "verified" || item.result?.status === "already_verified").length;
    const pending = results.filter((item) => item.result?.status === "pending").length;

    return res.status(200).json({
      ok: true,
      provider: provider || "all",
      usersChecked: users.length,
      checksRun: results.length,
      awarded,
      verified,
      pending,
      results,
    });
  } catch (error) {
    console.error("[war-missions/community-membership-sweep] failed", error);
    return res.status(500).json({ ok: false, error: error?.message || "Unexpected server error." });
  }
}
