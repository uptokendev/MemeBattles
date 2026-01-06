import { pool } from "../_db.js";
import { badMethod, isAddress, json, readJson } from "../_http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return badMethod(res);

  try {
    const b = await readJson(req);
    const chainId = Number(b.chainId);
    const campaignAddress = String(b.campaignAddress ?? "").toLowerCase();
    const tokenAddress = String(b.tokenAddress ?? "").toLowerCase();
    const creatorAddress = String(b.creatorAddress ?? "").toLowerCase();
    const name = String(b.name ?? "").slice(0, 64);
    const symbol = String(b.symbol ?? "").slice(0, 16);

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!isAddress(campaignAddress)) return json(res, 400, { error: "Invalid campaignAddress" });
    if (!isAddress(tokenAddress)) return json(res, 400, { error: "Invalid tokenAddress" });
    if (!isAddress(creatorAddress)) return json(res, 400, { error: "Invalid creatorAddress" });

    await pool.query(
      `INSERT INTO campaigns (chain_id, campaign_address, token_address, creator_address, name, symbol)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (chain_id, campaign_address)
       DO UPDATE SET
         token_address = EXCLUDED.token_address,
         creator_address = EXCLUDED.creator_address,
         name = EXCLUDED.name,
         symbol = EXCLUDED.symbol,
         updated_at = NOW()`,
      [chainId, campaignAddress, tokenAddress, creatorAddress, name, symbol]
    );

    return json(res, 200, { ok: true });
  } catch (e) {
    console.error("[api/campaigns/upsert]", e);
    return json(res, 500, { error: "Server error" });
  }
}
