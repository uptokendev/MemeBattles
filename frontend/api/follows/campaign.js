import { pool } from "../../server/db.js";
import { badMethod, getQuery, isAddress, isSolanaChain, normalizeAddress, json, readJson } from "../../server/http.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const q = getQuery(req);
      const chainId = Number(q.chainId ?? 0) || 0;
      const rawUser = String(q.user ?? "").trim();
      const rawCampaign = String(q.campaign ?? "").trim();
      const isSol = isSolanaChain(chainId);
      const user = normalizeAddress(rawUser, chainId);
      const campaign = normalizeAddress(rawCampaign, chainId);
      if (!user || !campaign) return json(res, 400, { error: "Invalid address" });
      if (!isSol && (!isAddress(user) || !isAddress(campaign))) return json(res, 400, { error: "Invalid address" });

      const { rows } = await pool.query(
        `SELECT 1 FROM public.campaign_follows
          WHERE chain_id=$1 AND user_address=$2 AND campaign_address=$3
          LIMIT 1`,
        [chainId, user, campaign]
      );
      return json(res, 200, { isFollowing: rows.length > 0 });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const chainId = Number(body.chainId ?? 0) || 0;
      const action = String(body.action ?? "").toLowerCase();
      const rawUser = String(body.userAddress ?? "").trim();
      const rawCampaign = String(body.campaignAddress ?? "").trim();
      const isSol = isSolanaChain(chainId);
      const user = normalizeAddress(rawUser, chainId);
      const campaign = normalizeAddress(rawCampaign, chainId);
      if (!user || !campaign) return json(res, 400, { error: "Invalid address" });
      if (!isSol && (!isAddress(user) || !isAddress(campaign))) return json(res, 400, { error: "Invalid address" });
      if (action !== "follow" && action !== "unfollow") return json(res, 400, { error: "Invalid action" });
      const verified = await requireWalletActionAuth({
        res,
        pool,
        auth: body.auth || body,
        expectedWallet: user,
        chainId,
        action: action === "follow" ? "follow_campaign" : "unfollow_campaign",
        routeLabel: "follows/campaign",
        extraLines: ["Campaign: " + campaign],
      });
      if (!verified) return;

      if (action === "follow") {
        await pool.query(
          `INSERT INTO public.campaign_follows (chain_id, user_address, campaign_address)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [chainId, user, campaign]
        );
        return json(res, 200, { ok: true });
      }

      await pool.query(
        `DELETE FROM public.campaign_follows
          WHERE chain_id=$1 AND user_address=$2 AND campaign_address=$3`,
        [chainId, user, campaign]
      );
      return json(res, 200, { ok: true });
    }

    return badMethod(res);
  } catch (e) {
    console.error("follows/campaign error", e);
    return json(res, 500, { error: "Internal error" });
  }
}