import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

function redact(value, keepStart = 6, keepEnd = 4) {
  const s = String(value ?? "");
  if (!s) return "";
  if (s.length <= keepStart + keepEnd) return "*".repeat(s.length);
  return `${s.slice(0, keepStart)}…${s.slice(-keepEnd)}`;
}

function safeError(e) {
  return {
    name: e?.name || "Error",
    message: String(e?.message || e),
    code: e?.code,
    detail: e?.detail,
    where: e?.where,
    hint: e?.hint,
  };
}

function getRepoAivenCaInfo() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const p = path.join(__dirname, "certs", "aiven-ca.pem");
    const exists = fs.existsSync(p);
    const bytes = exists ? fs.statSync(p).size : 0;
    return { exists, bytes, path: exists ? "frontend/api/certs/aiven-ca.pem" : null };
  } catch {
    return { exists: false, bytes: 0, path: null };
  }
}

function loadCaPem() {
  // 1) Base64 env var (recommended for Vercel)
  const b64 = process.env.PG_CA_CERT_B64;
  if (b64) {
    const pem = Buffer.from(b64, "base64").toString("utf8");
    if (pem.includes("BEGIN CERTIFICATE")) return pem;
    throw new Error("PG_CA_CERT_B64 does not decode to a PEM certificate");
  }

  // 2) Plain PEM env var (with \n)
  const pem = process.env.PG_CA_CERT;
  if (pem) return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;

  // 3) Repo fallback (Aiven)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const p = path.join(__dirname, "certs", "aiven-ca.pem");
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");

  return null;
}

function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: u.username,
    password: u.password,
    database: (u.pathname || "").replace(/^\//, "") || "postgres",
  };
}

async function pgCheck() {
  const DATABASE_URL = process.env.DATABASE_URL || "";
  if (!DATABASE_URL) {
    return { ok: false, error: { message: "DATABASE_URL is missing on this deployment" } };
  }

  let host = "";
  try {
    host = parseDbUrl(DATABASE_URL).host;
  } catch (e) {
    return { ok: false, error: { message: "DATABASE_URL is not a valid URL", detail: safeError(e) } };
  }

  let ca = null;
  try {
    ca = loadCaPem();
  } catch (e) {
    return { ok: false, error: { message: "Failed to load CA cert", detail: safeError(e) } };
  }

  const ssl =
    ca
      ? { ca, rejectUnauthorized: true, servername: host }
      : { rejectUnauthorized: false, servername: host };

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const t0 = Date.now();
    await pool.query("select 1 as ok");
    const latencyMs = Date.now() - t0;

    // minimal schema checks (these are what your profile/comments features rely on)
    const checks = {};
    const reg1 = await pool.query(`select to_regclass('public.user_profiles') as reg`);
    checks.user_profiles = Boolean(reg1.rows?.[0]?.reg);

    const reg2 = await pool.query(`select to_regclass('public.token_comments') as reg`);
    checks.token_comments = Boolean(reg2.rows?.[0]?.reg);

    const reg3 = await pool.query(`select to_regclass('public.auth_nonces') as reg`);
    checks.auth_nonces = Boolean(reg3.rows?.[0]?.reg);

    if (checks.auth_nonces) {
      const cols = await pool.query(
        `select column_name
         from information_schema.columns
         where table_schema='public' and table_name='auth_nonces'`
      );
      const names = new Set((cols.rows || []).map((r) => String(r.column_name)));
      checks.auth_nonces_used_at = names.has("used_at");
      checks.auth_nonces_expires_at = names.has("expires_at");
      checks.auth_nonces_nonce = names.has("nonce");
    }

    return { ok: true, latencyMs, ssl: { hasCa: Boolean(ca), rejectUnauthorized: Boolean(ca) }, checks };
  } catch (e) {
    return { ok: false, error: safeError(e), ssl: { hasCa: Boolean(ca) } };
  } finally {
    try { await pool.end(); } catch {}
  }
}

export default async function handler(req, res) {
  try {
    const want = String(process.env.DIAGNOSTICS_TOKEN || "");
    const got = String(req.query?.token || "");

    // Hide endpoint if not authorized
    if (!want || got !== want) {
      return res.status(404).json({ error: "Not found" });
    }

    const repoCa = getRepoAivenCaInfo();

    const out = {
      ok: false,
      runtime: {
        nodeEnv: process.env.NODE_ENV || "",
      },
      env_presence: {
        DATABASE_URL: Boolean(process.env.DATABASE_URL),
        PG_CA_CERT_B64: Boolean(process.env.PG_CA_CERT_B64),
        PG_CA_CERT: Boolean(process.env.PG_CA_CERT),
        repo_aiven_ca_pem: repoCa,
        SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        // Ably: server side should have ABLY_API_KEY (do not expose it)
        ABLY_API_KEY: Boolean(process.env.ABLY_API_KEY),
        // Client side uses VITE_ABLY_CLIENT_KEY at build time; may be absent here
        VITE_ABLY_CLIENT_KEY_on_server: Boolean(process.env.VITE_ABLY_CLIENT_KEY),
      },
      redacted: {
        // helpful to verify you're pointing to Aiven without leaking secrets
        DATABASE_URL_host: process.env.DATABASE_URL ? (() => {
          try { return parseDbUrl(process.env.DATABASE_URL).host; } catch { return "invalid"; }
        })() : "",
        ABLY_API_KEY_preview: process.env.ABLY_API_KEY ? redact(process.env.ABLY_API_KEY, 10, 6) : "",
      },
      checks: {},
      recommendations: [],
    };

    out.checks.aiven_postgres = await pgCheck();

    if (!out.checks.aiven_postgres.ok) {
      out.recommendations.push(
        "Aiven DB check failed. Look at checks.aiven_postgres.error for the exact TLS/auth/host issue."
      );
      if (!out.env_presence.DATABASE_URL) {
        out.recommendations.push(
          "DATABASE_URL is missing on Vercel Production env. Add it and redeploy."
        );
      }
    } else {
      const c = out.checks.aiven_postgres.checks || {};
      if (!c.user_profiles) out.recommendations.push("Missing table user_profiles on Aiven. Apply db/migrations/002_social.sql.");
      if (!c.token_comments) out.recommendations.push("Missing table token_comments on Aiven. Apply db/migrations/002_social.sql.");
      if (c.auth_nonces && !c.auth_nonces_used_at) {
        out.recommendations.push(
          "auth_nonces.used_at column is missing but your API expects it. Add the column or update the queries/migration."
        );
      }
    }

    out.ok = Boolean(out.checks.aiven_postgres?.ok);
    return res.status(200).json(out);
  } catch (e) {
    console.error("[api/diagnostics] crashed", e);
    return res.status(500).json({ error: "Server error", detail: safeError(e) });
  }
}
