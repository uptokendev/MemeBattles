#!/usr/bin/env node

import fs from "node:fs";

const path = "scripts/apply-scheduled-cooldown-timezone-fix.mjs";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  source = source.replace(before, after);
}

const genericPreflightPatch = `replaceOnce(
  "frontend/api/dev-fix/security.js",
  "  const preflight = await evaluateCreatePreflight({ walletAddress });\\n  return json(res, preflight.allowed ? 200 : 403, { preflight });",
  "  const preflight = await evaluateCreatePreflight({ walletAddress, launchAt: body.launchAt || body.scheduledLaunchAt || null });\\n  return json(res, preflight.allowed ? 200 : 403, { preflight });",
  "use launchAt in launchpad create preflight endpoint",
);`;

const scopedPreflightPatch = `replaceOnce(
  "frontend/api/dev-fix/security.js",
  block([
    "export async function launchpadPreflightCreate(req, res) {",
    "  if (!methodAllowed(req, res, [\\"POST\\"])) return;",
    "  const body = await readJson(req);",
    "  const walletAddress = normalizeWallet(body.walletAddress || body.creatorWallet || body.creator);",
    "  const preflight = await evaluateCreatePreflight({ walletAddress });",
    "  return json(res, preflight.allowed ? 200 : 403, { preflight });",
    "}",
  ]),
  block([
    "export async function launchpadPreflightCreate(req, res) {",
    "  if (!methodAllowed(req, res, [\\"POST\\"])) return;",
    "  const body = await readJson(req);",
    "  const walletAddress = normalizeWallet(body.walletAddress || body.creatorWallet || body.creator);",
    "  const preflight = await evaluateCreatePreflight({ walletAddress, launchAt: body.launchAt || body.scheduledLaunchAt || null });",
    "  return json(res, preflight.allowed ? 200 : 403, { preflight });",
    "}",
  ]),
  "use launchAt in launchpad create preflight endpoint",
);`;

replaceOnce(genericPreflightPatch, scopedPreflightPatch, "scope launchpad preflight patch");

replaceOnce(
  `    "    )",
    "      .to.emit(factory, \\"ScheduledCreatorLaunchReserved\\")",
    "      .withArgs(await creator.getAddress(), (await factory.getCampaign(1n)).campaign, launchAt, 1n);",`,
  `    "    ).to.emit(factory, \\"ScheduledCreatorLaunchReserved\\");",`,
  "avoid pre-transaction campaign lookup",
);

fs.writeFileSync(path, source);
console.log("Repaired scheduled cooldown patch generator.");
