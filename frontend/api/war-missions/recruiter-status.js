import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { getUserById } from "./_lib/profile.js";
import { getRecruiterStatus } from "./_lib/recruiter-status.js";

export default async function wmRecruiterStatus(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  try {
    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) {
      return unauthorized(res, "War Missions session is no longer valid.");
    }
    if (user.is_banned) {
      return res.status(403).json({ error: "This wallet is excluded from War Missions." });
    }

    const recruiterStatus = await getRecruiterStatus(user);
    return res.status(200).json({ ok: true, recruiterStatus });
  } catch (error) {
    console.error("[war-missions/recruiter-status] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
