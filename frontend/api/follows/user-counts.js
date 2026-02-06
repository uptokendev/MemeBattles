import { pool } from "../../server/db.js";
import { badMethod, getQuery, isAddress, json } from "../../server/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);
  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 0) || 0;
    const address = String(q.address ?? "").toLowerCase();
    if (!isAddress(address)) return json(res, 400, { error: "Invalid address" });

    const [followersRes, followingRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM public.user_follows WHERE chain_id=$1 AND following_address=$2`, [chainId, address]),
      pool.query(`SELECT COUNT(*)::int AS c FROM public.user_follows WHERE chain_id=$1 AND follower_address=$2`, [chainId, address]),
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
