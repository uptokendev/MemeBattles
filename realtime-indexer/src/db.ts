import { Pool } from "pg";
import { ENV } from "./env.js";

function dbHostFromUrl(dbUrl: string): string {
  const u = new URL(dbUrl);
  return u.hostname;
}

function loadCustomCaIfEnabled(): string | null {
  // Only use a custom CA if explicitly enabled.
  const enabled = String(process.env.PG_USE_CUSTOM_CA || "").trim() === "1";
  if (!enabled) return null;

  const b64 = process.env.PG_CA_CERT_B64;
  if (b64) {
    const pem = Buffer.from(b64, "base64").toString("utf8");
    if (!pem.includes("BEGIN CERTIFICATE")) {
      throw new Error("PG_CA_CERT_B64 does not decode to a PEM certificate");
    }
    return pem;
  }

  const pem = process.env.PG_CA_CERT;
  if (pem) return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;

  return null;
}

const host = dbHostFromUrl(ENV.DATABASE_URL);

// Keep this for local debugging only; do not set in production.
const disableSsl = String(process.env.PG_DISABLE_SSL || "").trim() === "1";

let customCa: string | null = null;
try {
  customCa = loadCustomCaIfEnabled();
} catch (e) {
  console.error("[db] Custom CA load error:", e);
  throw e; // fail fast; misconfigured CA should not silently degrade security
}

const ssl =
  disableSsl
    ? false
    : customCa
      ? { ca: customCa, rejectUnauthorized: true, servername: host }
      : { rejectUnauthorized: true, servername: host };

// This line makes it immediately obvious in Railway logs what path you’re on.
console.log(
  `[db] host=${host} ssl=${disableSsl ? "off" : "on"} verify=${disableSsl ? "n/a" : "on"} ca=${customCa ? "custom" : "system"}`
);

export const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
  ssl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
