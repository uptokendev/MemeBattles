import { pool } from "../../server/db.js";
import { badMethod, getQuery, isAddress, isSolanaChain, normalizeAddress, json } from "../../server/http.js";

function socialChainId(chainId) {
  return isSolanaChain(chainId) ? Number(chainId) : 0;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);
  try {
    const q = getQuery(req);
    const rawChainId = Number(q.chainId ?? 0) || 0;
    const chainId = socialChainId(rawChainId);
    const raw = String(q.address ?? "").trim();
    const isSol = isSolanaChain(chainId);
    const addr = normalizeAddress(raw, chainId);
    if (!addr) return json(res, 400, { error: "Invalid address" });
    if (!isSol && !isAddress(addr)) return json(res, 400, { error: "Invalid address" });

    // Distinct counterparties so legacy multi-chain rows for the same pair count once.
    const [followersRes, followingRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(DISTINCT follower_address)::int AS c
           FROM public.user_follows
          WHERE following_address = $1
            AND (chain_id = $2 OR ($2 = 0 AND chain_id IN (0, 56, 97)))`,
        [addr, chainId],
      ),
      pool.query(
        `SELECT COUNT(DISTINCT following_address)::int AS c
           FROM public.user_follows
          WHERE follower_address = $1
            AND (chain_id = $2 OR ($2 = 0 AND chain_id IN (0, 56, 97)))`,
        [addr, chainId],
      ),
    ]);

    return json(res, 200, {
      followers: followersRes.rows?.[0]?.c ?? 0,
      following: followingRes.rows?.[0]?.c ?? 0,
    });
  } catch (e) {
    console.error("follows/user-counts error", e);
    return json(res, 500, { error: "Internal error" });
  }
}
