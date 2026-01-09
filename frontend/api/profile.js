import { ethers } from "ethers";
import { pool } from "./_db.js";
import { badMethod, getQuery, isAddress, json, readJson } from "./_http.js";

function buildProfileMessage({ chainId, address, nonce, displayName, avatarUrl }) {
  const name = String(displayName ?? "").trim().slice(0, 32);
  const avatar = String(avatarUrl ?? "").trim().slice(0, 200);
  return [
    "UPMEME Profile",
    "Action: PROFILE_UPSERT",
    `ChainId: ${chainId}`,
    `Address: ${String(address).toLowerCase()}`,
    `Nonce: ${nonce}`,
    "",
    `DisplayName: ${name}`,
    `AvatarUrl: ${avatar}`,
  ].join("\n");
}

async function consumeNonce(chainId, address, nonce) {
  const { rows } = await pool.query(
    `SELECT nonce, expires_at, used_at
     FROM auth_nonces
     WHERE chain_id = $1 AND address = $2
     LIMIT 1`,
    [chainId, address]
  );
  const row = rows[0];
  if (!row) throw new Error("Nonce not found");
  if (row.used_at) throw new Error("Nonce already used");
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (!exp || Date.now() > exp) throw new Error("Nonce expired");
  if (String(row.nonce) !== String(nonce)) throw new Error("Nonce mismatch");

  await pool.query(
    `UPDATE auth_nonces SET used_at = NOW() WHERE chain_id = $1 AND address = $2`,
    [chainId, address]
  );
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const q = getQuery(req);
      const chainId = Number(q.chainId);
      const address = String(q.address ?? "").toLowerCase();
      if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
      if (!isAddress(address)) return json(res, 400, { error: "Invalid address" });

      const { rows } = await pool.query(
        `SELECT address, chain_id AS "chainId", display_name AS "displayName", avatar_url AS "avatarUrl", bio
         FROM user_profiles
         WHERE chain_id = $1 AND address = $2
         LIMIT 1`,
        [chainId, address]
      );

      return json(res, 200, { profile: rows[0] ?? null });
    } catch (e) {
      console.error("[api/profile GET]", e);
      return json(res, 500, { error: "Server error" });
    }
  }

  if (req.method === "POST") {
    try {
      const b = await readJson(req);
      const chainId = Number(b.chainId);
      const address = String(b.address ?? "").toLowerCase();
      const displayName = String(b.displayName ?? "").trim().slice(0, 32);
      const avatarUrl = String(b.avatarUrl ?? "").trim().slice(0, 200) || null;
      const bio = String(b.bio ?? "").trim().slice(0, 280) || null;
      const nonce = String(b.nonce ?? "");
      const signature = String(b.signature ?? "");

      if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
      if (!isAddress(address)) return json(res, 400, { error: "Invalid address" });
      if (!nonce) return json(res, 400, { error: "Nonce missing" });
      if (!signature) return json(res, 400, { error: "Signature missing" });

      await consumeNonce(chainId, address, nonce);
      const msg = buildProfileMessage({ chainId, address, nonce, displayName, avatarUrl: avatarUrl ?? "" });
      const recovered = ethers.verifyMessage(msg, signature).toLowerCase();
      if (recovered !== address) return json(res, 401, { error: "Invalid signature" });

      await pool.query(
        `INSERT INTO user_profiles (chain_id, address, display_name, avatar_url, bio)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (chain_id, address)
         DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, bio = EXCLUDED.bio, updated_at = NOW()`,
        [chainId, address, displayName || null, avatarUrl, bio]
      );

      return json(res, 200, { ok: true });
    } catch (e) {
      const msg = String(e?.message ?? "");
      const isAuth = /nonce|signature/i.test(msg);
      console.error("[api/profile POST]", e);
      return json(res, isAuth ? 401 : 500, { error: isAuth ? msg : "Server error" });
    }
  }

  return badMethod(res);
}
