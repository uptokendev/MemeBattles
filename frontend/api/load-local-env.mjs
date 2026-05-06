import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, "..");

const DATABASE_URL_ALIASES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "SUPABASE_DB_URL",
  "SUPABASE_DATABASE_URL",
  "PG_CONNECTION_STRING",
];

function stripInlineComment(value) {
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if ((ch === '"' || ch === "'") && value[i - 1] !== "\\") {
      quote = quote === ch ? null : quote || ch;
      continue;
    }
    if (ch === "#" && !quote && /\s/.test(value[i - 1] || " ")) {
      return value.slice(0, i).trim();
    }
  }
  return value.trim();
}

function unquote(value) {
  const trimmed = stripInlineComment(value);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\n/g, "\n");
  }
  return trimmed;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, value] = match;
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = unquote(value);
    }
  }

  return true;
}

function firstNonEmptyEnv(keys) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return { key, value };
  }
  return null;
}

const loaded = [
  path.join(frontendDir, ".env.local"),
  path.join(frontendDir, ".env"),
]
  .filter(loadEnvFile)
  .map((filePath) => path.basename(filePath));

if (loaded.length) {
  console.log(`[api/load-local-env] loaded ${loaded.join(", ")}`);
}

const databaseUrl = firstNonEmptyEnv(DATABASE_URL_ALIASES);
if (databaseUrl && !String(process.env.DATABASE_URL || "").trim()) {
  process.env.DATABASE_URL = databaseUrl.value;
  console.log(`[api/load-local-env] using ${databaseUrl.key} as DATABASE_URL`);
}

if (!String(process.env.DATABASE_URL || "").trim()) {
  const presentAliases = DATABASE_URL_ALIASES.filter((key) => process.env[key] != null);
  console.warn(
    `[api/load-local-env] DATABASE_URL is missing or empty. Add DATABASE_URL to frontend/.env.local. ` +
      `Checked aliases: ${DATABASE_URL_ALIASES.join(", ")}. ` +
      `Present aliases: ${presentAliases.length ? presentAliases.join(", ") : "none"}.`
  );
}
