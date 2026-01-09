import { pool } from "../_db.js";

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "unparseable";
  }
}

export default async function handler(req, res) {
  try {
    const dbUrl = process.env.DATABASE_URL || "";
    const b64 = process.env.PG_CA_CERT_B64 || "";
    const caLen = b64.length;

    // Try decoding and sanity check PEM header without exposing the cert
    let pemOk = false;
    let pemFirstLine = "";
    if (b64) {
      try {
        const pem = Buffer.from(b64, "base64").toString("utf8");
        pemFirstLine = (pem.split("\n")[0] || "").trim();
        pemOk = pemFirstLine.includes("BEGIN CERTIFICATE");
      } catch {
        pemOk = false;
      }
    }

    // Prove DB connectivity
    const r = await pool.query("select 1 as ok");

    return res.status(200).json({
      ok: true,
      vercelEnv: process.env.VERCEL_ENV || null,
      dbHost: safeHost(dbUrl),
      hasPool: Boolean(pool),
      pgCaB64Len: caLen,
      pemOk,
      pemFirstLine,
      query: r.rows?.[0] ?? null
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      vercelEnv: process.env.VERCEL_ENV || null,
      dbHost: safeHost(process.env.DATABASE_URL || ""),
      pgCaB64Len: (process.env.PG_CA_CERT_B64 || "").length,
      error: String(e?.message ?? e),
      code: e?.code ?? null
    });
  }
}
