/**
 * Serve the Vite dist/ as an SPA (index.html fallback).
 * Use this as the Coolify/Nixpacks start command when nginx is not in front:
 *   npm run spa:serve
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = String(process.env.PORT || 80);
const viteBin = path.join(frontendRoot, "node_modules", "vite", "bin", "vite.js");

const child = spawn(
  process.execPath,
  [viteBin, "preview", "--host", "0.0.0.0", "--port", port],
  { cwd: frontendRoot, stdio: "inherit" },
);

child.on("exit", (code) => process.exit(code ?? 1));
