import { pool } from "../server/db.js";
import { badMethod, getQuery, isAddress, json } from "../server/http.js";

// GET /api/rewards?chainId=56&address=0x...
// Returns *unclaimed* prizes for the recipient.
export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId);
    const address = String(q.address ?? "").toLowerCase();
    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!isAddress(address)) return json(res, 400, { error: "Invalid address" });
    if (!pool) return json(res, 500, { error: "Server misconfigured: DATABASE_URL missing" });

    // Find winnings for the recipient and exclude already-claimed rows.
    const { rows } = await pool.query(
      `SELECT
          w.period,
          w.epoch_start AS "epochStart",
          w.epoch_end AS "epochEnd",
          w.category,
          w.rank,
          w.amount_raw AS "amountRaw",
          w.payload,
          w.computed_at AS "computedAt"
        FROM league_epoch_winners w
        LEFT JOIN league_epoch_claims c
          ON c.chain_id = w.chain_id
         AND c.period = w.period
         AND c.epoch_start = w.epoch_start
         AND c.category = w.category
         AND c.rank = w.rank
        WHERE w.chain_id = $1
          AND lower(w.recipient_address) = $2
          AND c.claimed_at IS NULL
        ORDER BY w.epoch_start DESC, w.period DESC, w.category ASC, w.rank ASC`,
      [chainId, address]
    );

    return json(res, 200, {
      address,
      chainId,
      rewards: rows.map((r) => ({
        period: r.period,
        epochStart: r.epochStart,
        epochEnd: r.epochEnd,
        category: r.category,
        rank: r.rank,
        amountRaw: r.amountRaw,
        payload: r.payload,
        computedAt: r.computedAt,
      })),
    });
  } catch (e) {
    // If schema isn't deployed yet, fail gracefully (UI can show empty state).
    const code = e?.code;
    console.error("[api/rewards]", e);
    if (code === "42P01" || code === "42703") {
      return json(res, 200, { rewards: [], warning: "DB schema missing league epoch tables" });
    }
    return json(res, 500, { error: "Server error" });
  }
}
