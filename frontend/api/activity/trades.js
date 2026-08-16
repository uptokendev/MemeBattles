import { pool } from "../../server/db.js";
import { badMethod, getQuery, isAddress, isSolanaAddress, json } from "../../server/http.js";

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeAddress(value) {
  const raw = String(value || "").trim();
  if (isSolanaAddress(raw)) return raw;
  const lower = raw.toLowerCase();
  return isAddress(lower) ? lower : "";
}

function makeCursor(row) {
  if (!row) return null;
  return `${Number(row.blockNumber || 0)}:${Number(row.logIndex || 0)}`;
}

function parseCursor(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const [blockRaw, logRaw] = raw.split(":");
  const blockNumber = Number(blockRaw);
  const logIndex = Number(logRaw || 0);
  if (!Number.isFinite(blockNumber) || !Number.isFinite(logIndex)) return null;
  return { blockNumber, logIndex };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 97);
    const wallet = normalizeAddress(q.wallet ?? q.walletAddress);
    const campaignAddress = normalizeAddress(q.campaignAddress ?? q.campaign ?? q.token ?? q.address);
    const mode = wallet ? "wallet" : campaignAddress ? "campaign" : "";
    const limit = clampInt(q.limit, 1, 200, 50);
    const cursor = parseCursor(q.cursor);

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!mode) return json(res, 400, { error: "Missing wallet or campaignAddress" });

    const address = mode === "wallet" ? wallet : campaignAddress;
    const params = [chainId, address, limit];
    let cursorWhere = "";

    if (cursor) {
      params.push(cursor.blockNumber, cursor.logIndex);
      cursorWhere = `
        and (
          t.block_number < $4
          or (t.block_number = $4 and coalesce(t.log_index, 0) < $5)
        )`;
    }

    const addressWhere = mode === "wallet" ? "t.wallet = $2" : "t.campaign_address = $2";

    const { rows } = await pool.query(
      `select
         (t.chain_id::text || ':' || t.tx_hash || ':' || coalesce(t.log_index, 0)::text) as "id",
         t.tx_hash as "txHash",
         coalesce(t.log_index, 0) as "logIndex",
         t.block_number as "blockNumber",
         t.block_time as "blockTime",
         t.side,
         t.wallet,
         t.token_amount as "tokenAmount",
         t.bnb_amount as "bnbAmount",
         t.price_bnb as "priceBnb",
         t.campaign_address as "campaignAddress",
         c.token_address as "tokenAddress",
         c.name as "campaignName",
         c.symbol as "campaignSymbol",
         c.logo_uri as "logoUri"
       from public.curve_trades t
       left join public.campaigns c
         on c.chain_id = t.chain_id
        and c.campaign_address = t.campaign_address
       where t.chain_id = $1
         and ${addressWhere}
         ${cursorWhere}
       order by t.block_number desc, coalesce(t.log_index, 0) desc
       limit $3`,
      params
    );

    const items = rows.map((row) => ({
      id: String(row.id || `${row.txHash || ""}:${row.logIndex || 0}`),
      txHash: row.txHash ? String(row.txHash).toLowerCase() : "",
      logIndex: Number(row.logIndex || 0),
      blockNumber: Number(row.blockNumber || 0),
      blockTime: row.blockTime ? new Date(row.blockTime).toISOString() : null,
      side: String(row.side || "buy") === "sell" ? "sell" : "buy",
      wallet: row.wallet
        ? (isSolanaAddress(row.wallet) ? String(row.wallet) : String(row.wallet).toLowerCase())
        : "",
      tokenAmount: row.tokenAmount == null ? null : Number(row.tokenAmount),
      bnbAmount: row.bnbAmount == null ? null : Number(row.bnbAmount),
      priceBnb: row.priceBnb == null ? null : Number(row.priceBnb),
      campaignAddress: row.campaignAddress ? String(row.campaignAddress).toLowerCase() : "",
      tokenAddress: row.tokenAddress ? String(row.tokenAddress).toLowerCase() : null,
      campaignName: row.campaignName ?? null,
      campaignSymbol: row.campaignSymbol ?? null,
      logoUri: row.logoUri ?? null,
    }));

    return json(res, 200, {
      items,
      mode,
      nextCursor: items.length === limit ? makeCursor(items[items.length - 1]) : null,
    });
  } catch (e) {
    console.error("[api/activity/trades]", e);
    if (e?.code === "42P01" || e?.code === "42703") {
      return json(res, 200, { items: [], nextCursor: null, warning: "DB schema missing activity tables/columns" });
    }
    return json(res, 500, { error: "Server error" });
  }
}
