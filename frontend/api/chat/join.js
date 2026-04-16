import { pool } from "../../server/db.js";
import { badMethod, json, readJson, isAddress } from "../../server/http.js";
import {
  loadUserProfile,
  makeSessionToken,
  hashToken,
  normalizeAddress,
  resolveCampaignRole,
  verifyJoinSignature,
} from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return badMethod(res);

  try {
    const body = await readJson(req);
    const chainId = Number(body.chainId);
    const campaignAddress = normalizeAddress(body.campaignAddress);
    const address = normalizeAddress(body.address);
    const nonce = String(body.nonce ?? "");
    const signature = String(body.signature ?? "");

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!isAddress(campaignAddress)) return json(res, 400, { error: "Invalid campaignAddress" });
    if (!isAddress(address)) return json(res, 400, { error: "Invalid address" });

    await verifyJoinSignature({ chainId, address, campaignAddress, nonce, signature });

    const profile = await loadUserProfile(chainId, address);
    const role = await resolveCampaignRole(chainId, campaignAddress, address);
    const sessionToken = makeSessionToken();
    const tokenHash = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO chat_sessions (
         wallet_address,
         display_name,
         avatar_url,
         role,
         token_hash,
         expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        address,
        profile?.displayName ?? null,
        profile?.avatarUrl ?? null,
        role,
        tokenHash,
        expiresAt,
      ]
    );

    return json(res, 200, {
      sessionToken,
      expiresAt: expiresAt.toISOString(),
      profile: {
        walletAddress: address,
        displayName: profile?.displayName ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        role,
      },
    });
  } catch (e) {
    const msg = String(e?.message ?? "");
    const authish = /nonce|signature|invalid|expired/i.test(msg);
    console.error("[api/chat/join]", e);
    return json(res, authish ? 401 : 500, { error: authish ? msg : "Server error" });
  }
}
