import pg from "pg";

const { Pool } = pg;

function buildPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // Aiven Postgres requires TLS. Using rejectUnauthorized=false is the pragmatic
  // default for many managed providers when you are not shipping a CA bundle.
  // If you later add a CA cert, switch this to a strict config.
  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    // Keep this small to reduce pressure on free-tier connection limits.
    max: 2,
  });
}

// Serverless-safe: reuse a single pool per runtime.
const g = globalThis;
if (!g.__launchitPgPool) {
  g.__launchitPgPool = buildPool();
}

export const pool = g.__launchitPgPool;
