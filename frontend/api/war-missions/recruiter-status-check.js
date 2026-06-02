import crypto from "node:crypto";
import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { buildWarProfile, getUserById } from "./_lib/profile.js";
import { syncApprovedRecruiter } from "./_lib/recruiter-status.js";
import { pool } from "../../server/db.js";

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

async function enforceRateLimit({ action, key, limit, windowSeconds }) {
  const keyHash = crypto.createHash("sha256").update(`${action}:${key}`).digest("hex");

  try {
    const { rows } = await pool.query(
      `
        select count(*)::int as total
        from public.wm_rate_limit_events
        where action = $1
          and key_hash = $2
          and created_at >= now() - ($3 * interval '1 second')
      `,
      [action, keyHash, windowSeconds],
    );

    if (Number(rows[0]?.total || 0) >= limit) {
      throw new Error("Too many attempts. Wait a moment and try again.");
    }

    await pool.query(
      `
        insert into public.wm_rate_limit_events (action, key_hash, created_at)
        values ($1, $2, now())
      `,
      [action, keyHash],
    );
  } catch (error) {
    if (schemaMissing(error)) return;
    throw error;
  }
}

export default async function wmRecruiterStatusCheck(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  try {
    let user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) {
      return unauthorized(res, "War Missions session is no longer valid.");
    }
    if (user.is_banned) {
      return res.status(403).json({ error: "This wallet is excluded from War Missions." });
    }

    await enforceRateLimit({
      action: "recruiter_status_check",
      key: user.id,
      limit: 12,
      windowSeconds: 60,
    });

    const sync = await syncApprovedRecruiter(user);
    if (sync.roleSynced) {
      user = (await getUserById(user.id)) || user;
    }
    const profile = await buildWarProfile(user);

    return res.status(200).json({
      ok: true,
      recruiterStatus: sync.recruiterStatus,
      roleSynced: sync.roleSynced,
      questAwarded: sync.questAwarded,
      questAlreadyAwarded: sync.questAlreadyAwarded,
      referralLink: sync.referralLink,
      profile,
    });
  } catch (error) {
    console.error("[war-missions/recruiter-status-check] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
