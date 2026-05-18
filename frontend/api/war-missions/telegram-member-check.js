import { pool } from "../../server/db.js";
import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { getUserById } from "./_lib/profile.js";

async function checkMembership(telegramUserId) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_REQUIRED_CHAT_ID || "").trim();

  if (!botToken || !chatId) {
    return { checked: false, ok: false, status: null, error: "Telegram membership check is not configured." };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, user_id: Number(telegramUserId) }),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    return {
      checked: true,
      ok: false,
      status: null,
      error: json?.description || `Telegram getChatMember failed (${response.status}).`,
    };
  }

  const status = String(json.result?.status || "");
  return {
    checked: true,
    ok: ["creator", "administrator", "member", "restricted"].includes(status),
    status,
    error: null,
  };
}

export default async function wmTelegramMemberCheck(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  try {
    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) {
      return unauthorized(res, "War Missions session is no longer valid.");
    }
    if (user.is_banned) return res.status(403).json({ error: "This wallet is excluded from War Missions." });

    const { rows } = await pool.query(
      `
        select provider_user_id, username
        from public.wm_social_accounts
        where user_id = $1 and provider = 'telegram'
        limit 1
      `,
      [user.id],
    );

    const account = rows[0];
    if (!account) return res.status(404).json({ error: "Telegram is not linked yet." });

    const membership = await checkMembership(account.provider_user_id);
    if (membership.ok) {
      await pool.query(
        `
          update public.wm_social_accounts
          set last_verified_at = now()
          where user_id = $1 and provider = 'telegram'
        `,
        [user.id],
      );
    }

    return res.status(200).json({
      ok: true,
      provider: "telegram",
      username: account.username || account.provider_user_id,
      membership,
    });
  } catch (error) {
    console.error("[war-missions/telegram-member-check] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
