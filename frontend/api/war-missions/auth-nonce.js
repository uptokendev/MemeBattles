import { randomBytes } from "node:crypto";
import { pool } from "../../server/db.js";
import { isWalletAddress, normalizeAddress, warLoginMessage } from "./_lib/auth.js";

function clientKey(req, address) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.ip || req.socket?.remoteAddress || "unknown";
  return `${address}:${ip}`;
}

async function enforceNonceRateLimit(req, address) {
  const key = clientKey(req, address);
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  const { rows } = await pool.query(
    `
      select count(*)::int as count
      from public.wm_wallet_auth_nonces
      where wallet_address = $1
        and created_at >= $2
    `,
    [address, since],
  );
  if (Number(rows[0]?.count || 0) >= 5) {
    const error = new Error("Too many login challenges. Wait a minute and try again.");
    error.statusCode = 429;
    throw error;
  }
  return key;
}

export default async function wmAuthNonce(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const address = normalizeAddress(String(req.body?.address || req.query?.address || ""));
  if (!isWalletAddress(address)) return res.status(400).json({ error: "Enter a valid wallet address." });

  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  try {
    await enforceNonceRateLimit(req, address);
    await pool.query(
      `
        insert into public.wm_wallet_auth_nonces (wallet_address, nonce, expires_at)
        values ($1, $2, $3)
      `,
      [address, nonce, expiresAt],
    );

    return res.status(200).json({
      ok: true,
      nonce,
      message: warLoginMessage(address, nonce),
      expiresAt,
    });
  } catch (error) {
    console.error("[war-missions/auth-nonce] failed", error);
    return res.status(error?.statusCode || 500).json({ error: error?.message || "Unexpected server error." });
  }
}
