import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, "frontend/.env.local") });
dotenv.config({ path: path.join(root, "frontend/.env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const sql = fs.readFileSync(path.join(root, "database/sponsorship_settings.sql"), "utf8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  await client.query(
    `insert into public.sponsorship_settings (key, value, updated_at)
     values ('featured_house_ad', jsonb_build_object('enabled', false), now())
     on conflict (key) do update
       set value = jsonb_build_object('enabled', false),
           updated_at = now()`,
  );
  const after = await client.query(
    `select key, value from public.sponsorship_settings where key = 'featured_house_ad'`,
  );
  console.log("OK house_ad_row", JSON.stringify(after.rows));
  const grants = await client.query(
    `select grantee, privilege_type
       from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'sponsorship_settings'
      order by grantee, privilege_type`,
  );
  console.log(
    "grants",
    grants.rows.map((r) => `${r.grantee}:${r.privilege_type}`).join(", "),
  );
  // Make PostgREST/Supabase REST expose the new table immediately.
  try {
    await client.query(`notify pgrst, 'reload schema'`);
    console.log("OK schema reload notified");
  } catch (err) {
    console.warn("schema reload notify failed", err?.message || err);
  }
} finally {
  await client.end();
}

