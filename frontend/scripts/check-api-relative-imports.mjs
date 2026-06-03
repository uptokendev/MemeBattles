#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const entrypoint = path.join(frontendRoot, "api", "server.mjs");

function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function candidatesFor(resolvedPath) {
  if (path.extname(resolvedPath)) return [resolvedPath];
  return [
    `${resolvedPath}.js`,
    `${resolvedPath}.mjs`,
    path.join(resolvedPath, "index.js"),
    path.join(resolvedPath, "index.mjs"),
  ];
}

function resolveLocalImport(file, specifier) {
  const resolvedPath = path.resolve(path.dirname(file), specifier);
  return candidatesFor(resolvedPath).find((candidate) => fs.existsSync(candidate)) || null;
}

function relativeToFrontend(filePath) {
  return path.relative(frontendRoot, filePath).split(path.sep).join("/");
}

const missing = [];
const visited = new Set();
const stack = [entrypoint];

while (stack.length > 0) {
  const file = stack.pop();
  if (!file || visited.has(file)) continue;
  visited.add(file);

  const source = fs.readFileSync(file, "utf8");
  for (const specifier of importSpecifiers(source)) {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) continue;

    const resolved = resolveLocalImport(file, specifier);
    if (!resolved) {
      missing.push({ file, specifier });
      continue;
    }

    stack.push(resolved);
  }
}

if (missing.length > 0) {
  console.error("API gateway import check failed. Missing reachable local imports:");
  for (const item of missing) {
    console.error(`- ${relativeToFrontend(item.file)} imports ${item.specifier}`);
  }
  process.exit(1);
}

console.log(`API gateway import check passed for ${visited.size} reachable source files.`);
