import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

function readCaFromEnv() {
  const ca = process.env.PG_CA_CERT;
  if (!ca) return null;
  return ca.includes("\\n") ? ca.replace(/\\n/g, "\n") : ca;
}

function readCaFromRepo() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const caPath = path.join(__dirname, "certs", "aiven-ca.pem");
    return fs.readFileSync(caPath, "utf8");
  } catch (e) {
    return null;
  }
}

function buildPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const ca = readCaFromEnv() || readCaFromRepo();

  // IMPORTANT:
  // If CA is available -> verify properly.
  // If CA is NOT available (common when file isn't bundled into a lambda) -> fall back to rejectUnauthorized:false.
  const ssl = ca
    ? { ca, rejectUnauthorized: true }
    : { rejectUnauthorized: false };

  console.log("[api/_db] Creating PG pool. CA:", Boolean(ca), "rejectUnauthorized:", ssl.rejectUnauthorized);

  return new Pool({
    connectionString: url,
    ssl,
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

// Serverless-safe reuse per lambda runtime:
const g = globalThis;
if (!g.__UPMEMEPgPool) {
  g.__UPMEMEPgPool = buildPool();
}

export const pool = g.__UPMEMEPgPool;
