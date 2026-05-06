import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";

const apiPort = process.env.PORT || process.env.API_PORT || process.env.VITE_DEV_API_PORT || "3001";
const vitePort = process.env.VITE_PORT || "5173";

const children = [];
let shuttingDown = false;

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
process.on("exit", () => {
  if (!shuttingDown) shutdown(0);
});

console.log(`[dev-hybrid] API: http://127.0.0.1:${apiPort}`);
console.log(`[dev-hybrid] Web: http://127.0.0.1:${vitePort}`);

start("api", "api:dev", {
  PORT: apiPort,
  API_PORT: apiPort,
});

start("vite", "dev:vite", {
  VITE_DEV_API_PORT: apiPort,
  VITE_DEV_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
  VITE_PORT: vitePort,
});
