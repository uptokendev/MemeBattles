import { pool } from "../../server/db.js";
import { badMethod, getQuery, isAddress, json, readJson } from "../../server/http.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const q = getQuery(req);
      const chainId = Number(q.chainId ?? 0) || 0;
      const follower = String(q.follower ?? "").toLowerCase();
      const following = String(q.following ?? "").toLowerCase();
      if (!isAddress(follower) || !isAddress(following)) return json(res, 400, { error: "Invalid address" });

      const { rows } = await pool.query(
        `SELECT 1 FROM public.user_follows
          WHERE chain_id = $1 AND follower_address = $2 AND following_address = $3
          LIMIT 1`,
        [chainId, follower, following]
      );
      return json(res, 200, { isFollowing: rows.length > 0 });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const chainId = Number(body.chainId ?? 0) || 0;
      const action = String(body.action ?? "").toLowerCase();
      const follower = String(body.followerAddress ?? "").toLowerCase();
      const following = String(body.followingAddress ?? "").toLowerCase();
      if (!isAddress(follower) || !isAddress(following)) return json(res, 400, { error: "Invalid address" });
      if (follower === following) return json(res, 400, { error: "Cannot follow self" });
      if (action !== "follow" && action !== "unfollow") return json(res, 400, { error: "Invalid action" });

      if (action === "follow") {
        await pool.query(
          `INSERT INTO public.user_follows (chain_id, follower_address, following_address)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [chainId, follower, following]
        );
        return json(res, 200, { ok: true });
      }

      await pool.query(
        `DELETE FROM public.user_follows
          WHERE chain_id = $1 AND follower_address = $2 AND following_address = $3`,
        [chainId, follower, following]
      );
      return json(res, 200, { ok: true });
    }

    return badMethod(res);
  } catch (e) {
    console.error("follows/user error", e);
    return json(res, 500, { error: "Internal error" });
  }
}