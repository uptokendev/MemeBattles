import crypto from "crypto";
import { ethers } from "ethers";
import { pool } from "../../server/db.js";
import { badMethod, getQuery, isAddress, isSolanaAddress, json, readJson } from "../../server/http.js";

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function normalizeWallet(value) {
  const raw = String(value || "").trim();
  if (isSolanaAddress(raw)) return raw;
  const lower = raw.toLowerCase();
  return isAddress(lower) ? lower : "";
}

function walletCompareValue(value) {
  const wallet = normalizeWallet(value);
  return isSolanaAddress(wallet) ? wallet : wallet.toLowerCase();
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

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function makeNonce() {
  return crypto.randomBytes(16).toString("hex");
}

function recruiterShape(row) {
  if (!row) return null;
  return {
    recruiterId: Number(row.id),
    walletAddress: row.wallet_address,
    code: row.code,
    displayName: row.display_name,
    isOg: Boolean(row.is_og),
    status: row.status,
    closedAt: row.closed_at || null,
    linkedWalletCount: 0,
    linkedCreatorsCount: 0,
    linkedTradersCount: 0,
    activeSquadMemberCount: 0,
    referredEventCount: 0,
    referredVolumeRaw: "0",
    recruiterRouteAmountRaw: "0",
    lastReferredEventAt: null,
    latestLinkedActivityAt: null,
    pendingEarningsRaw: "0",
    claimableEarningsRaw: "0",
    totalEarnedRaw: "0",
    claimedLifetimeRaw: "0",
    lastClaimedAt: null,
    weightedScore: 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    materializedAt: new Date().toISOString(),
  };
}

function buildSignupMessage(input) {
  return [
    "MemeWarzone Recruiter Signup",
    "Action: RECRUITER_SIGNUP",
    `Wallet: ${input.walletAddress}`,
    `ChainId: ${input.chainId ?? ""}`,
    `Nonce: ${String(input.nonce || "").trim()}`,
    "",
    `DisplayName: ${normalizeText(input.displayName, 40)}`,
    `DesiredCode: ${normalizeCode(input.desiredCode)}`,
    `Email: ${normalizeText(input.email, 120)}`,
    `Telegram: ${normalizeText(input.telegram, 80)}`,
    `Discord: ${normalizeText(input.discord, 80)}`,
    `X: ${normalizeText(input.xHandle, 80)}`,
    "",
    `Pitch: ${normalizeText(input.pitch, 1000)}`,
  ].join("\n");
}

async function findRecruiterByWallet(walletAddress) {
  const wallet = walletCompareValue(walletAddress);
  const { rows } = await pool.query(
    `select id, wallet_address, code, display_name, is_og, status, closed_at, created_at, updated_at
       from public.recruiters
      where wallet_address = $1 or lower(wallet_address) = lower($1)
      limit 1`,
    [wallet],
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

async function saveNonce({ chainId, walletAddress, nonce }) {
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

async function consumeNonce({ chainId, walletAddress, nonce }) {
  const { rows } = await pool.query(
    `select nonce, expires_at, used_at
       from public.auth_nonces
      where chain_id = $1 and address = $2
      limit 1`,
    [chainId, walletAddress],
  );
  const row = rows[0];
  if (!row) throw new Error("Nonce not found. Request a new signup nonce and try again.");
  if (row.used_at) throw new Error("Nonce already used. Request a new signup nonce and try again.");
  if (String(row.nonce) !== String(nonce)) throw new Error("Nonce mismatch. Request a new signup nonce and try again.");
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (!exp || Date.now() > exp) throw new Error("Nonce expired. Request a new signup nonce and try again.");
  await pool.query(`update public.auth_nonces set used_at = now() where chain_id = $1 and address = $2`, [chainId, walletAddress]);
}

function verifyEvm(message, signature, walletAddress) {
  const recovered = ethers.verifyMessage(message, signature).toLowerCase();
  return recovered === walletAddress.toLowerCase();
}

export async function recruiterSignupStatusHotfix(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  try {
    const walletAddress = normalizeWallet(getQuery(req).walletAddress);
    if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });
    const recruiter = await findRecruiterByWallet(walletAddress);
    return json(res, 200, {
      walletAddress,
      isRecruiter: Boolean(recruiter),
      recruiter: recruiterShape(recruiter),
      canStartSignup: !recruiter,
      signupApiAvailable: true,
    });
  } catch (error) {
    console.error("[recruiter signup status hotfix]", error);
    if (schemaMissing(error)) return json(res, 503, { error: "Recruiter signup is temporarily unavailable." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function recruiterSignupCodeAvailabilityHotfix(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  try {
    const code = normalizeCode(getQuery(req).code);
    if (!code || code.length < 2) return json(res, 200, { code, isAvailable: false, checkedVia: "signup-endpoint", message: "Use at least 2 characters." });
    const existing = await findRecruiterByCode(code);
    return json(res, 200, { code, isAvailable: !existing, checkedVia: "signup-endpoint", message: existing ? "This recruiter code is already taken." : "This recruiter code is available." });
  } catch (error) {
    console.error("[recruiter signup code hotfix]", error);
    return json(res, 500, { error: "Server error" });
  }
}

export async function recruiterSignupNonceHotfix(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  try {
    const body = await readJson(req);
    const walletAddress = normalizeWallet(body.walletAddress);
    const chainId = Number(body.chainId || 97);
    if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });
    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    const nonce = makeNonce();
    const expiresAt = await saveNonce({ chainId, walletAddress, nonce });
    return json(res, 200, { nonce, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error("[recruiter signup nonce hotfix]", error);
    if (schemaMissing(error)) return json(res, 503, { error: "Recruiter signup is temporarily unavailable." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function recruiterSignupSubmitHotfix(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  try {
    const body = await readJson(req);
    const walletAddress = normalizeWallet(body.walletAddress);
    const chainId = Number(body.chainId || 97);
    const desiredCode = normalizeCode(body.desiredCode);
    const displayName = normalizeText(body.displayName, 40);
    const email = normalizeText(body.email, 120);
    const pitch = normalizeText(body.pitch, 1000);
    const nonce = String(body.nonce || "").trim();
    const signature = String(body.signature || "").trim();

    if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });
    if (isSolanaAddress(walletAddress)) return json(res, 400, { error: "Solana recruiter signup is not enabled on this deployment yet." });
    if (!displayName) return json(res, 400, { error: "Display name is required" });
    if (!desiredCode || desiredCode.length < 2) return json(res, 400, { error: "Recruiter code is invalid" });
    if (!email) return json(res, 400, { error: "Email is required" });
    if (!pitch) return json(res, 400, { error: "Pitch is required" });
    if (!body.acceptTerms) return json(res, 400, { error: "Recruiter terms must be accepted" });
    if (!nonce || !signature) return json(res, 400, { error: "Signature challenge missing" });

    if (await findRecruiterByWallet(walletAddress)) return json(res, 409, { error: "This wallet is already a recruiter" });
    if (await findRecruiterByCode(desiredCode)) return json(res, 409, { error: "This recruiter code is already taken" });
    await consumeNonce({ chainId, walletAddress, nonce });

    const message = buildSignupMessage({ ...body, walletAddress, chainId, nonce, desiredCode, displayName, email, pitch });
    if (!verifyEvm(message, signature, walletAddress)) return json(res, 401, { error: "Invalid signature" });

    const { rows } = await pool.query(
      `insert into public.recruiters (wallet_address, code, display_name, is_og, status, metadata)
       values ($1, $2, $3, $4, 'active', $5::jsonb)
       returning id, wallet_address, code, display_name, is_og, status, closed_at, created_at, updated_at`,
      [walletAddress, desiredCode, displayName, envFlag("PRELIVE_RECRUITERS_ARE_OG", true), JSON.stringify({ signup: { email, telegram: normalizeText(body.telegram, 80), discord: normalizeText(body.discord, 80), xHandle: normalizeText(body.xHandle, 80), pitch, acceptedTermsAt: new Date().toISOString() } })],
    );
    return json(res, 200, { ok: true, recruiter: recruiterShape(rows[0]) });
  } catch (error) {
    console.error("[recruiter signup submit hotfix]", error);
    const message = String(error?.message || "");
    if (/nonce|signature/i.test(message)) return json(res, 401, { error: message });
    if (error?.code === "23505") return json(res, 409, { error: "Recruiter wallet or code already exists" });
    if (schemaMissing(error)) return json(res, 503, { error: "Recruiter signup is temporarily unavailable." });
    return json(res, 500, { error: "Server error" });
  }
}
