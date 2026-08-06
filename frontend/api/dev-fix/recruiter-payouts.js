import crypto from "crypto";
import { ethers } from "ethers";
import { pool } from "../../server/db.js";
import { badMethod, json, readJson, isAddress, isSolanaAddress } from "../../server/http.js";

const COOKIE_NAME = "mwz_recruiter_session";
const CHAINS = { bnb: { token: "BNB" }, solana: { token: "SOL" } };
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function sessionSecret() {
  const secret = String(process.env.RECRUITER_PORTAL_SESSION_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET || "").trim();
  if (secret) return secret;
  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    throw new Error("RECRUITER_PORTAL_SESSION_SECRET (or SESSION_SECRET / JWT_SECRET) is required in production");
  }
  return "memewarzone-local-dev-secret";
}

function signPayload(payload) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function decodeSession(token) {
  const raw = String(token || "").trim();
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || signPayload(payload) !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data?.recruiterId || !data?.walletAddress || !data?.exp) return null;
    if (Date.now() > Number(data.exp)) return null;
    return data;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = String(req.headers?.cookie || "");
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1));
  }
  return "";
}

function readBearerToken(req) {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "").trim();
  return header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

function normalizeChain(value) {
  const chain = String(value || "").trim().toLowerCase();
  return chain === "bnb" || chain === "solana" ? chain : "";
}

function normalizeWallet(chain, value) {
  const raw = String(value || "").trim();
  if (chain === "bnb") {
    const lower = raw.toLowerCase();
    return isAddress(lower) ? lower : "";
  }
  if (chain === "solana") return isSolanaAddress(raw) ? raw : "";
  return "";
}

function walletForStorage(value) {
  const raw = String(value || "").trim();
  if (isSolanaAddress(raw)) return raw;
  const lower = raw.toLowerCase();
  return isAddress(lower) ? lower : "";
}

function recruiterSignupWallet(recruiter) {
  return walletForStorage(recruiter?.metadata?.signup?.solanaWalletAddress || recruiter?.wallet_address);
}

function rawAmount(value) {
  if (value == null) return "0";
  return String(value).replace(/\.0+$/, "");
}

function buildPayoutWalletMessage({ recruiterId, chain, walletAddress, nonce }) {
  return [
    "MemeWarzone Recruiter Payout Wallet",
    "Action: LINK_PAYOUT_WALLET",
    `RecruiterId: ${recruiterId}`,
    `Chain: ${chain}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

function base58Decode(value) {
  const raw = String(value || "").trim();
  if (!raw) return Buffer.alloc(0);
  let n = 0n;
  for (const char of raw) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) return Buffer.alloc(0);
    n = n * 58n + BigInt(index);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let out = hex === "00" ? Buffer.alloc(0) : Buffer.from(hex, "hex");
  let leadingZeros = 0;
  for (const char of raw) {
    if (char !== "1") break;
    leadingZeros += 1;
  }
  if (leadingZeros) out = Buffer.concat([Buffer.alloc(leadingZeros), out]);
  return out;
}

function verifySolanaSignature({ walletAddress, message, signature }) {
  const publicKeyBytes = base58Decode(walletAddress);
  if (publicKeyBytes.length !== 32) return false;
  const signatureBytes = Buffer.from(String(signature || ""), "base64");
  if (signatureBytes.length !== 64) return false;
  const keyObject = crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]), format: "der", type: "spki" });
  return crypto.verify(null, Buffer.from(message, "utf8"), keyObject, signatureBytes);
}

function verifyWalletSignature({ chain, walletAddress, message, signature }) {
  if (chain === "solana") return verifySolanaSignature({ walletAddress, message, signature });
  const recovered = ethers.verifyMessage(message, signature).toLowerCase();
  return recovered === walletAddress.toLowerCase();
}

function balanceStatus({ claimableRaw, pendingRaw, payoutWallet }) {
  const claimable = BigInt(claimableRaw || "0");
  const pending = BigInt(pendingRaw || "0");
  if (!payoutWallet && (claimable > 0n || pending > 0n)) return "missing_payout_wallet";
  if (claimable > 0n) return "claimable";
  if (pending > 0n) return "pending_finality";
  return payoutWallet ? "pending_finality" : "missing_payout_wallet";
}

function emptyBalance(chain, payoutWallet = null) {
  return { chain, token: CHAINS[chain].token, claimableRaw: "0", pendingRaw: "0", payoutWallet, status: payoutWallet ? "pending_finality" : "missing_payout_wallet" };
}

async function getRecruiterFromSession(req) {
  const session = decodeSession(readCookie(req, COOKIE_NAME) || readBearerToken(req));
  if (!session) return null;
  const { rows } = await pool.query(
    `select id, wallet_address, code, display_name, status, metadata from public.recruiters where id = $1 limit 1`,
    [Number(session.recruiterId)],
  );
  const recruiter = rows[0] || null;
  if (!recruiter) return null;
  if (recruiterSignupWallet(recruiter) !== walletForStorage(session.walletAddress)) return null;
  return recruiter;
}

async function ensureRecruiterAccount(recruiter) {
  const wallet = recruiterSignupWallet(recruiter);
  const code = recruiter.code || null;
  const displayName = recruiter.display_name || code || null;
  const { rows } = await pool.query(
    `insert into public.recruiter_accounts (signup_wallet, code, display_name, status, updated_at)
     values ($1, $2, $3, 'active', now())
     on conflict (code) do update set signup_wallet = coalesce(public.recruiter_accounts.signup_wallet, excluded.signup_wallet), display_name = coalesce(excluded.display_name, public.recruiter_accounts.display_name), updated_at = now()
     returning recruiter_id, signup_wallet, code, display_name, total_estimated_usd, status`,
    [wallet, code, displayName],
  );
  return rows[0];
}

async function getBalances(recruiterId) {
  const { rows } = await pool.query(
    `with ledger as (
       select chain, token,
              coalesce(sum(amount_raw) filter (where status = 'claimable' and claim_id is null), 0)::numeric(78,0) as claimable_raw,
              coalesce(sum(amount_raw) filter (where status in ('pending', 'pending_finality')), 0)::numeric(78,0) as pending_raw
         from public.recruiter_reward_ledger
        where recruiter_id = $1
        group by chain, token
     ), wallets as (
       select chain, max(wallet_address) filter (where verified_at is not null) as payout_wallet
         from public.recruiter_payout_wallets
        where recruiter_id = $1
        group by chain
     )
     select coalesce(l.chain, w.chain) as chain,
            coalesce(l.token, case when coalesce(l.chain, w.chain) = 'solana' then 'SOL' else 'BNB' end) as token,
            coalesce(l.claimable_raw, 0)::text as claimable_raw,
            coalesce(l.pending_raw, 0)::text as pending_raw,
            w.payout_wallet
       from ledger l full join wallets w on w.chain = l.chain`,
    [recruiterId],
  );
  const byChain = new Map();
  for (const row of rows) {
    const chain = normalizeChain(row.chain);
    if (!chain) continue;
    const claimableRaw = rawAmount(row.claimable_raw);
    const pendingRaw = rawAmount(row.pending_raw);
    const payoutWallet = row.payout_wallet || null;
    byChain.set(chain, { chain, token: row.token || CHAINS[chain].token, claimableRaw, pendingRaw, payoutWallet, status: balanceStatus({ claimableRaw, pendingRaw, payoutWallet }) });
  }
  for (const chain of Object.keys(CHAINS)) if (!byChain.has(chain)) byChain.set(chain, emptyBalance(chain));
  return Array.from(byChain.values());
}

async function getClaims(recruiterId) {
  const { rows } = await pool.query(
    `select id, chain, token, amount_raw::text as amount_raw, payout_wallet, status, tx_hash, error, created_at, updated_at
       from public.recruiter_reward_claims
      where recruiter_id = $1
      order by created_at desc
      limit 50`,
    [recruiterId],
  );
  return rows.map((row) => ({ id: String(row.id), chain: row.chain, token: row.token, amountRaw: rawAmount(row.amount_raw), payoutWallet: row.payout_wallet, status: row.status, txHash: row.tx_hash || null, error: row.error || null, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function recruiterMePayouts(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  try {
    const recruiter = await getRecruiterFromSession(req);
    if (!recruiter) return json(res, 401, { error: "Connect your approved recruiter wallet to view payouts." });
    const account = await ensureRecruiterAccount(recruiter);
    return json(res, 200, { recruiterId: String(account.recruiter_id), code: account.code || recruiter.code || null, displayName: account.display_name || recruiter.display_name || null, totalEstimatedUsd: Number(account.total_estimated_usd || 0), balances: await getBalances(account.recruiter_id), claims: await getClaims(account.recruiter_id) });
  } catch (error) {
    if (schemaMissing(error)) return json(res, 503, { error: "Recruiter payout schema has not been applied yet.", code: "PAYOUT_SCHEMA_MISSING" });
    console.error("[recruiter payouts] failed", error);
    return json(res, 500, { error: "Server error" });
  }
}

export async function recruiterMeWalletLink(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  try {
    const recruiter = await getRecruiterFromSession(req);
    if (!recruiter) return json(res, 401, { error: "Connect your approved recruiter wallet to link payout wallets." });
    const account = await ensureRecruiterAccount(recruiter);
    const body = await readJson(req);
    const chain = normalizeChain(body.chain);
    const walletAddress = normalizeWallet(chain, body.walletAddress);
    const signature = String(body.signature || "").trim();
    const nonce = String(body.nonce || crypto.randomBytes(12).toString("hex")).trim();
    if (!chain) return json(res, 400, { error: "Invalid chain. Use bnb or solana." });
    if (!walletAddress) return json(res, 400, { error: `Invalid ${chain} payout wallet.` });
    const message = buildPayoutWalletMessage({ recruiterId: String(account.recruiter_id), chain, walletAddress, nonce });
    if (!signature) return json(res, 400, { error: "Missing signature", message, nonce });
    if (!verifyWalletSignature({ chain, walletAddress, message, signature })) {
      return json(res, 401, { error: `Invalid ${chain === "solana" ? "Solana" : "payout wallet"} signature`, message, nonce });
    }
    await pool.query(
      `insert into public.recruiter_payout_wallets (recruiter_id, chain, wallet_address, verified_at, verification_message, updated_at)
       values ($1, $2, $3, now(), $4, now())
       on conflict (recruiter_id, chain, wallet_address)
       do update set verified_at = now(), verification_message = excluded.verification_message, updated_at = now()`,
      [account.recruiter_id, chain, walletAddress, message],
    );
    return json(res, 200, { ok: true, chain, walletAddress, message, balances: await getBalances(account.recruiter_id) });
  } catch (error) {
    if (schemaMissing(error)) return json(res, 503, { error: "Recruiter payout schema has not been applied yet.", code: "PAYOUT_SCHEMA_MISSING" });
    console.error("[recruiter wallet link] failed", error);
    return json(res, 500, { error: "Server error" });
  }
}

export async function recruiterMeClaims(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const client = await pool.connect();
  try {
    const recruiter = await getRecruiterFromSession(req);
    if (!recruiter) return json(res, 401, { error: "Connect your approved recruiter wallet to claim rewards." });
    const account = await ensureRecruiterAccount(recruiter);
    const body = await readJson(req);
    const chain = normalizeChain(body.chain);
    if (!chain) return json(res, 400, { error: "Invalid chain. Use bnb or solana." });
    const token = CHAINS[chain].token;
    await client.query("begin");
    const walletResult = await client.query(`select wallet_address from public.recruiter_payout_wallets where recruiter_id = $1 and chain = $2 and verified_at is not null order by verified_at desc limit 1`, [account.recruiter_id, chain]);
    const payoutWallet = walletResult.rows[0]?.wallet_address || "";
    if (!payoutWallet) {
      await client.query("rollback");
      return json(res, 400, { error: `Verify a ${token} payout wallet before claiming ${token} rewards.`, code: "MISSING_PAYOUT_WALLET" });
    }
    const ledgerResult = await client.query(
      `select id, amount_raw::text as amount_raw
         from public.recruiter_reward_ledger
        where recruiter_id = $1 and chain = $2 and token = $3 and status = 'claimable' and claim_id is null
        for update`,
      [account.recruiter_id, chain, token],
    );
    const amountRaw = ledgerResult.rows.reduce((sum, row) => sum + BigInt(rawAmount(row.amount_raw)), 0n).toString();
    if (BigInt(amountRaw || "0") <= 0n) {
      await client.query("rollback");
      return json(res, 400, { error: `No claimable ${token} rewards yet.`, code: "NO_CLAIMABLE_REWARDS" });
    }
    const claimResult = await client.query(`insert into public.recruiter_reward_claims (recruiter_id, chain, token, amount_raw, payout_wallet, status) values ($1, $2, $3, $4::numeric(78,0), $5, 'created') returning id, created_at`, [account.recruiter_id, chain, token, amountRaw, payoutWallet]);
    const claim = claimResult.rows[0];
    await client.query(`update public.recruiter_reward_ledger set status = 'created', claim_id = $4, updated_at = now() where recruiter_id = $1 and chain = $2 and token = $3 and status = 'claimable' and claim_id is null`, [account.recruiter_id, chain, token, claim.id]);
    await client.query("commit");
    return json(res, 200, { ok: true, claim: { id: String(claim.id), chain, token, amountRaw, payoutWallet, status: "created", txHash: null, createdAt: claim.created_at }, message: `${token} claim created. On-chain payout submission is pending vault integration.` });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if (schemaMissing(error)) return json(res, 503, { error: "Recruiter payout schema has not been applied yet.", code: "PAYOUT_SCHEMA_MISSING" });
    console.error("[recruiter claim] failed", error);
    return json(res, 500, { error: "Server error" });
  } finally {
    client.release();
  }
}
