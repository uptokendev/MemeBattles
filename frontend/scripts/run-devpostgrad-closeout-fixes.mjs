#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
await import(`${pathToFileURL(path.resolve(here, "apply-devpostgrad-closeout-fixes.mjs")).href}?run=${Date.now()}`);
await import(`${pathToFileURL(path.resolve(here, "apply-featured-draft-logo-fix.mjs")).href}?run=${Date.now()}`);

const upvotePath = path.resolve(here, "../src/components/token/UpvoteDialog.tsx");
const original = fs.readFileSync(upvotePath, "utf8");
const hadCrLf = original.includes("\r\n");
let source = original.replace(/\r\n/g, "\n");

const broken = `      let valueWei: bigint;
      try {
        valueWei = ethers.parseEther(String(amountBnb));
      } catch {
        fail("Invalid amount", "Enter a valid BNB amount.");
      }
      if (valueWei < effectiveMinWei) {`;
const corrected = `      let parsedWei: bigint;
      try {
        parsedWei = ethers.parseEther(String(amountBnb));
      } catch {
        fail("Invalid amount", "Enter a valid BNB amount.");
      }
      if (parsedWei < displayedMinWei) {`;

if (source.includes(broken)) {
  source = source.replace(broken, corrected);
  fs.writeFileSync(upvotePath, hadCrLf ? source.replace(/\n/g, "\r\n") : source);
  console.log(`[devpostgrad-closeout] corrected submit-time upvote normalization in ${upvotePath}`);
}

const finalSource = fs.readFileSync(upvotePath, "utf8");
if (!finalSource.includes("let parsedWei: bigint;") || !finalSource.includes("const valueWei = parsedWei < effectiveMinWei ? effectiveMinWei : parsedWei;")) {
  throw new Error("Upvote exact-minimum normalization is incomplete after the closeout repair.");
}
if (finalSource.includes("let valueWei: bigint;") && finalSource.includes("const valueWei = parsedWei < effectiveMinWei")) {
  throw new Error("Upvote submit path still contains a duplicate valueWei declaration.");
}

console.log("[devpostgrad-closeout] guarded closeout repairs are valid");
