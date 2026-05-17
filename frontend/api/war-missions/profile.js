import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { buildWarProfile, getUserById, updateUserProfile } from "./_lib/profile.js";

export default async function wmProfile(req, res) {
  if (req.method !== "GET" && req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed." });

  try {
    const auth = readWarAuth(req);
    if (!auth) return unauthorized(res);

    let user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) return unauthorized(res, "War Missions session is no longer valid.");
    if (user.is_banned) return res.status(403).json({ error: "This wallet is excluded from War Missions." });

    if (req.method === "PATCH") {
      user = await updateUserProfile(user.id, req.body || {});
    }

    const profile = await buildWarProfile(user);
    return res.status(200).json({ ok: true, profile });
  } catch (error) {
    console.error("[war-missions/profile] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
