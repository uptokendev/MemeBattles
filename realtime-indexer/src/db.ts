import { Pool } from "pg";
import { ENV } from "./env.js";

export const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
  max: 10
});

export async function dbNow() {
  const r = await pool.query("select now() as now");
  return r.rows[0].now as string;
}

