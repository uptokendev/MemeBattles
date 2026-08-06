import fs from "fs";

const p = "frontend/api/arenaBattles.js";
let c = fs.readFileSync(p, "utf8");

if (!c.includes("arena_open_battle")) {
  c = c.replace(
    /if \(!creatorStatus\.eligibility\) return json\(res, 409, \{ ok: false, reason: creatorStatus\.unavailableReason \|\| "unavailable", status: creatorStatus \}\);\r?\n\r?\n  const battle =/,
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
}

if (!c.includes("ARENA_OPS_REQUIRED") || !c.includes("arena/battles/transition")) {
  c = c.replace(
    /async function handleTransition\(req, res, battleId\) \{\r?\n  const battle = await findBattle\(battleId\);\r?\n  if \(!battle\) return json\(res, 404, \{ ok: false, error: "Battle not found" \}\);\r?\n  const body = await readJson\(req\);\r?\n  const nextState/,
    `async function handleTransition(req, res, battleId) {
  const battle = await findBattle(battleId);
  if (!battle) return json(res, 404, { ok: false, error: "Battle not found" });
  const body = await readJson(req);
  const admin = await requireAdminOrOps(req, res, { routeLabel: "arena/battles/transition", allowOps: true });
  if (!admin) return;
  if (admin.mode === "legacy-open" && isAuthEnforceArenaMutations()) {
    return json(res, 401, { ok: false, error: "Admin or ops auth required for battle transitions.", code: "ARENA_OPS_REQUIRED" });
  }
  const nextState`,
  );
}

fs.writeFileSync(p, c);
console.log("open?", c.includes("arena_open_battle"));
console.log("transition?", c.includes("arena/battles/transition"));
