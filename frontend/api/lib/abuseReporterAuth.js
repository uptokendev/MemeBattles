import crypto from "node:crypto";
import { normalizeAddress } from "../../server/http.js";
import { requireWalletActionAuth } from "./walletActionAuth.js";

export const ABUSE_SESSION_ACTION = "abuse_open_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function hashAbuseSessionToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function createAbuseSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function readSessionToken(req) {
  const header = String(req.headers?.authorization || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  return String(req.headers?.["x-abuse-session"] || "").trim();
}

export function createAbuseReporterAuth({ pool }) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("createAbuseReporterAuth requires a Postgres pool");
  }

  async function openSession(req, res) {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const chainId = Number(body.chainId ?? body.chain_id);
    const wallet = normalizeAddress(body.walletAddress || body.wallet || body.address, chainId);

    const verified = await requireWalletActionAuth({
      res,
      pool,
      auth: body,
      expectedWallet: wallet,
      chainId,
      action: ABUSE_SESSION_ACTION,
      routeLabel: "abuse/session",
    });
    if (!verified) return null;
    if (verified.legacy) {
      if (!res.headersSent) {
        res.status(401).json({ ok: false, error: "Wallet signature required.", code: "SIGNATURE_REQUIRED" });
      }
      return null;
    }

    const token = createAbuseSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await pool.query(
      `insert into public.abuse_reporter_sessions
         (token_hash, wallet_address, chain_id, expires_at)
       values ($1, $2, $3, $4)`,
      [hashAbuseSessionToken(token), verified.walletAddress, verified.chainId, expiresAt.toISOString()],
    );

    return {
      ok: true,
      token,
      expiresAt: expiresAt.toISOString(),
      walletAddress: verified.walletAddress,
      chainId: verified.chainId,
    };
  }

  async function requireSession(req, res) {
    const token = readSessionToken(req);
    if (!token) {
      res.status(401).json({ ok: false, error: "Abuse session required.", code: "ABUSE_SESSION_REQUIRED" });
      return null;
    }

    try {
      const { rows } = await pool.query(
        `update public.abuse_reporter_sessions
            set last_used_at = now()
          where token_hash = $1
            and revoked_at is null
            and expires_at > now()
          returning wallet_address, chain_id, expires_at`,
        [hashAbuseSessionToken(token)],
      );
      const row = rows[0];
      if (!row) {
        res.status(401).json({ ok: false, error: "Abuse session required.", code: "ABUSE_SESSION_REQUIRED" });
        return null;
      }
      return {
        walletAddress: String(row.wallet_address),
        chainId: Number(row.chain_id),
        expiresAt: row.expires_at,
      };
    } catch (error) {
      console.error("[abuseReporterAuth] session lookup failed", error?.message || error);
      res.status(503).json({ ok: false, error: "Abuse authorization is unavailable.", code: "ABUSE_AUTH_UNAVAILABLE" });
      return null;
    }
  }

  return { openSession, requireSession };
}
