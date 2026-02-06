import { pool } from "../../server/db.js";
import { badMethod, getQuery, isAddress, json } from "../../server/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);
  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 0) || 0;
    const address = String(q.address ?? "").toLowerCase();
    const type = String(q.type ?? "").toLowerCase();
    if (!isAddress(address)) return json(res, 400, { error: "Invalid address" });
    if (type !== "followers" && type !== "following") return json(res, 400, { error: "Invalid type" });

    const sql =
      type === "followers"
        ? `SELECT uf.follower_address AS addr,
                  up.display_name AS "displayName",
                  up.avatar_url AS "avatarUrl"
             FROM public.user_follows uf
        LEFT JOIN public.user_profiles up
               ON up.chain_id = uf.chain_id AND lower(up.address) = uf.follower_address
            WHERE uf.chain_id = $1 AND uf.following_address = $2
         ORDER BY uf.created_at DESC
            LIMIT 200`
        : `SELECT uf.following_address AS addr,
                  up.display_name AS "displayName",
                  up.avatar_url AS "avatarUrl"
             FROM public.user_follows uf
        LEFT JOIN public.user_profiles up
               ON up.chain_id = uf.chain_id AND lower(up.address) = uf.following_address
            WHERE uf.chain_id = $1 AND uf.follower_address = $2
         ORDER BY uf.created_at DESC
            LIMIT 200`;

    const { rows } = await pool.query(sql, [chainId, address]);
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