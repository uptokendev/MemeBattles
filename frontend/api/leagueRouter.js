import { pool } from "../server/db.js";
import { json } from "../server/http.js";
import league from "./league.js";
import leagueRecruiter from "./leagueRecruiter.js";
import monthlyLeagueTreasury from "./monthlyLeagueTreasury.js";
import { verifySolanaLeagueClaimTransaction } from "./lib/solanaLeagueClaimVerification.js";

function readRequest(req) {
  try {
    const base = `${req.protocol || "http"}://${req.headers?.host || "localhost"}`;
    const url = new URL(req.originalUrl || req.url || "", base);
    return {
      category: String(url.searchParams.get("category") || "").toLowerCase().trim(),
      monthId: String(url.searchParams.get("monthId") || "").trim(),
      wallet: String(url.searchParams.get("wallet") || "").trim(),
      search: url.search,
    };
  } catch {
    return { category: "", monthId: "", wallet: "", search: "" };
  }
}

function isSolanaLeagueRecord(req) {
  if (req.method !== "POST") return false;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const action = String(body.action || "").toLowerCase().trim();
  const chainId = Number(body.chainId);
  return action === "record" && (chainId === 101 || chainId === 102);
}

async function verifySolanaRecord(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const chainId = Number(body.chainId);
  const period = String(body.period || "").toLowerCase().trim();
  const epochStart = String(body.epochStart || "").trim();
  const category = String(body.category || "").toLowerCase().trim();
  const rank = Number(body.rank);
  const recipient = String(body.recipient || body.address || "").trim();
  const txHash = String(body.txHash || "").trim();

  const { rows } = await pool.query(
    `select recipient_address as "recipientAddress", amount_raw as "amountRaw"
       from public.league_epoch_winners
      where chain_id=$1
        and period=$2
        and epoch_start=$3::timestamptz
        and category=$4
        and rank=$5
      limit 1`,
    [chainId, period, epochStart, category, rank],
  );
  const winner = rows[0];
  if (!winner) {
    json(res, 404, { error: "Winner not found" });
    return false;
  }
  if (String(winner.recipientAddress || "").trim() !== recipient) {
    json(res, 403, { error: "Not the winner" });
    return false;
  }

  try {
    await verifySolanaLeagueClaimTransaction({
      chainId,
      period,
      epochStart,
      category,
      rank,
      recipient,
      amountRaw: String(winner.amountRaw),
      txHash,
    });
    return true;
  } catch (error) {
    console.error("[leagueRouter] Solana League record verification failed", {
      chainId,
      period,
      epochStart,
      category,
      rank,
      recipient,
      txHash,
      code: error?.code,
      message: error?.message,
    });
    json(res, Number(error?.status) || 409, {
      error: String(error?.message || "Solana League transaction verification failed"),
      code: String(error?.code || "SOLANA_LEAGUE_VERIFICATION_FAILED"),
    });
    return false;
  }
}

export default async function handler(req, res) {
  const request = readRequest(req);

  // Monthly treasury reads use the already-mounted /api/league route so this
  // remains deployable without broad server-router changes:
  // GET /api/league?monthId=202607&chainId=56
  // GET /api/league?monthId=202607&wallet=0x...&chainId=56
  if (request.monthId) {
    const suffix = request.wallet ? `/claimable/${request.wallet}` : "";
    const path = `/league/month/${request.monthId}${suffix}`;
    const proxyReq = {
      ...req,
      path,
      url: `${path}${request.search}`,
      originalUrl: `/api${path}${request.search}`,
    };
    return monthlyLeagueTreasury(proxyReq, res);
  }

  if (request.category === "recruiter_league") {
    return leagueRecruiter(req, res);
  }

  // A League payout must never become a DB-paid row from a syntactically valid
  // Solana signature alone. Verify the exact program/account tuple and exact
  // LeagueVault lamport delta before league.js consumes the nonce and records it.
  if (isSolanaLeagueRecord(req)) {
    const verified = await verifySolanaRecord(req, res);
    if (!verified) return;
  }

  return league(req, res);
}
