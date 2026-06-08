import crypto from "crypto";
import { pool } from "../../server/db.js";
import { badMethod, getQuery, isEvmAddress, isWalletAddress, json } from "../../server/http.js";

function makeNonce() {
  return crypto.randomBytes(16).toString("hex");
}

function normalizeWalletAddress(value) {
  const raw = String(value ?? "").trim();
  if (raw.startsWith("0x")) return raw.toLowerCase();
  return raw;
}

function nonceStorageAddress(address) {
  if (isEvmAddress(address)) return address.toLowerCase();
  return `sol:${crypto.createHash("sha256").update(address).digest("hex").slice(0, 36)}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId);
    const address = normalizeWalletAddress(q.address);
    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!isWalletAddress(address)) return json(res, 400, { error: "Invalid address" });
    if (!pool) return json(res, 500, { error: "Server misconfigured: DATABASE_URL missing" });

    const nonce = makeNonce();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const storageAddress = nonceStorageAddress(address);

    await pool.query(
      `INSERT INTO auth_nonces (chain_id, address, nonce, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (chain_id, address)
       DO UPDATE SET nonce = EXCLUDED.nonce, expires_at = EXCLUDED.expires_at, used_at = NULL`,
      [chainId, storageAddress, nonce, expiresAt]
    );

    return json(res, 200, { nonce, expiresAt: expiresAt.toISOString() });
  } catch (e) {
    console.error("[api/auth/nonce]", e);
    return json(res, 500, { error: "Server error" });
  }
}
