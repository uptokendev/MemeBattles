import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

function loadCa() {
  // 1) Best for Vercel: base64 env var (no whitespace issues)
  const b64 = process.env.PG_CA_CERT_B64;
  if (b64) {
    try {
      return Buffer.from(b64, "base64").toString("utf8");
    } catch {
      // ignore
    }
  }

  // 2) Optional: multiline PEM stored as \n
  const pem = process.env.PG_CA_CERT;
  if (pem) return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;

  // 3) Fallback: repo file (requires bundling)
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const caPath = path.join(__dirname, "certs", "aiven-ca.pem");
    return fs.readFileSync(caPath, "utf8");
  } catch {
    return null;
  }
}

let _pool = globalThis.__upmeme_pool;

if (!_pool) {
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing");

  const ca = loadCa();

  // Log enough to confirm what happened
  let host = "unknown";
  try {
    host = new URL(DATABASE_URL).hostname;
  } catch {}
  console.log("[api/_db] PG host:", host, "CA loaded:", Boolean(ca), "CA bytes:", ca ? ca.length : 0);

  _pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: ca
      ? { ca, rejectUnauthorized: true }
      : { rejectUnauthorized: false }, // keeps you unblocked if CA missing
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  globalThis.__upmeme_pool = _pool;

  _pool.on("error", (err) => console.error("[api/_db] Pool error", err));
}

export const pool = _pool;
