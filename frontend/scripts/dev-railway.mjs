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

const railwayApiBase = normalizeUrl(
  process.env.VITE_RAILWAY_API_BASE ||
    process.env.RAILWAY_API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    process.env.VITE_API_BASE ||
    process.env.VITE_DEV_API_PROXY_TARGET ||
    "",
);

if (!railwayApiBase) {
  console.error("\n[dev:railway] Missing Railway API URL.");
  console.error("Set one of these in frontend/.env.local:");
  console.error("  VITE_RAILWAY_API_BASE=https://your-railway-api.up.railway.app");
  console.error("  or RAILWAY_API_BASE_URL=https://your-railway-api.up.railway.app\n");
  process.exit(1);
}

if (isLocalUrl(railwayApiBase)) {
  console.error("\n[dev:railway] Refusing local API target because this mode must mimic Netlify/Railway.");
  console.error(`[dev:railway] Current target: ${railwayApiBase}`);
  console.error("Use npm run dev:hybrid for local API, or set VITE_RAILWAY_API_BASE to Railway.\n");
  process.exit(1);
}

async function checkApi() {
  const healthUrl = `${railwayApiBase}/healthz`;
  try {
    const res = await fetch(healthUrl, { cache: "no-store" });
    if (res.ok) {
      console.log(`[dev:railway] Railway API OK: ${healthUrl}`);
      return true;
    }
    console.error(`[dev:railway] Railway API health returned ${res.status}: ${healthUrl}`);
    return false;
  } catch (error) {
    console.error(`[dev:railway] Railway API is not reachable: ${healthUrl}`);
    console.error(error?.message || error);
    return false;
  }
}

if (!(await checkApi())) process.exit(1);

console.log(`[dev:railway] Web: http://127.0.0.1:${vitePort}`);
console.log(`[dev:railway] proxy /api -> ${railwayApiBase}`);

const command = isWindows ? "cmd.exe" : "vite";
const args = isWindows ? ["/d", "/s", "/c", "vite"] : [];
const child = spawn(command, args, {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    VITE_PORT: vitePort,
    VITE_DEV_API_PROXY_TARGET: railwayApiBase,
    VITE_REALTIME_API_BASE: normalizeUrl(process.env.VITE_REALTIME_API_BASE || railwayApiBase),
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
