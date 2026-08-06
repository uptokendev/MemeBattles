import fs from "fs";

function ensureImport(c, importLine) {
  if (c.includes(importLine)) return c;
  const httpImport = c.match(/import \{[^}]+\} from ["']\.\.\/server\/http\.js["'];?/);
  if (httpImport) {
    return c.replace(httpImport[0], `${httpImport[0]}\n${importLine}`);
  }
  return `${importLine}\n${c}`;
}

// --- arenaBattles.js ---
{
  const p = "frontend/api/arenaBattles.js";
  let c = fs.readFileSync(p, "utf8");
  if (!c.includes("requireWalletActionAuth")) {
    c = ensureImport(c, 'import { requireAdminOrOps, isAuthEnforceArenaMutations } from "./lib/apiAuth.js";');
    c = ensureImport(c, 'import { requireWalletActionAuth } from "./lib/walletActionAuth.js";');

    const openMarker =
      'if (!creatorStatus.eligibility) return json(res, 409, { ok: false, reason: creatorStatus.unavailableReason || "unavailable", status: creatorStatus });\n\n  const battle =';
    if (c.includes(openMarker)) {
      c = c.replace(
        openMarker,
        `if (!creatorStatus.eligibility) return json(res, 409, { ok: false, reason: creatorStatus.unavailableReason || "unavailable", status: creatorStatus });

  const creatorWallet = normalizeAddress(campaign.creator_address);
  const verified = await requireWalletActionAuth({
    res,
    pool,
    auth: body.auth || body,
    expectedWallet: creatorWallet,
    chainId,
    action: "arena_open_battle",
    routeLabel: "arena/battles/open",
    extraLines: ["Campaign: " + normalizeAddress(campaign.campaign_address)],
  });
  if (!verified) return;

  const battle =`,
      );
    } else {
      console.warn("arenaBattles open marker missing");
    }

    const transMarker =
      'async function handleTransition(req, res, battleId) {\n  const battle = await findBattle(battleId);\n  if (!battle) return json(res, 404, { ok: false, error: "Battle not found" });\n  const body = await readJson(req);';
    if (c.includes(transMarker)) {
      c = c.replace(
        transMarker,
        `async function handleTransition(req, res, battleId) {
  const battle = await findBattle(battleId);
  if (!battle) return json(res, 404, { ok: false, error: "Battle not found" });
  const body = await readJson(req);
  const admin = await requireAdminOrOps(req, res, { routeLabel: "arena/battles/transition", allowOps: true });
  if (!admin) return;
  if (admin.mode === "legacy-open" && isAuthEnforceArenaMutations()) {
    return json(res, 401, { ok: false, error: "Admin or ops auth required for battle transitions.", code: "ARENA_OPS_REQUIRED" });
  }`,
      );
    } else {
      console.warn("arenaBattles transition marker missing");
    }

    fs.writeFileSync(p, c);
    console.log("patched arenaBattles.js");
  } else {
    console.log("arenaBattles.js already patched");
  }
}

// --- arenaLeague.js ---
{
  const p = "frontend/api/arenaLeague.js";
  let c = fs.readFileSync(p, "utf8");
  if (!c.includes("requireAdminOrOps")) {
    c = ensureImport(c, 'import { requireAdminOrOps, isAuthEnforceArenaMutations } from "./lib/apiAuth.js";');
    for (const name of ["handleAdvanceWeek", "handleRebalance", "handleCycle"]) {
      const re = new RegExp(`async function ${name}\\(req, res\\) \\{`);
      if (re.test(c)) {
        c = c.replace(
          re,
          `async function ${name}(req, res) {
  const admin = await requireAdminOrOps(req, res, { routeLabel: "arena/league/${name}", allowOps: true });
  if (!admin) return;
  if (admin.mode === "legacy-open" && isAuthEnforceArenaMutations()) {
    return json(res, 401, { ok: false, error: "Admin or ops auth required.", code: "ARENA_OPS_REQUIRED" });
  }`,
        );
      }
    }
    fs.writeFileSync(p, c);
    console.log("patched arenaLeague.js");
  } else {
    console.log("arenaLeague.js already patched");
  }
}

// --- arenaEvents.js ---
{
  const p = "frontend/api/arenaEvents.js";
  let c = fs.readFileSync(p, "utf8");
  if (!c.includes("requireAdminOrOps") && fs.existsSync(p)) {
    c = ensureImport(c, 'import { requireAdminOrOps, isAuthEnforceArenaMutations } from "./lib/apiAuth.js";');
    // gate POST handlers generically after readJson in transition/advance
    c = c.replace(
      /async function handleAdvanceBracket\(req, res, eventId\) \{/g,
      `async function handleAdvanceBracket(req, res, eventId) {
  const admin = await requireAdminOrOps(req, res, { routeLabel: "arena/events/advance", allowOps: true });
  if (!admin) return;
  if (admin.mode === "legacy-open" && isAuthEnforceArenaMutations()) {
    return json(res, 401, { ok: false, error: "Admin or ops auth required." });
  }`,
    );
    c = c.replace(
      /async function handleTransition\(req, res, eventId\) \{/g,
      `async function handleTransition(req, res, eventId) {
  const admin = await requireAdminOrOps(req, res, { routeLabel: "arena/events/transition", allowOps: true });
  if (!admin) return;
  if (admin.mode === "legacy-open" && isAuthEnforceArenaMutations()) {
    return json(res, 401, { ok: false, error: "Admin or ops auth required." });
  }`,
    );
    fs.writeFileSync(p, c);
    console.log("patched arenaEvents.js");
  }
}

// --- arenaWarPools.js ---
{
  const p = "frontend/api/arenaWarPools.js";
  let c = fs.readFileSync(p, "utf8");
  if (!c.includes("requireWalletActionAuth")) {
    c = ensureImport(c, 'import { requireAdminOrOps, isAuthEnforceArenaMutations } from "./lib/apiAuth.js";');
    c = ensureImport(c, 'import { requireWalletActionAuth } from "./lib/walletActionAuth.js";');

    // Insert wallet auth after body parse in handleSupport if present
    if (/async function handleSupport\(req, res,/.test(c)) {
      c = c.replace(
        /async function handleSupport\(req, res, ([^)]+)\) \{\n/,
        `async function handleSupport(req, res, $1) {
  {
    const preBody = await readJson(req).catch(() => ({}));
    req._arenaSupportBody = preBody;
    const wallet = String(preBody?.walletAddress || preBody?.address || preBody?.supporter || "").trim().toLowerCase();
    if (wallet) {
      const verified = await requireWalletActionAuth({
        res,
        pool,
        auth: preBody.auth || preBody,
        expectedWallet: wallet,
        chainId: Number(preBody.chainId || 97),
        action: "arena_war_pool_support",
        routeLabel: "arena/war-pools/support",
      });
      if (!verified) return;
    } else if (isAuthEnforceArenaMutations()) {
      return json(res, 401, { ok: false, error: "Wallet auth required for war pool support." });
    }
  }
`,
      );
      // Prefer reusing cached body if handler calls readJson again — replace first readJson in function is hard.
      // Override readJson usage: if body already cached, use it.
      c = c.replace(
        /async function handleSupport[\s\S]*?(const body = await readJson\(req\);)/,
        (block) => block.replace("const body = await readJson(req);", "const body = req._arenaSupportBody || (await readJson(req));"),
      );
    }

    if (/async function handleTransition\(req, res,/.test(c)) {
      c = c.replace(
        /async function handleTransition\(req, res, ([^)]+)\) \{\n/,
        `async function handleTransition(req, res, $1) {
  const admin = await requireAdminOrOps(req, res, { routeLabel: "arena/war-pools/transition", allowOps: true });
  if (!admin) return;
  if (admin.mode === "legacy-open" && isAuthEnforceArenaMutations()) {
    return json(res, 401, { ok: false, error: "Admin or ops auth required." });
  }
`,
      );
    }

    fs.writeFileSync(p, c);
    console.log("patched arenaWarPools.js");
  } else {
    console.log("arenaWarPools.js already patched");
  }
}

console.log("arena auth wiring complete");
