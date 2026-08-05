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
    const type = String(q.type ?? "").toLowerCase();
    const isSol = isSolanaChain(chainId);
    const addr = normalizeAddress(raw, chainId);
    if (!addr) return json(res, 400, { error: "Invalid address" });
    if (!isSol && !isAddress(addr)) return json(res, 400, { error: "Invalid address" });
    if (type !== "followers" && type !== "following") return json(res, 400, { error: "Invalid type" });

    // Distinct counterparties; include legacy EVM rows stored under 56/97.
    const sql =
      type === "followers"
        ? `SELECT DISTINCT ON (uf.follower_address)
                  uf.follower_address AS addr,
                  up.display_name AS "displayName",
                  up.avatar_url AS "avatarUrl",
                  uf.created_at
             FROM public.user_follows uf
        LEFT JOIN public.user_profiles up
               ON lower(up.address) = lower(uf.follower_address)
            WHERE uf.following_address = $1
              AND (uf.chain_id = $2 OR ($2 = 0 AND uf.chain_id IN (0, 56, 97)))
         ORDER BY uf.follower_address, uf.created_at DESC
            LIMIT 200`
        : `SELECT DISTINCT ON (uf.following_address)
                  uf.following_address AS addr,
                  up.display_name AS "displayName",
                  up.avatar_url AS "avatarUrl",
                  uf.created_at
             FROM public.user_follows uf
        LEFT JOIN public.user_profiles up
               ON lower(up.address) = lower(uf.following_address)
            WHERE uf.follower_address = $1
              AND (uf.chain_id = $2 OR ($2 = 0 AND uf.chain_id IN (0, 56, 97)))
         ORDER BY uf.following_address, uf.created_at DESC
            LIMIT 200`;

    const { rows } = await pool.query(sql, [addr, chainId]);
    rows.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return json(res, 200, {
      items: (rows || []).map((r) => ({
        address: r.addr,
        profile: { displayName: r.displayName ?? null, avatarUrl: r.avatarUrl ?? null },
      })),
    });
  } catch (e) {
    console.error("follows/user-list error", e);
    return json(res, 500, { error: "Internal error" });
  }
}