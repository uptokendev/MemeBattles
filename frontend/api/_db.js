import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

function loadCaPem() {
  // 1) Base64 env var (best on Vercel)
  const b64 = process.env.PG_CA_CERT_B64;
  if (b64) {
    const pem = Buffer.from(b64, "base64").toString("utf8");
    if (pem.includes("BEGIN CERTIFICATE")) return pem;
    throw new Error("PG_CA_CERT_B64 does not decode to a PEM certificate");
  }

  // 2) Optional plain PEM env var (with \n)
  const pem = process.env.PG_CA_CERT;
  if (pem) return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;

  // 3) Optional repo file fallback
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return fs.readFileSync(path.join(__dirname, "certs", "aiven-ca.pem"), "utf8");
  } catch {
    return null;
  }
}

function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username || ""),
    password: decodeURIComponent(u.password || ""),
    database: (u.pathname || "").replace(/^\//, "") || "postgres",
  };
}

// Reuse pool across invocations
let _pool = globalThis.__upmeme_pool;

if (!_pool) {
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing");

  const { host, port, user, password, database } = parseDbUrl(DATABASE_URL);
  const ca = loadCaPem();

  console.log("[api/_db] PG host:", host, "port:", port, "db:", database);
  console.log("[api/_db] CA loaded:", Boolean(ca), "CA bytes:", ca ? ca.length : 0);

  _pool = new Pool({
    host,
    port,
    user,
    password,
    database,

    // IMPORTANT: explicitly provide CA to TLS.
    ssl: ca
      ? { ca, rejectUnauthorized: true, servername: host }
      : { rejectUnauthorized: false },

    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  globalThis.__upmeme_pool = _pool;

  _pool.on("error", (err) => console.error("[api/_db] Pool error", err));
}

export const pool = _pool;
