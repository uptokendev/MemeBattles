import { badMethod, json, readJson } from "../../server/http.js";
import {
  createSessionToken,
  getProfile,
  hashToken,
  normalizeCampaignAddress,
  normalizeWalletAddress,
  resolveRole,
  validChainId,
  verifyJoinSignature,
} from "./_lib.js";
import { pool } from "../../server/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return badMethod(res);
  res.setHeader("cache-control", "no-store");

  try {
    const body = await readJson(req);
    const chainId = validChainId(body.chainId);
    const campaignAddress = normalizeCampaignAddress(body.campaignAddress);
    const walletAddress = normalizeWalletAddress(body.walletAddress || body.address);
    const nonce = String(body.nonce ?? "").trim();
    const signature = String(body.signature ?? "").trim();
    const message = String(body.message ?? "");

    if (!chainId) return json(res, 400, { error: "Invalid chainId" });
    if (!campaignAddress) return json(res, 400, { error: "Invalid campaignAddress" });
    if (!walletAddress) return json(res, 400, { error: "Invalid walletAddress" });
    if (!nonce) return json(res, 400, { error: "Nonce missing" });
    if (!signature) return json(res, 400, { error: "Signature missing" });

    verifyJoinSignature({ chainId, campaignAddress, walletAddress, nonce, signature, message });

    const profile = await getProfile(chainId, walletAddress);
    const role = await resolveRole(chainId, campaignAddress, walletAddress);
    const token = createSessionToken();
    const tokenHash = hashToken(token);
    const displayName = profile.displayName || null;
    const avatarUrl = profile.avatarUrl || null;
    const expiresHours = 12;

    const { rows } = await pool.query(
      `INSERT INTO chat_sessions (wallet_address, token_hash, display_name, avatar_url, role, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + ($6::text || ' hours')::interval)
       RETURNING expires_at AS "expiresAt"`,
      [walletAddress, tokenHash, displayName, avatarUrl, role, String(expiresHours)]
    );

    return json(res, 200, {
      sessionToken: token,
      expiresAt: rows[0]?.expiresAt ?? null,
      profile: { walletAddress, displayName, avatarUrl, role },
    });
  } catch (e) {
    console.error("[api/chat/join]", e);
    return json(res, e?.statusCode || 500, { error: e?.statusCode ? e.message : "Server error" });
  }
}
