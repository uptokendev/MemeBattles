import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";

const apiPort = process.env.PORT || process.env.API_PORT || process.env.VITE_DEV_API_PORT || "3001";
const vitePort = process.env.VITE_PORT || "5173";
const apiBase = `http://127.0.0.1:${apiPort}`;
const healthUrl = `${apiBase}/healthz`;

const children = [];
let shuttingDown = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isApiHealthy() {
  try {
    const res = await fetch(healthUrl, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForApi(timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isApiHealthy()) return true;
    await sleep(500);
  }
  return false;
}

function start(name, script, env) {
  const command = isWindows ? "cmd.exe" : "npm";
  const args = isWindows ? ["/d", "/s", "/c", `npm run ${script}`] : ["run", script];

  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    windowsHide: false,
    env: {
      ...process.env,
      ...env,
    },
  });

  children.push(child);

  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`[dev-hybrid] failed to start ${name}:`, error);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (code === 0 || signal) return;
    console.error(`[dev-hybrid] ${name} exited with code ${code ?? "signal " + signal}`);
    shutdown(code || 1);
  });

  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      if (isWindows && child.pid) {
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      // ignore
    }
  }
  setTimeout(() => process.exit(code), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(`[dev-hybrid] API: ${apiBase}`);
console.log(`[dev-hybrid] Web: http://127.0.0.1:${vitePort}`);

const apiAlreadyRunning = await isApiHealthy();

if (apiAlreadyRunning) {
  console.log(`[dev-hybrid] API already healthy, reusing existing server: ${healthUrl}`);
} else {
  // Use stable API mode by default. The node --watch API script can restart from
  // unrelated file activity and cause browser refreshes across every route.
  start("api", "api:start", {
    PORT: apiPort,
    API_PORT: apiPort,
  });

  console.log(`[dev-hybrid] waiting for API health: ${healthUrl}`);
  const apiReady = await waitForApi();

  if (!apiReady) {
    console.error(`[dev-hybrid] API did not become healthy at ${healthUrl}`);
    shutdown(1);
  } else {
    console.log(`[dev-hybrid] API is healthy`);
  }
}

start("vite", "dev:vite", {
  VITE_DEV_API_PORT: apiPort,
  VITE_DEV_API_PROXY_TARGET: apiBase,
  VITE_PORT: vitePort,
});
