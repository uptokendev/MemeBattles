import { pool } from "../server/db.js";
import { badMethod, getQuery, isAddress, json } from "../server/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 56);
    const campaignAddress = q.campaignAddress ? String(q.campaignAddress).toLowerCase() : "";
    const voter = q.voter ? String(q.voter).toLowerCase() : "";
    const limit = Math.max(1, Math.min(100, Number(q.limit ?? 50)));

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (campaignAddress && !isAddress(campaignAddress)) return json(res, 400, { error: "Invalid campaignAddress" });
    if (voter && !isAddress(voter)) return json(res, 400, { error: "Invalid voter" });

    const where = ["chain_id = $1", "status = 'confirmed'"];
    const params = [chainId];
    let idx = 2;

    if (campaignAddress) {
      where.push(`campaign_address = $${idx++}`);
      params.push(campaignAddress);
    }
    if (voter) {
      where.push(`voter_address = $${idx++}`);
      params.push(voter);
    }

    params.push(limit);

    const { rows } = await pool.query(
      `SELECT
         chain_id AS "chainId",
         campaign_address AS "campaignAddress",
         voter_address AS "voterAddress",
         asset_address AS "assetAddress",
         amount_raw AS "amountRaw",
         tx_hash AS "txHash",
         log_index AS "logIndex",
         block_number AS "blockNumber",
         block_timestamp AS "blockTimestamp",
         meta,
         status
       FROM votes
       WHERE ${where.join(" AND ")}
       ORDER BY block_timestamp DESC
       LIMIT $${idx}`,
      params
    );

    return json(res, 200, { items: rows });
  } catch (e) {
    console.error("[api/votes]", e);
    return json(res, 500, { error: "Server error" });
  }
}
