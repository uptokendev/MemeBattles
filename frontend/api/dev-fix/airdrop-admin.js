import { pool } from "../../server/db.js";

function methodAllowed(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  res.status(405).json({ error: "Method not allowed" });
  return false;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function json(res, status, payload) {
  return res.status(status).json({ ok: status < 400, ...payload });
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "42883";
}

function parseNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseLimit(value, fallback = 50, max = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function chainLabel(chainId) {
  const id = Number(chainId);
  return id === 101 || id === 102 ? "SOL" : "BNB";
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function mapEpoch(row) {
  return {
    id: Number(row.id),
    epochLabel: row.epoch_label,
    chainId: Number(row.chain_id),
    chain: chainLabel(row.chain_id),
    tokenSymbol: row.token_symbol,
    prizePoolAmount: String(row.prize_pool_amount || "0"),
    prizePoolUsd: row.prize_pool_usd == null ? null : String(row.prize_pool_usd),
    reservedAmountRaw: String(row.reserved_amount_raw || "0"),
    status: row.status,
    scoringStatus: row.scoring_status || "pending",
    scoringVersion: row.scoring_version || "airdrop_v1",
    fundingSource: row.funding_source || "fee_bucket",
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    nextDropAt: toIso(row.next_drop_at),
    publishedAt: toIso(row.published_at),
    claimsOpenAt: toIso(row.claims_open_at),
    claimsCloseAt: toIso(row.claims_close_at),
    merkleRoot: row.merkle_root || null,
    contractAddress: row.contract_address || null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    candidateCount: Number(row.candidate_count || 0),
    eligibleCount: Number(row.eligible_count || 0),
    winnerCount: Number(row.winner_count || 0),
    totalPayoutRaw: String(row.total_payout_raw || "0"),
    feeBucketBalanceRaw: String(row.fee_bucket_balance_raw || "0"),
    missingFundingRaw: String(row.missing_funding_raw || "0"),
  };
}

function mapCandidate(row) {
  return {
    id: Number(row.id),
    epochId: Number(row.epoch_id),
    walletAddress: row.wallet_address,
    role: row.role,
    isEligible: Boolean(row.is_eligible),
    reasonCodes: Array.isArray(row.reason_codes) ? row.reason_codes : [],
    activityScore: String(row.activity_score || "0"),
    smallerUserScore: String(row.smaller_user_score || "0"),
    whalePenalty: String(row.whale_penalty || "0"),
    finalWeight: String(row.final_weight || "0"),
    eventCount: Number(row.event_count || row.metadata_json?.eventCount || 0),
    activityAmountRaw: String(row.activity_amount_raw || row.metadata_json?.activityAmountRaw || "0"),
    activityAmountUsd: row.activity_amount_usd == null ? null : String(row.activity_amount_usd),
    lastActivityAt: toIso(row.last_activity_at || row.metadata_json?.lastActivityAt),
    computedAt: toIso(row.computed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapWinner(row) {
  return {
    id: Number(row.id),
    epochId: Number(row.epoch_id),
    candidateId: row.candidate_id == null ? null : Number(row.candidate_id),
    walletAddress: row.wallet_address,
    role: row.role,
    winnerRank: Number(row.winner_rank),
    weightTier: Number(row.weight_tier || 0),
    weightValue: String(row.weight_value || "0"),
    activityScore: String(row.activity_score || "0"),
    amountRaw: String(row.amount_raw || "0"),
    merkleIndex: row.merkle_index == null ? null : Number(row.merkle_index),
    claimStatus: row.claim_status || "not_started",
    txHash: row.tx_hash || null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function getEpochRows(limit = 25) {
  const { rows } = await pool.query(
    `select e.*,
            count(distinct c.id)::int as candidate_count,
            count(distinct c.id) filter (where c.is_eligible)::int as eligible_count,
            count(distinct w.id)::int as winner_count,
            coalesce(sum(distinct w.amount_raw), 0)::text as total_payout_raw,
            f.fee_bucket_balance_raw,
            f.missing_funding_raw
       from public.airdrop_epochs e
       left join public.airdrop_candidates c on c.epoch_id = e.id
       left join public.airdrop_winners w on w.epoch_id = e.id
       left join public.airdrop_epoch_funding f on f.epoch_id = e.id
      group by e.id, f.fee_bucket_balance_raw, f.missing_funding_raw
      order by e.starts_at desc nulls last, e.id desc
      limit $1`,
    [limit],
  );
  return rows.map(mapEpoch);
}

export async function airdropAdminOps(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  try {
    const epochs = await getEpochRows(parseLimit(req.query?.limit, 25, 100));
    const currentEpochId = parseNumber(req.query?.epochId, epochs[0]?.id || null);

    const [runs, actions, funding] = await Promise.all([
      pool.query(
        `select * from public.airdrop_scoring_runs
          where ($1::bigint is null or epoch_id = $1::bigint)
          order by created_at desc
          limit 20`,
        [currentEpochId],
      ),
      pool.query(
        `select id, epoch_id, admin_email, action, target, old_value, new_value, reason, tx_hash, created_at
           from public.airdrop_admin_reviews
          order by created_at desc
          limit 50`,
      ),
      pool.query(
        `select chain_id,
                token_symbol,
                coalesce(sum(case when direction = 'credit' then amount_raw else -amount_raw end), 0)::text as balance_raw,
                count(*)::int as entry_count
           from public.airdrop_fee_buckets
          group by chain_id, token_symbol
          order by chain_id asc`,
      ),
    ]);

    return json(res, 200, {
      epochs,
      currentEpochId,
      scoringRuns: runs.rows,
      actions: actions.rows,
      funding: funding.rows.map((row) => ({ ...row, chain: chainLabel(row.chain_id) })),
      summary: {
        epochCount: epochs.length,
        reviewRequired: epochs.filter((epoch) => epoch.scoringStatus === "reviewed" && epoch.status === "ready").length,
        openClaims: epochs.filter((epoch) => epoch.status === "claim_open").length,
        pendingScoring: epochs.filter((epoch) => epoch.scoringStatus === "pending" || epoch.scoringStatus === "computed").length,
      },
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/security/rewards/airdrops ops]", error);
    if (schemaMissing(error)) return json(res, 200, { epochs: [], scoringRuns: [], actions: [], funding: [], summary: {}, schemaReady: false, materializedAt: null });
    return json(res, 500, { error: "Server error" });
  }
}

export async function airdropAdminCandidates(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const epochId = parseNumber(req.query?.epochId);
  if (!epochId) return json(res, 400, { error: "epochId is required" });
  const limit = parseLimit(req.query?.limit, 100, 1000);
  try {
    const { rows } = await pool.query(
      `select c.*,
              (c.activity_score * c.smaller_user_score * c.whale_penalty) as final_weight,
              nullif(c.metadata_json->>'eventCount', '')::int as event_count,
              nullif(c.metadata_json->>'activityAmountRaw', '') as activity_amount_raw,
              nullif(c.metadata_json->>'activityAmountUsd', '') as activity_amount_usd,
              nullif(c.metadata_json->>'lastActivityAt', '') as last_activity_at
         from public.airdrop_candidates c
        where c.epoch_id = $1
        order by c.is_eligible desc, final_weight desc, c.activity_score desc, c.id asc
        limit $2`,
      [epochId, limit],
    );
    return json(res, 200, { items: rows.map(mapCandidate), epochId, limit, materializedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[api/security/rewards/airdrops candidates]", error);
    if (schemaMissing(error)) return json(res, 200, { items: [], epochId, limit, schemaReady: false, materializedAt: null });
    return json(res, 500, { error: "Server error" });
  }
}

export async function airdropAdminWinners(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const epochId = parseNumber(req.query?.epochId);
  if (!epochId) return json(res, 400, { error: "epochId is required" });
  try {
    const { rows } = await pool.query(
      `select w.*, c.status as claim_status, c.tx_hash
         from public.airdrop_winners w
         left join public.airdrop_claims c on c.winner_id = w.id
        where w.epoch_id = $1
        order by w.winner_rank asc`,
      [epochId],
    );
    return json(res, 200, { items: rows.map(mapWinner), epochId, materializedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[api/security/rewards/airdrops winners]", error);
    if (schemaMissing(error)) return json(res, 200, { items: [], epochId, schemaReady: false, materializedAt: null });
    return json(res, 500, { error: "Server error" });
  }
}

export async function airdropAdminRefreshCandidates(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readBody(req);
  const epochId = parseNumber(body.epochId);
  const minScore = parseNumber(body.minScore, 1);
  if (!epochId) return json(res, 400, { error: "epochId is required" });
  try {
    const { rows } = await pool.query(`select * from public.airdrop_refresh_candidates($1::bigint, $2::numeric)`, [epochId, minScore]);
    await pool.query(
      `insert into public.airdrop_admin_reviews (epoch_id, admin_email, action, target, new_value, reason)
       values ($1, $2, 'refresh_candidates', 'airdrop_candidates', $3::jsonb, $4)`,
      [epochId, body.adminEmail || null, JSON.stringify({ refreshed: rows.length, minScore }), body.reason || "Refreshed airdrop candidates"],
    );
    return json(res, 200, { status: "computed", refreshed: rows.length, items: rows, materializedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[api/security/rewards/airdrops refresh-candidates]", error);
    if (schemaMissing(error)) return json(res, 503, { error: "Airdrop scoring schema is not deployed yet." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function airdropAdminPublishWinners(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readBody(req);
  const epochId = parseNumber(body.epochId);
  const winnerCount = parseNumber(body.winnerCount, 25);
  if (!epochId) return json(res, 400, { error: "epochId is required" });
  try {
    const { rows } = await pool.query(`select * from public.airdrop_publish_weighted_winners($1::bigint, $2::int)`, [epochId, winnerCount]);
    await pool.query(
      `insert into public.airdrop_admin_reviews (epoch_id, admin_email, action, target, new_value, reason)
       values ($1, $2, 'publish_weighted_winners', 'airdrop_winners', $3::jsonb, $4)`,
      [epochId, body.adminEmail || null, JSON.stringify({ winnerCount, published: rows.length }), body.reason || "Published weighted airdrop winners"],
    );
    return json(res, 200, { status: "review_required", published: rows.length, items: rows, materializedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[api/security/rewards/airdrops publish-winners]", error);
    if (schemaMissing(error)) return json(res, 503, { error: "Airdrop scoring schema is not deployed yet." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function airdropAdminPublishEpoch(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readBody(req);
  const epochId = parseNumber(body.epochId);
  if (!epochId) return json(res, 400, { error: "epochId is required" });
  const status = body.openClaims ? "claim_open" : "drop_complete";
  try {
    const { rows } = await pool.query(
      `update public.airdrop_epochs
          set status = $2,
              scoring_status = 'published',
              published_at = coalesce(published_at, now()),
              claims_open_at = case when $2 = 'claim_open' then coalesce(claims_open_at, now()) else claims_open_at end,
              updated_at = now()
        where id = $1
        returning *`,
      [epochId, status],
    );
    if (!rows[0]) return json(res, 404, { error: "Airdrop epoch not found" });
    await pool.query(
      `insert into public.airdrop_admin_reviews (epoch_id, admin_email, action, target, old_value, new_value, reason, tx_hash)
       values ($1, $2, 'publish_epoch', 'airdrop_epochs', null, $3::jsonb, $4, $5)`,
      [epochId, body.adminEmail || null, JSON.stringify({ status, openClaims: Boolean(body.openClaims) }), body.reason || "Published airdrop epoch", body.txHash || null],
    );
    return json(res, 200, { status, epoch: mapEpoch({ ...rows[0], candidate_count: 0, eligible_count: 0, winner_count: 0, total_payout_raw: 0 }), materializedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[api/security/rewards/airdrops publish-epoch]", error);
    if (schemaMissing(error)) return json(res, 503, { error: "Airdrop schema is not deployed yet." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function airdropAdminCandidateDecision(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readBody(req);
  const candidateId = parseNumber(body.candidateId);
  if (!candidateId) return json(res, 400, { error: "candidateId is required" });
  const include = Boolean(body.include);
  const reasonCode = include ? "ADMIN_INCLUDED" : "ADMIN_EXCLUDED";
  try {
    const { rows } = await pool.query(
      `update public.airdrop_candidates
          set is_eligible = $2,
              reason_codes = case
                when $2 = true then array_remove(reason_codes, 'ADMIN_EXCLUDED') || array['ADMIN_INCLUDED']
                else array_remove(reason_codes, 'ADMIN_INCLUDED') || array['ADMIN_EXCLUDED']
              end,
              metadata_json = metadata_json || $3::jsonb,
              updated_at = now()
        where id = $1
        returning *`,
      [candidateId, include, JSON.stringify({ adminDecisionReason: body.reason || reasonCode, adminDecisionAt: new Date().toISOString() })],
    );
    if (!rows[0]) return json(res, 404, { error: "Airdrop candidate not found" });
    await pool.query(
      `insert into public.airdrop_admin_reviews (epoch_id, admin_email, action, target, old_value, new_value, reason)
       values ($1, $2, $3, $4, null, $5::jsonb, $6)`,
      [rows[0].epoch_id, body.adminEmail || null, include ? "include_candidate" : "exclude_candidate", String(candidateId), JSON.stringify({ candidateId, include }), body.reason || reasonCode],
    );
    return json(res, 200, { candidate: mapCandidate(rows[0]), materializedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[api/security/rewards/airdrops candidate-decision]", error);
    if (schemaMissing(error)) return json(res, 503, { error: "Airdrop schema is not deployed yet." });
    return json(res, 500, { error: "Server error" });
  }
}
