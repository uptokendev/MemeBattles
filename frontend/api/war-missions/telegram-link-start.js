import crypto from "node:crypto";
import { pool } from "../../server/db.js";
import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { getUserById } from "./_lib/profile.js";

function botUsername() {
  return String(process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@+/, "");
}

function makeChallengeToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export default async function wmTelegramLinkStart(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  try {
    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) {
      return unauthorized(res, "War Missions session is no longer valid.");
    }
    if (user.is_banned) return res.status(403).json({ error: "This wallet is excluded from War Missions." });

    const username = botUsername();
    if (!process.env.TELEGRAM_BOT_TOKEN || !username) {
      return res.status(503).json({ error: "Telegram bot is not configured yet." });
    }

    const token = makeChallengeToken();
    await pool.query(
      `
        insert into public.wm_social_link_challenges
          (user_id, provider, token, expires_at)
        values ($1, 'telegram', $2, now() + interval '10 minutes')
      `,
      [user.id, token],
    );

    return res.status(200).json({
      ok: true,
      provider: "telegram",
      expiresInSeconds: 600,
      telegramUrl: `https://t.me/${username}?start=${token}`,
    });
  } catch (error) {
    console.error("[war-missions/telegram-link-start] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
