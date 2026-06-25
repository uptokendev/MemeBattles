import { pool } from "../../server/db.js";
import { requireAdmin } from "./_lib/admin-auth.js";
import { awardQuestForUser, getUserById } from "./_lib/profile.js";
import {
  createRecruiterAdminNotification,
  ensureRecruiterReferralLink,
  getRecruiterQuestTemplateByVerificationType,
} from "./_lib/referrals.js";

function serializeApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    walletAddress: row.wallet_address,
    xUsername: row.x_username || "",
    telegramUsername: row.telegram_username || "",
    discordUsername: row.discord_username || "",
    motivation: row.motivation || "",
    expectedRecruits: row.expected_recruits == null ? null : Number(row.expected_recruits),
    status: row.status,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at || null,
  };
}

export default async function wmAdminRecruiterReview(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const applicationId = String(req.body?.applicationId || req.body?.id || "").trim();
    const decision = String(req.body?.decision || req.body?.status || "").trim().toLowerCase();
    const reason = String(req.body?.reason || "").trim().slice(0, 1000);
    if (!applicationId) return res.status(400).json({ ok: false, error: "applicationId is required." });
    if (!["accepted", "rejected"].includes(decision)) {
      return res.status(400).json({ ok: false, error: "decision must be accepted or rejected." });
    }

    const { rows } = await pool.query(
      `
        select *
        from public.wm_recruiter_applications
        where id = $1
        limit 1
      `,
      [applicationId],
    );
    const application = rows[0];
    if (!application) return res.status(404).json({ ok: false, error: "Recruiter application was not found." });

    const user = await getUserById(application.user_id);
    if (!user) return res.status(404).json({ ok: false, error: "Recruiter application user was not found." });

    const { rows: updatedRows } = await pool.query(
      `
        update public.wm_recruiter_applications
        set status = $2,
            reviewed_by = $3,
            reviewed_at = now()
        where id = $1
        returning *
      `,
      [applicationId, decision, admin.username || "admin"],
    );
    const updatedApplication = updatedRows[0] || application;

    let referralLink = null;
    if (decision === "accepted") {
      await pool.query(`update public.wm_users set role = 'recruiter', updated_at = now() where id = $1`, [user.id]);
      referralLink = await ensureRecruiterReferralLink(user);

      const acceptedQuest = await getRecruiterQuestTemplateByVerificationType("recruiter_application_accepted");
      if (acceptedQuest?.slug) {
        await awardQuestForUser(user.id, acceptedQuest.slug, "recruiter_application_accepted", {
          applicationId: updatedApplication.id,
          referralCode: referralLink?.code || null,
        }).catch(() => undefined);
      }
    }

    await createRecruiterAdminNotification({
      type: decision === "accepted" ? "recruiter_application_accepted" : "recruiter_application_rejected",
      title: decision === "accepted" ? "Recruiter application accepted" : "Recruiter application rejected",
      message: reason || user.wallet_address,
      priority: decision === "accepted" ? "high" : "normal",
      relatedUserId: user.id,
      relatedApplicationId: updatedApplication.id,
    }).catch(() => undefined);

    return res.status(200).json({
      ok: true,
      admin,
      application: serializeApplication(updatedApplication),
      referralLink,
    });
  } catch (error) {
    console.error("[war-missions/admin-recruiter-review] failed", error);
    return res.status(500).json({ ok: false, error: error?.message || "Unexpected server error." });
  }
}
