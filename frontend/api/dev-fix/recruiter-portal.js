import crypto from "crypto";
import { ethers } from "ethers";
import { pool } from "../../server/db.js";
import { badMethod, getQuery, isAddress, isSolanaAddress, json, readJson } from "../../server/http.js";

const COOKIE_NAME = "mwz_recruiter_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NONCE_CHAIN_ID = 0;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Map([...BASE58_ALPHABET].map((char, index) => [char, index]));
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function normalizeAddress(value) {
  const raw = String(value || "").trim();
  const evm = raw.toLowerCase();
  if (isAddress(evm)) return evm;
  if (isSolanaAddress(raw)) return raw;
  return "";
}

function walletLookupKey(value) {
  const raw = normalizeAddress(value);
  return raw ? raw.toLowerCase() : "";
}

function isSolanaWallet(value) {
  return isSolanaAddress(String(value || "").trim());
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 12);
}

function normalizeImageUrl(value) {
  const raw = String(value || "").trim().slice(0, 1000);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^ipfs:\/\//i.test(raw)) return raw;
  throw new Error("Squad image must be a full http(s) or ipfs URL.");
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function sessionSecret() {
  return String(process.env.RECRUITER_PORTAL_SESSION_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET || "memewarzone-local-dev-secret");
}

function signPayload(payload) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function encodeSession(data) {
  const payload = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

function decodeSession(token) {
  const raw = String(token || "").trim();
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  if (signPayload(payload) !== sig) return null;
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
  const parts = header.split(";").map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key === name) return decodeURIComponent(part.slice(index + 1));
  }
  return "";
}

function readBearerToken(req) {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function isSecureRequest(req) {
  const proto = String(req.headers?.["x-forwarded-proto"] || req.protocol || "").toLowerCase();
  const host = String(req.headers?.host || "").toLowerCase();
  return proto === "https" || host.endsWith(".memewar.zone") || host.endsWith(".netlify.app");
}

function cookieAttributes(req, maxAgeSeconds) {
  const attrs = ["Path=/", "HttpOnly", `Max-Age=${maxAgeSeconds}`];
  if (isSecureRequest(req)) attrs.push("SameSite=None", "Secure");
  else attrs.push("SameSite=Lax");
  return attrs.join("; ");
}

function setSessionCookie(req, res, token) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieAttributes(req, Math.floor(SESSION_TTL_MS / 1000))}`);
}

function clearSessionCookie(req, res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; ${cookieAttributes(req, 0)}`);
}

function buildAuthMessage({ walletAddress, nonce }) {
  return [
    "MemeWarzone Recruiter Portal",
    "Action: RECRUITER_PORTAL_LOGIN",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
  ].join("\n");
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
  try {
    const signature = Buffer.from(String(signatureBase64 || ""), "base64");
    const publicKey = base58Decode(walletAddress);
    if (signature.length !== 64) return false;
    if (publicKey.length !== 32) return false;
    const spki = Buffer.concat([ED25519_SPKI_PREFIX, publicKey]);
    const keyObject = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(message, "utf8"), keyObject, signature);
  } catch (error) {
    console.error("[api/recruiter portal solana verify]", error);
    return false;
  }
}

function verifyWalletSignature({ walletAddress, nonce, signature }) {
  const message = buildAuthMessage({ walletAddress, nonce });
  if (isSolanaWallet(walletAddress)) return verifySolanaSignature(message, signature, walletAddress);
  const recovered = ethers.verifyMessage(message, signature).toLowerCase();
  return recovered === walletAddress.toLowerCase();
}

function recruiterShape(row) {
  const realSolanaWallet = row.metadata?.signup?.solanaWalletAddress || null;
  return {
    id: Number(row.id),
    name: row.display_name || row.code,
    x_handle: row.metadata?.signup?.xHandle || row.metadata?.signup?.x_handle || "",
    telegram_handle: row.metadata?.signup?.telegram || row.metadata?.signup?.telegram_handle || "",
    wallet_address: realSolanaWallet || row.wallet_address,
    status: row.status,
    focus: row.metadata?.signup?.focus || row.metadata?.focus || null,
    recruiter_code: row.code,
    squad_image_url: row.squad_image_url || null,
    created_at: row.created_at || null,
    approved_at: row.updated_at || row.created_at || null,
  };
}

async function findRecruiterByWallet(walletAddress) {
  const lookup = walletLookupKey(walletAddress);
  const { rows } = await pool.query(
    `select id, wallet_address, code, display_name, is_og, status, closed_at, metadata, squad_image_url, created_at, updated_at
       from public.recruiters
      where wallet_address = $1
      limit 1`,
    [lookup],
  );
  return rows[0] || null;
}

async function findRecruiterById(recruiterId) {
  const { rows } = await pool.query(
    `select id, wallet_address, code, display_name, is_og, status, closed_at, metadata, squad_image_url, created_at, updated_at
       from public.recruiters
      where id = $1
      limit 1`,
    [recruiterId],
  );
  return rows[0] || null;
}

async function getSessionRecruiter(req) {
  const session = decodeSession(readCookie(req, COOKIE_NAME) || readBearerToken(req));
  if (!session) return null;
  const recruiter = await findRecruiterById(Number(session.recruiterId));
  if (!recruiter) return null;
  if (String(recruiter.wallet_address || "").toLowerCase() !== walletLookupKey(session.walletAddress)) return null;
  return recruiter;
}

async function getSquadRows(recruiterId) {
  const { rows } = await pool.query(
    `select s.wallet_address,
            s.recruiter_id,
            coalesce(nullif(s.member_role, ''), 'member') as role,
            coalesce(nullif(s.link_source, ''), 'recruiter') as source,
            coalesce(s.joined_at, s.created_at) as bound_at
       from public.wallet_squad_memberships s
      where s.recruiter_id = $1 and s.is_active = true
      order by coalesce(s.joined_at, s.created_at) desc
      limit 250`,
    [recruiterId],
  );
  return rows;
}

function summarizeSquad(rows) {
  return rows.reduce((acc, row) => {
    acc.total += 1;
    if (row.role === "creator") acc.creators += 1;
    else if (row.role === "trader") acc.traders += 1;
    else acc.unknown += 1;
    return acc;
  }, { total: 0, creators: 0, traders: 0, unknown: 0 });
}

async function portalResponse(recruiter) {
  const rows = await getSquadRows(recruiter.id);
  const imageUrl = recruiter.squad_image_url || null;
  return {
    ok: true,
    recruiter: recruiterShape(recruiter),
    squad: {
      imageUrl,
      image_url: imageUrl,
      counts: summarizeSquad(rows),
      rows: rows.map((row) => ({
        wallet_address: row.wallet_address,
        recruiter_id: Number(row.recruiter_id),
        recruiter_code: recruiter.code,
        role: row.role || "member",
        source: row.source || "recruiter",
        bound_at: row.bound_at,
      })),
    },
  };
}

async function saveNonce(walletAddress, nonce) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await pool.query(
    `insert into public.auth_nonces (chain_id, address, nonce, expires_at)
     values ($1, $2, $3, $4)
     on conflict (chain_id, address)
     do update set nonce = excluded.nonce, expires_at = excluded.expires_at, used_at = null`,
    [NONCE_CHAIN_ID, walletAddress, nonce, expiresAt],
  );
  return expiresAt;
}

async function consumeNonce(walletAddress, nonce) {
  const { rows } = await pool.query(
    `select nonce, expires_at, used_at
       from public.auth_nonces
      where chain_id = $1 and address = $2
      limit 1`,
    [NONCE_CHAIN_ID, walletAddress],
  );
  const row = rows[0];
  if (!row) throw new Error("Nonce not found. Request a new recruiter login challenge.");
  if (row.used_at) throw new Error("Nonce already used. Request a new recruiter login challenge.");
  if (String(row.nonce) !== String(nonce)) throw new Error("Nonce mismatch. Request a new recruiter login challenge.");
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (!exp || Date.now() > exp) throw new Error("Nonce expired. Request a new recruiter login challenge.");
  await pool.query(`update public.auth_nonces set used_at = now() where chain_id = $1 and address = $2`, [NONCE_CHAIN_ID, walletAddress]);
}

export async function recruiterAuthNonce(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  try {
    const q = getQuery(req);
    const walletAddress = normalizeAddress(q.address);
    if (!walletAddress) return json(res, 400, { error: "Invalid or missing address" });
    const recruiter = await findRecruiterByWallet(walletAddress);
    if (!recruiter) return json(res, 403, { error: "This wallet is not an approved recruiter." });
    const nonce = crypto.randomBytes(16).toString("hex");
    await saveNonce(walletAddress, nonce);
    return json(res, 200, { nonce, message: buildAuthMessage({ walletAddress, nonce }) });
  } catch (error) {
    console.error("[api/recruiter auth nonce]", error);
    if (schemaMissing(error)) return json(res, 503, { error: "Recruiter portal schema has not been applied yet." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function recruiterAuthVerify(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  try {
    const body = await readJson(req);
    const walletAddress = normalizeAddress(body.address);
    const signature = String(body.signature || "").trim();
    if (!walletAddress) return json(res, 400, { error: "Invalid or missing address" });
    if (!signature) return json(res, 400, { error: "Missing signature" });

    const { rows } = await pool.query(
      `select nonce
         from public.auth_nonces
        where chain_id = $1 and address = $2 and used_at is null
        order by expires_at desc
        limit 1`,
      [NONCE_CHAIN_ID, walletAddress],
    );
    const nonce = rows[0]?.nonce;
    if (!nonce) return json(res, 401, { error: "Nonce not found. Request a new recruiter login challenge." });

    if (!verifyWalletSignature({ walletAddress, nonce, signature })) return json(res, 401, { error: "Invalid signature" });
    await consumeNonce(walletAddress, nonce);

    const recruiter = await findRecruiterByWallet(walletAddress);
    if (!recruiter) return json(res, 403, { error: "This wallet is not an approved recruiter." });

    const token = encodeSession({ recruiterId: Number(recruiter.id), walletAddress, exp: Date.now() + SESSION_TTL_MS });
    setSessionCookie(req, res, token);
    return json(res, 200, { ok: true, recruiter: recruiterShape(recruiter), sessionToken: token });
  } catch (error) {
    console.error("[api/recruiter auth verify]", error);
    const message = String(error?.message || "");
    if (/nonce|signature/i.test(message)) return json(res, 401, { error: message });
    if (schemaMissing(error)) return json(res, 503, { error: "Recruiter portal schema has not been applied yet." });
    return json(res, 500, { error: "Server error" });
  }
}

export async function recruiterPortal(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  try {
    const recruiter = await getSessionRecruiter(req);
    if (!recruiter) return json(res, 401, { error: "Connect your approved recruiter wallet to access the portal." });
    if (!["active", "approved"].includes(String(recruiter.status || "").toLowerCase())) {
      return json(res, 403, { error: "Recruiter access is only available for active recruiters." });
    }

    if (req.method === "GET") return json(res, 200, await portalResponse(recruiter));

    const body = await readJson(req);
    const action = String(body.action || "").trim();
    if (action === "setCode") {
      const code = normalizeCode(body.code);
      if (code.length < 4) return json(res, 400, { error: "Code must be at least 4 characters." });
      if (code.length > 12) return json(res, 400, { error: "Code must be 12 characters or less." });
      const existing = await pool.query(`select id from public.recruiters where lower(code) = lower($1) limit 1`, [code]);
      if (existing.rows[0] && Number(existing.rows[0].id) !== Number(recruiter.id)) return json(res, 409, { error: "That code is already taken." });
      const { rows } = await pool.query(
        `update public.recruiters set code = lower($1), updated_at = now() where id = $2 returning id, wallet_address, code, display_name, is_og, status, closed_at, metadata, squad_image_url, created_at, updated_at`,
        [code, recruiter.id],
      );
      return json(res, 200, { ok: true, recruiter_code: rows[0]?.code || code });
    }

    if (action === "setSquadImage") {
      const imageUrl = normalizeImageUrl(body.imageUrl);
      const { rows } = await pool.query(
        `update public.recruiters set squad_image_url = nullif($1, ''), updated_at = now() where id = $2 returning squad_image_url`,
        [imageUrl, recruiter.id],
      );
      return json(res, 200, { ok: true, squad_image_url: rows[0]?.squad_image_url || "" });
    }

    return json(res, 400, { error: "Unsupported action." });
  } catch (error) {
    console.error("[api/recruiter portal]", error);
    if (schemaMissing(error)) return json(res, 503, { error: "Recruiter portal schema has not been applied yet." });
    return json(res, 500, { error: error instanceof Error ? error.message : "Server error" });
  }
}

export async function recruiterLogout(req, res) {
  clearSessionCookie(req, res);
  return json(res, 200, { ok: true });
}
