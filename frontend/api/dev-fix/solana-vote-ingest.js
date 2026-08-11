/**
 * Confirm a Solana UP Vote (native SOL transfer to vote treasury) and write
 * votes + vote_aggregates — same product surface as BNB voteWithBNB + vote-ingest.
 *
 * POST /api/solana/vote-ingest
 * body: { chainId, signature, campaignAddress, voterAddress }
 */
import { pool } from "../../server/db.js";
import { badMethod, isSolanaAddress, isSolanaChain, json, readJson } from "../../server/http.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const UPVOTE_USD_TARGET = 3;
/** Minimum SOL accepted (anti-spam); true price checked loosely via env override. */
const DEFAULT_MIN_LAMPORTS = 1_000_000n; // 0.001 SOL floor

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function solanaVoteTreasury() {
  const candidates = [
    process.env.SOLANA_VOTE_TREASURY_ADDRESS,
    process.env.VITE_SOLANA_VOTE_TREASURY_ADDRESS,
    process.env.VITE_VOTE_TREASURY_ADDRESS_101,
    process.env.VOTE_TREASURY_ADDRESS_101,
    // Devnet convenience: protocol operator if dedicated treasury not set
    process.env.SOLANA_VOTE_TREASURY_FALLBACK || "HuKfoFUuWxC5qFZXzr5dbaX4S7w4vJUW8AHV9LD4C2J9",
  ];
  for (const c of candidates) {
    const v = String(c || "").trim();
    if (v && isSolanaAddress(v)) return v;
  }
  return "";
}

function minVoteLamports() {
  const raw = String(process.env.SOLANA_VOTE_MIN_LAMPORTS || "").trim();
  if (/^\d+$/.test(raw)) return BigInt(raw);
  return DEFAULT_MIN_LAMPORTS;
}

async function rpcCall(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = await response.json().catch(() => ({}));
  if (payload.error) {
    throw new Error(payload.error.message || `RPC ${method} failed`);
  }
  return payload.result;
}

/**
 * Parse a confirmed transfer of lamports from voter → treasury.
 */
function extractSolTransfer(tx, voter, treasury) {
  const meta = tx?.meta;
  const message = tx?.transaction?.message;
  if (!meta || meta.err) return null;

  // accountKeys may be array of strings or {pubkey}
  const keys = (message?.accountKeys || []).map((k) =>
    typeof k === "string" ? k : String(k?.pubkey || k || ""),
  );
  const pre = meta.preBalances || [];
  const post = meta.postBalances || [];
  const voterIdx = keys.findIndex((k) => k === voter);
  const treasuryIdx = keys.findIndex((k) => k === treasury);
  if (voterIdx < 0 || treasuryIdx < 0) return null;

  const voterDelta = BigInt(post[voterIdx] ?? 0) - BigInt(pre[voterIdx] ?? 0);
  const treasuryDelta = BigInt(post[treasuryIdx] ?? 0) - BigInt(pre[treasuryIdx] ?? 0);
  // Voter paid (negative), treasury received (positive)
  if (treasuryDelta <= 0n || voterDelta >= 0n) return null;
  return {
    amountLamports: treasuryDelta,
    blockTime: tx.blockTime || null,
    slot: tx.slot || 0,
  };
}

async function patchVoteAggregates(chainId, campaign) {
  // Case-preserving identity for Solana; do not force lower().
  const r = await pool.query(
    `with v as (
       select
         count(*) filter (where block_timestamp >= now() - interval '1 hour') as votes_1h,
         count(*) filter (where block_timestamp >= now() - interval '24 hours') as votes_24h,
         count(*) filter (where block_timestamp >= now() - interval '7 days') as votes_7d,
         count(*) as votes_all_time,
         count(*) filter (where block_timestamp >= now() - interval '24 hours') as b0,
         count(*) filter (
           where block_timestamp < now() - interval '24 hours'
             and block_timestamp >= now() - interval '48 hours'
         ) as b1,
         count(*) filter (
           where block_timestamp < now() - interval '48 hours'
             and block_timestamp >= now() - interval '72 hours'
         ) as b2,
         max(block_timestamp) as last_vote_at
       from public.votes
       where chain_id=$1
         and (campaign_address = $2 or lower(campaign_address) = lower($2))
         and status='confirmed'
     )
     select
       coalesce(votes_1h,0)::int as votes_1h,
       coalesce(votes_24h,0)::int as votes_24h,
       coalesce(votes_7d,0)::int as votes_7d,
       coalesce(votes_all_time,0)::int as votes_all_time,
       (coalesce(b0,0) * 1.0 + coalesce(b1,0) * 0.5 + coalesce(b2,0) * 0.25) as trending_score,
       last_vote_at
     from v`,
    [chainId, campaign],
  );
  const x = r.rows[0] || {
    votes_1h: 0,
    votes_24h: 0,
    votes_7d: 0,
    votes_all_time: 0,
    trending_score: 0,
    last_vote_at: null,
  };
  await pool.query(
    `insert into public.vote_aggregates(
       chain_id, campaign_address, votes_1h, votes_24h, votes_7d, votes_all_time,
       trending_score, last_vote_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,now())
     on conflict (chain_id, campaign_address) do update set
       votes_1h = excluded.votes_1h,
       votes_24h = excluded.votes_24h,
       votes_7d = excluded.votes_7d,
       votes_all_time = excluded.votes_all_time,
       trending_score = excluded.trending_score,
       last_vote_at = excluded.last_vote_at,
       updated_at = now()`,
    [
      chainId,
      campaign,
      x.votes_1h,
      x.votes_24h,
      x.votes_7d,
      x.votes_all_time,
      x.trending_score,
      x.last_vote_at,
    ],
  );
  return x;
}

export async function solanaVoteIngest(req, res) {
  if (req.method !== "POST") return badMethod(res);

  try {
    const body = await readJson(req);
    const chainId = Number(body.chainId || 101);
    if (!isSolanaChain(chainId)) {
      return json(res, 400, { error: "chainId must be Solana (101).", code: "NOT_A_SOLANA_CHAIN" });
    }

    const signature = String(body.signature || body.txHash || "").trim();
    const campaignAddress = String(body.campaignAddress || "").trim();
    const voterAddress = String(body.voterAddress || body.walletAddress || "").trim();
    if (!signature) return json(res, 400, { error: "signature is required." });
    if (!isSolanaAddress(campaignAddress)) {
      return json(res, 400, { error: "campaignAddress must be a Solana public key." });
    }
    if (!isSolanaAddress(voterAddress)) {
      return json(res, 400, { error: "voterAddress must be a Solana public key." });
    }

    const treasury = solanaVoteTreasury();
    if (!treasury) {
      return json(res, 503, {
        error: "Solana vote treasury is not configured (SOLANA_VOTE_TREASURY_ADDRESS).",
        code: "SOLANA_VOTE_TREASURY_MISSING",
      });
    }

    const rpcUrl = String(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com").trim();
    const tx = await rpcCall(rpcUrl, "getTransaction", [
      signature,
      { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx) {
      return json(res, 404, { error: "Transaction not found (wait for confirmation and retry)." });
    }

    const transfer = extractSolTransfer(tx, voterAddress, treasury);
    if (!transfer) {
      return json(res, 400, {
        error: "Transaction is not a confirmed SOL transfer from voter to vote treasury.",
        code: "SOLANA_VOTE_TRANSFER_INVALID",
      });
    }

    const minLamports = minVoteLamports();
    if (transfer.amountLamports < minLamports) {
      return json(res, 400, {
        error: `Vote amount too small (min ${minLamports} lamports).`,
        code: "SOLANA_VOTE_AMOUNT_TOO_SMALL",
      });
    }

    const blockTs = transfer.blockTime
      ? new Date(Number(transfer.blockTime) * 1000)
      : new Date();

    await pool.query(
      `insert into public.votes (
         chain_id, campaign_address, voter_address, asset_address, amount_raw,
         tx_hash, log_index, block_number, block_timestamp, meta, status
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed')
       on conflict do nothing`,
      [
        chainId,
        campaignAddress,
        voterAddress,
        SYSTEM_PROGRAM,
        transfer.amountLamports.toString(),
        signature,
        0,
        Number(transfer.slot || 0),
        blockTs.toISOString(),
        `solana_up_vote_usd_${UPVOTE_USD_TARGET}`,
      ],
    ).catch(async (err) => {
      // Unique index may be named votes_uq_event — retry with explicit conflict target if needed
      if (String(err?.code) === "42P10" || /no unique|ON CONFLICT/i.test(String(err?.message || ""))) {
        await pool.query(
          `insert into public.votes (
             chain_id, campaign_address, voter_address, asset_address, amount_raw,
             tx_hash, log_index, block_number, block_timestamp, meta, status
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed')
           on conflict (chain_id, tx_hash, log_index) do nothing`,
          [
            chainId,
            campaignAddress,
            voterAddress,
            SYSTEM_PROGRAM,
            transfer.amountLamports.toString(),
            signature,
            0,
            Number(transfer.slot || 0),
            blockTs.toISOString(),
            `solana_up_vote_usd_${UPVOTE_USD_TARGET}`,
          ],
        );
        return;
      }
      throw err;
    });

    const agg = await patchVoteAggregates(chainId, campaignAddress);

    return json(res, 200, {
      ok: true,
      items: [
        {
          chainId,
          campaignAddress,
          voterAddress,
          txHash: signature,
          amountLamports: transfer.amountLamports.toString(),
          votes24h: agg.votes_24h,
          votesAllTime: agg.votes_all_time,
          treasury,
        },
      ],
    });
  } catch (error) {
    console.error("[solana-vote-ingest]", error);
    return json(res, 500, {
      error: String(error?.message || "Solana vote ingest failed"),
      code: "SOLANA_VOTE_INGEST_ERROR",
    });
  }
}

export default solanaVoteIngest;
