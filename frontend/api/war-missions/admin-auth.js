import {
  clearAdminAuthCookie,
  createAdminAuthCookie,
  readAdminAuth,
  verifyAdminCredentials,
} from "./_lib/admin-auth.js";

export default async function wmAdminAuth(req, res) {
  try {
    if (req.method === "GET") {
      const admin = readAdminAuth(req);
      return res.status(200).json({ ok: true, authenticated: Boolean(admin), admin: admin || null });
    }

    if (req.method === "DELETE") {
      res.setHeader("Set-Cookie", clearAdminAuthCookie(req));
      return res.status(200).json({ ok: true, authenticated: false });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) return res.status(400).json({ ok: false, error: "Username and password are required." });

    const valid = verifyAdminCredentials(username, password);
    if (!valid) return res.status(401).json({ ok: false, error: "Invalid admin credentials." });

    const admin = { username, role: "admin" };
    res.setHeader("Set-Cookie", createAdminAuthCookie(req, admin));
    return res.status(200).json({ ok: true, authenticated: true, admin });
  } catch (error) {
    console.error("[war-missions/admin-auth] failed", error);
    return res.status(500).json({ ok: false, error: error?.message || "Unexpected server error." });
  }
}
