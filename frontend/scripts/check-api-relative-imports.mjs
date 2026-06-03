#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const apiRoot = path.join(frontendRoot, "api");
const sourceExtensions = new Set([".js", ".mjs"]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) return [fullPath];
    return [];
  });
}

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

function relativeToFrontend(filePath) {
  return path.relative(frontendRoot, filePath).split(path.sep).join("/");
}

const missing = [];
const files = walk(apiRoot);

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const specifier of importSpecifiers(source)) {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) continue;

    const resolvedPath = path.resolve(path.dirname(file), specifier);
    if (candidatesFor(resolvedPath).some((candidate) => fs.existsSync(candidate))) continue;

    missing.push({ file, specifier });
  }
}

if (missing.length > 0) {
  console.error("API relative import check failed. Missing local imports:");
  for (const item of missing) {
    console.error(`- ${relativeToFrontend(item.file)} imports ${item.specifier}`);
  }
  process.exit(1);
}

console.log(`API relative import check passed for ${files.length} API source files.`);
