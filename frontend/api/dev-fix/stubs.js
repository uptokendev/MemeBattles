import { pool } from "../../server/db.js";
import { normalizeAddress } from "../../server/http.js";

function methodAllowed(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  res.status(405).json({ error: "Method not allowed" });
  return false;
}

function getQuery(req) {
  return req.query || {};
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

function parseLimit(value, fallback = 20, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function parseChainId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function json(res, status, payload) {
  return res.status(status).json({ ok: status < 400, ...payload });
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function isSolanaChain(chainId) {
  return Number(chainId) === 101 || Number(chainId) === 102;
}

function chainLabel(chainId) {
  return isSolanaChain(chainId) ? "SOL" : "BNB";
}

function tokenSymbol(chainId, value) {
  return String(value || chainLabel(chainId)).toUpperCase();
}

function normalizeWallet(value, chainId) {
  return normalizeAddress(value, chainId || 56);
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function nextMondayUtcIso() {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const daysUntilMonday = (8 - todayUtc.getUTCDay()) % 7 || 7;
  return new Date(todayUtc.getTime() + daysUntilMonday * 24 * 60 * 60 * 1000).toISOString();
}

function parseJson(value, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function addRaw(a, b) {
  try {
    return (BigInt(a || "0") + BigInt(b || "0")).toString();
  } catch {
    return String(Number(a || 0) + Number(b || 0));
  }
}

function mapWinner(row) {
  const chainId = Number(row.chain_id || row.chainId || 56);
  const role = String(row.role || row.program || "trader").toLowerCase().includes("creator") ? "creator" : "trader";
  const amount = String(row.amount_raw || row.payout_amount || "0");
  const createdAt = toIso(row.created_at) || toIso(row.published_at) || toIso(row.ends_at) || new Date(0).toISOString();
  const metadata = parseJson(row.metadata_json, {});

  return {
    id: Number(row.id || 0),
    drawId: Number(row.epoch_id || row.draw_id || 0),
    epochId: Number(row.epoch_id || 0),
    epochLabel: String(row.epoch_label || "Weekly Airdrop"),
    date: toIso(row.ends_at) || createdAt,
    chainId,
    chain: chainLabel(chainId),
    program: role === "creator" ? "airdrop_creator" : "airdrop_trader",
    role,
    walletAddress: String(row.wallet_address || row.walletAddress || ""),
    winnerRank: Number(row.winner_rank || row.rank || 0),
    weightTier: Number(row.weight_tier || 0),
    weightValue: Number(row.weight_value || 0),
    activityScore: String(row.activity_score || "0"),
    payoutAmount: amount,
    amount,
    tokenSymbol: tokenSymbol(chainId, row.token_symbol),
    metadataJson: metadata,
    createdAt,
    updatedAt: toIso(row.updated_at) || createdAt,
  };
}

function mapReward(row) {
  const chainId = Number(row.chain_id || 56);
  const amountRaw = String(row.amount_raw || "0");
  const role = String(row.role || "trader").toLowerCase() === "creator" ? "creator" : "trader";
  const claimStatus = row.claim_status || row.status || "claimable";
  const proof = Array.isArray(row.merkle_proof) ? row.merkle_proof : parseJson(row.merkle_proof, []);
  const claimExecutionEnabled = chainLabel(chainId) === "BNB" && Boolean(row.merkle_root && proof.length);

  return {
    id: Number(row.id),
    rewardId: `airdrop:${row.epoch_id}:${row.id}`,
    type: "airdrop",
    program: role === "creator" ? "airdrop_creator" : "airdrop_trader",
    epochId: Number(row.epoch_id),
    epochLabel: String(row.epoch_label || "Weekly Airdrop"),
    chainId,
    chain: chainLabel(chainId),
    tokenSymbol: tokenSymbol(chainId, row.token_symbol),
    walletAddress: String(row.wallet_address || ""),
    role,
    amountRaw,
    amount: amountRaw,
    status: claimStatus,
    claimStatus,
    winnerRank: Number(row.winner_rank || 0),
    claimId: row.claim_id ? Number(row.claim_id) : null,
    merkleIndex: row.merkle_index == null ? null : Number(row.merkle_index),
    merkleProof: proof,
    merkleRoot: row.merkle_root || null,
    contractAddress: row.contract_address || null,
    claimExecutionEnabled,
    claimDisabledReason: claimExecutionEnabled
      ? null
      : chainLabel(chainId) === "SOL"
        ? "Solana airdrop claiming is disabled until the Solana reward vault/program is complete."
        : "BNB claim proof is not published yet.",
    txHash: row.tx_hash || null,
    claimedAt: toIso(row.claimed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function readClaimableRewards({ wallet, chainId, limit = 50, includeHistory = false }) {
  const statusFilter = includeHistory
    ? "and coalesce(c.status, case when c.claimed_at is null then 'claimable' else 'claimed' end) in ('claimed', 'submitted')"
    : "and coalesce(c.status, 'claimable') in ('claimable', 'failed')";

  const { rows } = await pool.query(
    `select w.id,
            w.epoch_id,
            w.wallet_address,
            w.role,
            w.amount_raw,
            w.winner_rank,
            w.merkle_index,
            w.merkle_proof,
            w.metadata_json,
            w.created_at,
            w.updated_at,
            e.epoch_label,
            e.chain_id,
            e.token_symbol,
            e.status as epoch_status,
            e.merkle_root,
            e.contract_address,
            c.id as claim_id,
            c.status as claim_status,
            c.tx_hash,
            c.claimed_at
       from public.airdrop_winners w
       join public.airdrop_epochs e on e.id = w.epoch_id
       left join public.airdrop_claims c on c.winner_id = w.id
      where lower(w.wallet_address) = lower($1)
        and ($2::int is null or e.chain_id = $2::int)
        and e.status in ('claim_open', 'drop_complete', 'closed')
        ${statusFilter}
      order by coalesce(c.claimed_at, w.created_at) desc, w.winner_rank asc
      limit $3`,
    [wallet, chainId, limit],
  );

  return rows.map(mapReward);
}

async function readCurrentAirdrop(chainId) {
  const { rows } = await pool.query(
    `select id,
            epoch_label,
            chain_id,
            token_symbol,
            prize_pool_amount,
            prize_pool_usd,
            status,
            next_drop_at,
            starts_at,
            ends_at,
            published_at
       from public.airdrop_epochs
      where ($1::int is null or chain_id = $1::int)
        and status in ('funding', 'ready', 'drop_complete', 'claim_open')
      order by starts_at desc nulls last, id desc
      limit 1`,
    [chainId],
  );

  const row = rows[0];
  if (!row) {
    const effectiveChainId = chainId || 56;
    return {
      id: null,
      chain: chainLabel(effectiveChainId),
      chainId: effectiveChainId,
      prizePoolAmount: "0",
      prizePoolUsd: null,
      tokenSymbol: tokenSymbol(effectiveChainId),
      status: "funding",
      nextDropAt: nextMondayUtcIso(),
      epochLabel: "Next weekly airdrop",
      startsAt: null,
      endsAt: null,
      publishedAt: null,
      empty: true,
    };
  }

  return {
    id: Number(row.id),
    chain: chainLabel(row.chain_id),
    chainId: Number(row.chain_id),
    prizePoolAmount: String(row.prize_pool_amount || "0"),
    prizePoolUsd: row.prize_pool_usd == null ? null : String(row.prize_pool_usd),
    tokenSymbol: tokenSymbol(row.chain_id, row.token_symbol),
    status: String(row.status || "funding"),
    nextDropAt: toIso(row.next_drop_at) || toIso(row.ends_at) || nextMondayUtcIso(),
    epochLabel: String(row.epoch_label || "Weekly Airdrop"),
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    publishedAt: toIso(row.published_at),
    empty: false,
  };
}

export async function rewardsMe(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const chainId = parseChainId(q.chainId);
  const address = normalizeWallet(q.address || q.walletAddress, chainId);
  if (!address) return json(res, 400, { error: "Invalid address" });

  try {
    const claimable = await readClaimableRewards({ wallet: address, chainId, limit: parseLimit(q.limit, 50, 100) });
    const history = await readClaimableRewards({ wallet: address, chainId, limit: 100, includeHistory: true });
    const claimableAmount = claimable.reduce((sum, item) => addRaw(sum, item.amountRaw), "0");
    const claimedAmount = history.reduce((sum, item) => addRaw(sum, item.amountRaw), "0");

    return json(res, 200, {
      address,
      chainId,
      claimable,
      totals: {
        claimableAmount,
        claimedAmount,
        expiredAmount: "0",
      },
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/rewards/me]", error);
    if (schemaMissing(error)) {
      return json(res, 200, { address, chainId, claimable: [], totals: { claimableAmount: "0", claimedAmount: "0", expiredAmount: "0" }, materializedAt: null, schemaReady: false });
    }
    return json(res, 500, { error: "Server error" });
  }
}

export async function rewardsHistory(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const chainId = parseChainId(q.chainId);
  const address = normalizeWallet(q.address || q.walletAddress, chainId);
  if (!address) return json(res, 400, { error: "Invalid address" });

  try {
    const items = await readClaimableRewards({ wallet: address, chainId, limit: parseLimit(q.limit, 20, 100), includeHistory: true });
    return json(res, 200, { items, address, chainId, limit: parseLimit(q.limit, 20, 100), cursor: q.cursor || null, nextCursor: null });
  } catch (error) {
    console.error("[api/rewards/me/history]", error);
    if (schemaMissing(error)) return json(res, 200, { items: [], address, chainId, limit: parseLimit(q.limit, 20, 100), cursor: q.cursor || null, nextCursor: null, schemaReady: false });
    return json(res, 500, { error: "Server error" });
  }
}

export async function rewardsClaims(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  const q = getQuery(req);
  const chainId = parseChainId(q.chainId);
  const address = normalizeWallet(q.address || q.walletAddress, chainId);

  if (req.method === "GET") {
    if (!address) return json(res, 400, { error: "Invalid address" });
    try {
      const items = await readClaimableRewards({ wallet: address, chainId, limit: parseLimit(q.limit, 20, 100) });
      return json(res, 200, { items, address, chainId, limit: parseLimit(q.limit, 20, 100), materializedAt: new Date().toISOString() });
    } catch (error) {
      console.error("[api/rewards/me/claims]", error);
      if (schemaMissing(error)) return json(res, 200, { items: [], address, chainId, limit: parseLimit(q.limit, 20, 100), materializedAt: null, schemaReady: false });
      return json(res, 500, { error: "Server error" });
    }
  }

  const body = await readBody(req);
  const claimAddress = normalizeWallet(body.address || body.walletAddress || address, body.chainId || chainId);
  const rewardId = Number(body.winnerId || body.id || String(body.rewardId || "").split(":").pop());
  if (!claimAddress || !Number.isFinite(rewardId)) return json(res, 400, { error: "Invalid claim request" });

  try {
    const { rows } = await pool.query(
      `select w.id,
              w.epoch_id,
              w.wallet_address,
              w.amount_raw,
              w.merkle_index,
              w.merkle_proof,
              e.chain_id,
              e.merkle_root,
              e.contract_address
         from public.airdrop_winners w
         join public.airdrop_epochs e on e.id = w.epoch_id
        where w.id = $1
          and lower(w.wallet_address) = lower($2)
        limit 1`,
      [rewardId, claimAddress],
    );
    const row = rows[0];
    if (!row) return json(res, 404, { error: "Airdrop reward not found" });
    if (isSolanaChain(row.chain_id)) return json(res, 409, { error: "Solana airdrop claiming is disabled until the Solana reward vault/program is complete." });

    const proof = Array.isArray(row.merkle_proof) ? row.merkle_proof : parseJson(row.merkle_proof, []);
    if (!row.merkle_root || !row.contract_address || proof.length === 0) {
      return json(res, 409, { error: "BNB claim proof is not published yet." });
    }

    const { rows: claimRows } = await pool.query(
      `insert into public.airdrop_claims (winner_id, wallet_address, chain_id, status, tx_hash, claim_payload, updated_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, now())
       on conflict (winner_id) do update set
         status = excluded.status,
         tx_hash = coalesce(excluded.tx_hash, public.airdrop_claims.tx_hash),
         claim_payload = excluded.claim_payload,
         updated_at = now()
       returning id, status, tx_hash, created_at, updated_at`,
      [
        row.id,
        claimAddress,
        row.chain_id,
        body.txHash ? "submitted" : "claimable",
        body.txHash || null,
        JSON.stringify({
          epochId: Number(row.epoch_id),
          index: Number(row.merkle_index),
          account: claimAddress,
          amount: String(row.amount_raw || "0"),
          merkleProof: proof,
          merkleRoot: row.merkle_root,
          contractAddress: row.contract_address,
        }),
      ],
    );

    return json(res, 200, {
      claim: claimRows[0],
      transaction: {
        chain: "BNB",
        contractAddress: row.contract_address,
        functionName: "claim",
        args: [Number(row.epoch_id), Number(row.merkle_index), claimAddress, String(row.amount_raw || "0"), proof],
      },
    });
  } catch (error) {
    console.error("[api/rewards/me/claims POST]", error);
    if (schemaMissing(error)) return json(res, 503, { error: "Airdrop reward schema is not deployed yet." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function rewardsEligibility(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const chainId = parseChainId(q.chainId);
  const address = normalizeWallet(q.address || q.walletAddress, chainId);
  if (!address) return json(res, 400, { error: "Invalid address" });

  try {
    const { rows } = await pool.query(
      `select c.id,
              c.epoch_id,
              e.chain_id,
              c.role as program,
              c.is_eligible,
              c.reason_codes,
              c.activity_score,
              c.computed_at,
              c.created_at,
              c.updated_at,
              e.starts_at,
              e.ends_at,
              e.epoch_label
         from public.airdrop_candidates c
         join public.airdrop_epochs e on e.id = c.epoch_id
        where lower(c.wallet_address) = lower($1)
          and ($2::int is null or e.chain_id = $2::int)
        order by c.computed_at desc nulls last, c.id desc
        limit $3`,
      [address, chainId, parseLimit(q.limit, 20, 100)],
    );
    return json(res, 200, {
      address,
      chainId,
      items: rows.map((row) => ({
        id: Number(row.id),
        epochId: Number(row.epoch_id),
        chainId: Number(row.chain_id),
        epochType: "weekly_airdrop",
        epochLabel: row.epoch_label,
        startAt: toIso(row.starts_at),
        endAt: toIso(row.ends_at),
        program: row.program === "creator" ? "airdrop_creator" : "airdrop_trader",
        isEligible: Boolean(row.is_eligible),
        reasonCodes: Array.isArray(row.reason_codes) ? row.reason_codes : [],
        activityScore: String(row.activity_score || "0"),
        computedAt: toIso(row.computed_at),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      })),
      limit: parseLimit(q.limit, 20, 100),
      program: q.program || null,
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/rewards/me/eligibility]", error);
    if (schemaMissing(error)) return json(res, 200, { address, chainId, items: [], limit: parseLimit(q.limit, 20, 100), program: q.program || null, materializedAt: null, schemaReady: false });
    return json(res, 500, { error: "Server error" });
  }
}

export async function airdropsCurrent(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const chainId = parseChainId(q.chainId);
  try {
    const current = await readCurrentAirdrop(chainId);
    return json(res, 200, { current, materializedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[api/airdrops/current]", error);
    if (schemaMissing(error)) {
      const current = await Promise.resolve({
        id: null,
        chain: chainLabel(chainId || 56),
        chainId: chainId || 56,
        prizePoolAmount: "0",
        prizePoolUsd: null,
        tokenSymbol: tokenSymbol(chainId || 56),
        status: "funding",
        nextDropAt: nextMondayUtcIso(),
        epochLabel: "Next weekly airdrop",
        empty: true,
      });
      return json(res, 200, { current, materializedAt: null, schemaReady: false });
    }
    return json(res, 500, { error: "Server error" });
  }
}

export async function airdropsPreviousWinners(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const chainId = parseChainId(q.chainId);
  const limit = parseLimit(q.limit, 20, 100);

  try {
    const { rows } = await pool.query(
      `select w.id,
              w.epoch_id,
              w.wallet_address,
              w.role,
              w.amount_raw,
              w.winner_rank,
              w.weight_tier,
              w.weight_value,
              w.activity_score,
              w.metadata_json,
              w.created_at,
              w.updated_at,
              e.epoch_label,
              e.chain_id,
              e.token_symbol,
              e.ends_at,
              e.published_at
         from public.airdrop_winners w
         join public.airdrop_epochs e on e.id = w.epoch_id
        where e.status in ('drop_complete', 'claim_open', 'closed')
          and ($1::int is null or e.chain_id = $1::int)
        order by e.ends_at desc nulls last, e.id desc, w.winner_rank asc
        limit $2`,
      [chainId, limit],
    );
    return json(res, 200, { items: rows.map(mapWinner), limit, materializedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[api/airdrops/previous-winners]", error);
    if (schemaMissing(error)) return json(res, 200, { items: [], limit, materializedAt: null, schemaReady: false });
    return json(res, 500, { error: "Server error" });
  }
}

export async function airdropWinners(req, res) {
  return airdropsPreviousWinners(req, res);
}

export async function internalAirdropDraws(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  try {
    const { rows } = await pool.query(
      `select id,
              epoch_label,
              chain_id,
              prize_pool_amount,
              token_symbol,
              status,
              starts_at,
              ends_at,
              published_at,
              claims_open_at,
              claims_close_at
         from public.airdrop_epochs
        order by starts_at desc nulls last, id desc
        limit 50`,
    );
    return json(res, 200, { items: rows.map((row) => ({ ...row, chain: chainLabel(row.chain_id) })), status: "ready", materializedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[api/internal/rewards/airdrops/draws]", error);
    if (schemaMissing(error)) return json(res, 200, { items: [], status: "schema_missing", materializedAt: null });
    return json(res, 500, { error: "Server error" });
  }
}

export async function internalAirdropDrawRun(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readBody(req);
  const chainId = parseChainId(body.chainId) || 56;
  const epochLabel = String(body.epochLabel || "Weekly Airdrop").trim();
  const prizePoolAmount = String(body.prizePoolAmount || "0");
  const token = tokenSymbol(chainId, body.tokenSymbol);

  try {
    const { rows } = await pool.query(
      `insert into public.airdrop_epochs (epoch_label, chain_id, token_symbol, prize_pool_amount, status, starts_at, ends_at, next_drop_at, metadata_json)
       values ($1, $2, $3, $4, 'funding', coalesce($5::timestamptz, now()), coalesce($6::timestamptz, now() + interval '7 days'), coalesce($7::timestamptz, now() + interval '7 days'), $8::jsonb)
       returning id, epoch_label, chain_id, token_symbol, prize_pool_amount, status, starts_at, ends_at, next_drop_at`,
      [epochLabel, chainId, token, prizePoolAmount, body.startsAt || null, body.endsAt || null, body.nextDropAt || null, JSON.stringify(body.metadata || {})],
    );
    return json(res, 202, { status: "created", drawId: rows[0]?.id || null, epoch: rows[0], materializedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[api/internal/rewards/airdrops/draws/run]", error);
    if (schemaMissing(error)) return json(res, 503, { error: "Airdrop schema is not deployed yet." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function internalRewardEpochStatus(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  if (req.method === "GET") {
    try {
      const current = await readCurrentAirdrop(parseChainId(getQuery(req).chainId));
      return json(res, 200, { status: current.status, currentEpochId: current.id, current, materializedAt: new Date().toISOString() });
    } catch (error) {
      if (schemaMissing(error)) return json(res, 200, { status: "schema_missing", currentEpochId: null, materializedAt: null });
      console.error("[api/internal/rewards/ops/epoch-status]", error);
      return json(res, 500, { error: "Server error" });
    }
  }
  return internalAirdropDrawRun(req, res);
}

export async function internalRewardClaimVault(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  try {
    const { rows } = await pool.query(
      `select chain_id,
              contract_address,
              merkle_root,
              sum(prize_pool_amount)::text as configured_pool
         from public.airdrop_epochs
        where contract_address is not null
        group by chain_id, contract_address, merkle_root
        order by max(updated_at) desc
        limit 20`,
    );
    return json(res, 200, { claimVault: rows, status: "ready", materializedAt: new Date().toISOString() });
  } catch (error) {
    if (schemaMissing(error)) return json(res, 200, { claimVault: null, status: "schema_missing", materializedAt: null });
    console.error("[api/internal/rewards/ops/claim-vault]", error);
    return json(res, 500, { error: "Server error" });
  }
}

export async function internalRewardRouting(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  return json(res, 200, {
    routes: [{ bucket: "airdrop", source: "existing_fee_structure", note: "No new airdrop fee is introduced by this route." }],
    status: "configured",
    materializedAt: new Date().toISOString(),
  });
}

export async function internalRewardPublications(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  const body = req.method === "POST" ? await readBody(req) : {};
  if (req.method === "POST" && body.epochId) {
    try {
      const status = body.openClaims ? "claim_open" : "drop_complete";
      const { rows } = await pool.query(
        `update public.airdrop_epochs
            set status = $2,
                published_at = coalesce(published_at, now()),
                claims_open_at = case when $2 = 'claim_open' then coalesce(claims_open_at, now()) else claims_open_at end,
                updated_at = now()
          where id = $1
          returning *`,
        [Number(body.epochId), status],
      );
      return json(res, 200, { publications: rows, status: rows[0]?.status || status, materializedAt: new Date().toISOString() });
    } catch (error) {
      if (schemaMissing(error)) return json(res, 503, { error: "Airdrop schema is not deployed yet." });
      console.error("[api/internal/rewards/ops/publications]", error);
      return json(res, 500, { error: "Server error" });
    }
  }
  return internalAirdropDraws(req, res);
}

export async function internalRewardAlerts(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  return json(res, 200, { alerts: [], status: "ready", materializedAt: new Date().toISOString() });
}

export async function internalRewardAdminActions(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  try {
    const { rows } = await pool.query(
      `select id, admin_email, action, target, old_value, new_value, reason, tx_hash, created_at
         from public.airdrop_admin_reviews
        order by created_at desc
        limit 100`,
    );
    return json(res, 200, { actions: rows, status: "ready", materializedAt: new Date().toISOString() });
  } catch (error) {
    if (schemaMissing(error)) return json(res, 200, { actions: [], status: "schema_missing", materializedAt: null });
    console.error("[api/internal/rewards/ops/admin-actions]", error);
    return json(res, 500, { error: "Server error" });
  }
}

export async function squadsLeaderboard(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  return json(res, 200, {
    items: [],
    currentEpochId: q.epochId ? Number(q.epochId) : null,
    materializedAt: null,
  });
}

export async function squadMembers(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  return json(res, 200, {
    items: [],
    recruiterCode: q.recruiterCode || null,
    walletAddress: q.walletAddress || null,
    currentEpochId: q.epochId ? Number(q.epochId) : null,
    materializedAt: null,
  });
}

export async function recruiterReplacements(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  return json(res, 200, {
    items: [],
    replacementQueue: [],
    materializedAt: null,
  });
}
