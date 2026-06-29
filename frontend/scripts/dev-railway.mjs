import "../api/load-local-env.mjs";
import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const vitePort = process.env.VITE_PORT || "5173";

function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

function isLocalUrl(value) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(value);
}

const frontendApiBase = normalizeUrl(
  process.env.VITE_FRONTEND_API_BASE ||
    process.env.VITE_RAILWAY_FRONTEND_API_BASE ||
    process.env.RAILWAY_FRONTEND_API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    process.env.VITE_API_BASE ||
    process.env.VITE_RAILWAY_API_BASE ||
    "",
);

const tokenApiBase = normalizeUrl(
  process.env.VITE_TOKEN_API_BASE ||
    process.env.VITE_RAILWAY_TOKEN_API_BASE ||
    process.env.RAILWAY_TOKEN_API_BASE_URL ||
    process.env.VITE_REALTIME_API_BASE ||
    process.env.VITE_RAILWAY_API_BASE ||
    frontendApiBase ||
    "",
);

if (!frontendApiBase) {
  console.error("\n[dev:railway] Missing frontend Railway API URL.");
  console.error("Set this in frontend/.env.local:");
  console.error("  RAILWAY_FRONTEND_API_BASE_URL=https://memewarzonefrontend-production.up.railway.app\n");
  process.exit(1);
}

if (!tokenApiBase) {
  console.error("\n[dev:railway] Missing token/indexer Railway API URL.");
  console.error("Set this in frontend/.env.local:");
  console.error("  RAILWAY_TOKEN_API_BASE_URL=https://memebattles-production.up.railway.app\n");
  process.exit(1);
}

if (isLocalUrl(frontendApiBase) || isLocalUrl(tokenApiBase)) {
  console.error("\n[dev:railway] Refusing local API target because this mode must mimic Railway.");
  console.error(`[dev:railway] Frontend API target: ${frontendApiBase}`);
  console.error(`[dev:railway] Token API target: ${tokenApiBase}`);
  console.error("Use npm run dev:hybrid for local API.\n");
  process.exit(1);
}

async function checkApi(label, base, path = "/") {
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok || res.status === 404) {
      console.log(`[dev:railway] ${label} reachable: ${base}`);
      return true;
    }
    console.error(`[dev:railway] ${label} returned ${res.status}: ${url}`);
    return false;
  } catch (error) {
    console.error(`[dev:railway] ${label} is not reachable: ${url}`);
    console.error(error?.message || error);
    return false;
  }
}

if (!(await checkApi("Frontend Railway", frontendApiBase, "/"))) process.exit(1);
if (!(await checkApi("Token Railway", tokenApiBase, "/healthz"))) process.exit(1);

console.log(`[dev:railway] Web: http://127.0.0.1:${vitePort}`);
console.log(`[dev:railway] app/frontend API -> ${frontendApiBase}`);
console.log(`[dev:railway] token/indexer API -> ${tokenApiBase}`);

const command = isWindows ? "cmd.exe" : "vite";
const args = isWindows ? ["/d", "/s", "/c", "vite"] : [];
const child = spawn(command, args, {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    VITE_PORT: vitePort,
    VITE_DEV_API_PROXY_TARGET: frontendApiBase,
    VITE_FRONTEND_API_BASE: frontendApiBase,
    VITE_RAILWAY_FRONTEND_API_BASE: frontendApiBase,
    VITE_API_BASE_URL: frontendApiBase,
    VITE_API_BASE: frontendApiBase,
    VITE_TOKEN_API_BASE: tokenApiBase,
    VITE_RAILWAY_TOKEN_API_BASE: tokenApiBase,
    VITE_REALTIME_API_BASE: tokenApiBase,
  },
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(0);
  process.exit(code || 0);
});

child.on("error", (error) => {
  console.error("[dev:railway] failed to start Vite:", error);
  process.exit(1);
});
