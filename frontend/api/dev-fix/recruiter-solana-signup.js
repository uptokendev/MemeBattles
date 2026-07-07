import crypto from "crypto";
import { pool } from "../../server/db.js";
import { badMethod, getQuery, isSolanaAddress, json, readJson } from "../../server/http.js";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Map([...BASE58_ALPHABET].map((char, index) => [char, index]));
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function normalizeSolanaWallet(value) {
  const raw = String(value || "").trim();
  return isSolanaAddress(raw) ? raw : "";
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function normalizeText(value, max = 280) {
  return String(value || "").trim().slice(0, max);
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function makeNonce() {
  return crypto.randomBytes(16).toString("hex");
}

function base58Decode(value) {
  const input = String(value || "").trim();
  if (!input) return Buffer.alloc(0);
  let bytes = [0];
  for (const char of input) {
    const carryValue = BASE58_MAP.get(char);
    if (carryValue == null) throw new Error("Invalid base58 value");
    let carry = carryValue;
    for (let i = 0; i < bytes.length; i += 1) {
      const x = bytes[i] * 58 + carry;
      bytes[i] = x & 0xff;
      carry = x >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of input) {
    if (char === "1") bytes.push(0);
    else break;
  }
  return Buffer.from(bytes.reverse());
}

function verifySolanaSignature(message, signatureBase64, walletAddress) {
  const signature = Buffer.from(String(signatureBase64 || ""), "base64");
  const publicKey = base58Decode(walletAddress);
  if (signature.length !== 64) return false;
  if (publicKey.length !== 32) return false;
  const spki = Buffer.concat([ED25519_SPKI_PREFIX, publicKey]);
  return crypto.verify(null, Buffer.from(message, "utf8"), { key: spki, format: "der", type: "spki" }, signature);
}

function recruiterSummaryShape(recruiter, extra = {}) {
  return {
    recruiterId: Number(recruiter.id),
    walletAddress: recruiter.wallet_address,
    code: recruiter.code,
    displayName: recruiter.display_name,
    isOg: Boolean(recruiter.is_og),
    status: recruiter.status,
    closedAt: recruiter.closed_at,
    linkedWalletCount: Number(extra.linkedWalletCount || 0),
    linkedCreatorsCount: Number(extra.linkedCreatorsCount || 0),
    linkedTradersCount: Number(extra.linkedTradersCount || 0),
    activeSquadMemberCount: Number(extra.activeSquadMemberCount || 0),
    referredEventCount: Number(extra.referredEventCount || 0),
    referredVolumeRaw: String(extra.referredVolumeRaw || "0"),
    recruiterRouteAmountRaw: String(extra.recruiterRouteAmountRaw || "0"),
    lastReferredEventAt: extra.lastReferredEventAt || null,
    latestLinkedActivityAt: extra.latestLinkedActivityAt || null,
    pendingEarningsRaw: String(extra.pendingEarningsRaw || "0"),
    claimableEarningsRaw: String(extra.claimableEarningsRaw || "0"),
    totalEarnedRaw: String(extra.totalEarnedRaw || "0"),
    claimedLifetimeRaw: String(extra.claimedLifetimeRaw || "0"),
    lastClaimedAt: extra.lastClaimedAt || null,
    weightedScore: Number(extra.weightedScore || 0),
    createdAt: recruiter.created_at || null,
    updatedAt: recruiter.updated_at || null,
    materializedAt: new Date().toISOString(),
  };
}

function buildRecruiterSignupMessage({ chainId, walletAddress, nonce, displayName, desiredCode, email, telegram, discord, xHandle, pitch }) {
  return [
    "MemeWarzone Recruiter Signup",
    "Action: RECRUITER_SIGNUP",
    `Wallet: ${walletAddress}`,
    `ChainId: ${chainId ?? ""}`,
    `Nonce: ${String(nonce || "").trim()}`,
    "",
    `DisplayName: ${normalizeText(displayName, 40)}`,
    `DesiredCode: ${normalizeCode(desiredCode)}`,
    `Email: ${normalizeText(email, 120)}`,
    `Telegram: ${normalizeText(telegram, 80)}`,
    `Discord: ${normalizeText(discord, 80)}`,
    `X: ${normalizeText(xHandle, 80)}`,
    "",
    `Pitch: ${normalizeText(pitch, 1000)}`,
  ].join("\n");
}

async function findRecruiterByWallet(walletAddress) {
  const { rows } = await pool.query(
    `select id, wallet_address, code, display_name, is_og, status, closed_at, created_at, updated_at
       from public.recruiters
      where wallet_address = $1
      limit 1`,
    [walletAddress],
  );
  return rows[0] || null;
}

async function findRecruiterByCode(code) {
  const { rows } = await pool.query(
    `select id, wallet_address, code, display_name, is_og, status, closed_at, created_at, updated_at
       from public.recruiters
      where lower(code) = lower($1)
      limit 1`,
    [code],
  );
  return rows[0] || null;
}

async function getRecruiterStats(recruiterId) {
  const [{ rows: linkRows }, { rows: squadRows }] = await Promise.all([
    pool.query(`select count(*)::int as linked_wallet_count, max(linked_at) as latest_linked_activity_at from public.wallet_recruiter_links where recruiter_id = $1 and is_active = true`, [recruiterId]),
    pool.query(`select count(*)::int as active_squad_member_count, count(*) filter (where member_role = 'creator')::int as linked_creators_count, count(*) filter (where member_role = 'trader')::int as linked_traders_count from public.wallet_squad_memberships where recruiter_id = $1 and is_active = true`, [recruiterId]),
  ]);
  return {
    linkedWalletCount: linkRows[0]?.linked_wallet_count || 0,
    activeSquadMemberCount: squadRows[0]?.active_squad_member_count || 0,
    linkedCreatorsCount: squadRows[0]?.linked_creators_count || 0,
    linkedTradersCount: squadRows[0]?.linked_traders_count || 0,
    latestLinkedActivityAt: linkRows[0]?.latest_linked_activity_at || null,
  };
}

async function saveSignupNonce({ chainId, walletAddress, nonce }) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await pool.query(
    `insert into public.auth_nonces (chain_id, address, nonce, expires_at)
     values ($1, $2, $3, $4)
     on conflict (chain_id, address)
     do update set nonce = excluded.nonce, expires_at = excluded.expires_at, used_at = null`,
    [chainId, walletAddress, nonce, expiresAt],
  );
  return expiresAt;
}

async function consumeSignupNonce({ chainId, walletAddress, nonce }) {
  const { rows } = await pool.query(`select nonce, expires_at, used_at from public.auth_nonces where chain_id = $1 and address = $2 limit 1`, [chainId, walletAddress]);
  const row = rows[0];
  if (!row) throw new Error("Nonce not found. Request a new signup nonce and try again.");
  if (row.used_at) throw new Error("Nonce already used. Request a new signup nonce and try again.");
  if (String(row.nonce) !== String(nonce)) throw new Error("Nonce mismatch. Request a new signup nonce and try again.");
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (!exp || Date.now() > exp) throw new Error("Nonce expired. Request a new signup nonce and try again.");
  await pool.query(`update public.auth_nonces set used_at = now() where chain_id = $1 and address = $2`, [chainId, walletAddress]);
}

export async function solanaRecruiterSignupStatus(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  try {
    const walletAddress = normalizeSolanaWallet(getQuery(req).walletAddress);
    if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });
    const recruiter = await findRecruiterByWallet(walletAddress);
    return json(res, 200, {
      walletAddress,
      isRecruiter: Boolean(recruiter),
      recruiter: recruiter ? recruiterSummaryShape(recruiter, await getRecruiterStats(recruiter.id)) : null,
      canStartSignup: !recruiter,
      signupApiAvailable: true,
    });
  } catch (error) {
    console.error("[api/solana recruiter signup status]", error);
    if (schemaMissing(error)) return json(res, 503, { error: "Canonical reward attribution schema has not been applied yet." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function solanaRecruiterSignupNonce(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  try {
    const body = await readJson(req);
    const walletAddress = normalizeSolanaWallet(body.walletAddress);
    const chainId = Number(body.chainId || 101);
    if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });
    if (chainId !== 101 && chainId !== 102) return json(res, 400, { error: "Invalid Solana chainId" });
    const nonce = makeNonce();
    const expiresAt = await saveSignupNonce({ chainId, walletAddress, nonce });
    return json(res, 200, { nonce, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error("[api/solana recruiter signup nonce]", error);
    if (schemaMissing(error)) return json(res, 503, { error: "Canonical reward attribution schema has not been applied yet." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function solanaRecruiterSignupSubmit(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  try {
    const body = await readJson(req);
    const walletAddress = normalizeSolanaWallet(body.walletAddress);
    const chainId = Number(body.chainId || 101);
    const desiredCode = normalizeCode(body.desiredCode);
    const displayName = normalizeText(body.displayName, 40);
    const email = normalizeText(body.email, 120);
    const pitch = normalizeText(body.pitch, 1000);
    const nonce = String(body.nonce || "").trim();
    const signature = String(body.signature || "").trim();

    if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });
    if (chainId !== 101 && chainId !== 102) return json(res, 400, { error: "Invalid Solana chainId" });
    if (!displayName) return json(res, 400, { error: "Display name is required" });
    if (!desiredCode || desiredCode.length < 2) return json(res, 400, { error: "Recruiter code is invalid" });
    if (!email) return json(res, 400, { error: "Email is required" });
    if (!pitch) return json(res, 400, { error: "Pitch is required" });
    if (!body.acceptTerms) return json(res, 400, { error: "Recruiter terms must be accepted" });
    if (!nonce) return json(res, 400, { error: "Nonce missing" });
    if (!signature) return json(res, 400, { error: "Signature missing" });

    if (await findRecruiterByWallet(walletAddress)) return json(res, 409, { error: "This wallet is already a recruiter" });
    if (await findRecruiterByCode(desiredCode)) return json(res, 409, { error: "This recruiter code is already taken" });
    await consumeSignupNonce({ chainId, walletAddress, nonce });

    const message = buildRecruiterSignupMessage({ chainId, walletAddress, nonce, displayName, desiredCode, email, telegram: body.telegram, discord: body.discord, xHandle: body.xHandle, pitch });
    if (!verifySolanaSignature(message, signature, walletAddress)) return json(res, 401, { error: "Invalid signature" });

    const isOg = envFlag("PRELIVE_RECRUITERS_ARE_OG", true);
    const { rows } = await pool.query(
      `insert into public.recruiters (wallet_address, code, display_name, is_og, status, metadata)
       values ($1, $2, $3, $4, 'active', $5::jsonb)
       returning id, wallet_address, code, display_name, is_og, status, closed_at, created_at, updated_at`,
      [walletAddress, desiredCode, displayName, isOg, JSON.stringify({ signup: { chain: "solana", email, telegram: normalizeText(body.telegram, 80), discord: normalizeText(body.discord, 80), xHandle: normalizeText(body.xHandle, 80), pitch, acceptedTermsAt: new Date().toISOString(), preliveOg: isOg } })],
    );

    return json(res, 200, { ok: true, recruiter: recruiterSummaryShape(rows[0]) });
  } catch (error) {
    console.error("[api/solana recruiter signup submit]", error);
    const message = String(error?.message || "");
    if (/nonce|signature/i.test(message)) return json(res, 401, { error: message });
    if (schemaMissing(error)) return json(res, 503, { error: "Canonical reward attribution schema has not been applied yet." });
    if (error?.code === "23505") return json(res, 409, { error: "Recruiter wallet or code already exists" });
    return json(res, 500, { error: "Server error" });
  }
}
