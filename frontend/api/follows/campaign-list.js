import { pool } from "../../server/db.js";
import { badMethod, getQuery, isAddress, isSolanaChain, normalizeAddress, json } from "../../server/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);
  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 0) || 0;
    const rawUser = String(q.user ?? "").trim();
    const isSol = isSolanaChain(chainId);
    const user = normalizeAddress(rawUser, chainId);
    if (!user) return json(res, 400, { error: "Invalid address" });
    if (!isSol && !isAddress(user)) return json(res, 400, { error: "Invalid address" });

    const { rows } = await pool.query(
      `SELECT campaign_address
         FROM public.campaign_follows
        WHERE chain_id=$1 AND user_address=$2
     ORDER BY created_at DESC
        LIMIT 500`,
      [chainId, user]
    );

    return json(res, 200, { items: (rows || []).map((r) => r.campaign_address) });
  } catch (e) {
    console.error("follows/campaign-list error", e);
    return json(res, 500, { error: "Internal error" });
  }
}