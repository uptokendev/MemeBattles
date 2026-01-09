import pg from "pg";
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

function readCa() {
  const ca = process.env.PG_CA_CERT;
  if (!ca) return null;
  // In case it was stored with literal "\n"
  return ca.includes("\\n") ? ca.replace(/\\n/g, "\n") : ca;
}

if (!DATABASE_URL) {
  console.error("[api/_db] Missing DATABASE_URL env var");
}

let _pool = globalThis.__upmeme_pool;

if (!_pool && DATABASE_URL) {
  const ca = readCa();

  _pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: ca
      ? { ca, rejectUnauthorized: true }     // best practice: trust Aiven CA
      : { rejectUnauthorized: false },       // fallback (works, less strict)
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  globalThis.__upmeme_pool = _pool;

  _pool.on("error", (err) => {
    console.error("[api/_db] Pool error", err);
  });
}

export const pool = _pool;
