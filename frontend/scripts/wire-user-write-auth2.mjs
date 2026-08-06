import fs from "fs";

function patchUpload() {
  const path = "frontend/api/upload.js";
  let c = fs.readFileSync(path, "utf8");
  if (c.includes("requireWalletActionAuth")) {
    console.log("upload already patched");
    return;
  }
  c = c.replace(
    'import { isSolanaAddress, normalizeAddress } from "../server/http.js";\n',
    'import { isSolanaAddress, normalizeAddress } from "../server/http.js";\nimport { requireWalletActionAuth } from "./lib/walletActionAuth.js";\n',
  );
  const marker = 'const draftId = String(q.draftId || "").trim();';
  const idx = c.indexOf(marker);
  if (idx < 0) throw new Error("upload marker missing");
  const insertAfter = marker;
  const authBlock = `
  // Dual-auth wallet proof (query fields). Enforce via API_AUTH_ENFORCE_USER_WRITES.
  if (address) {
    const action = kind === "logo" ? "upload_logo" : "upload_avatar";
    const auth = {
      action: String(q.action || action),
      walletAddress: address,
      chainId,
      nonce: String(q.nonce || "").trim(),
      message: String(q.message || ""),
      signature: String(q.signature || "").trim(),
      walletType: String(q.walletType || ""),
    };
    const verified = await requireWalletActionAuth({
      res,
      pool,
      auth,
      expectedWallet: address,
      chainId,
      action,
      routeLabel: "upload",
      extraLines: draftId ? ["Draft ID: " + draftId] : [],
    });
    if (!verified) return;
  }
`;
  c = c.replace(insertAfter, insertAfter + "\n" + authBlock);
  // bucket default keep env; leave memebattles until cutover
  fs.writeFileSync(path, c);
  console.log("patched upload.js");
}

function patchFollowsCampaign() {
  const path = "frontend/api/follows/campaign.js";
  let c = fs.readFileSync(path, "utf8");
  if (c.includes("requireWalletActionAuth")) return console.log("campaign follows already");
  c = c.replace(
    'from "../../server/http.js";\n',
    'from "../../server/http.js";\nimport { requireWalletActionAuth } from "../lib/walletActionAuth.js";\n',
  );
  const marker = 'if (action !== "follow" && action !== "unfollow") return json(res, 400, { error: "Invalid action" });';
  if (!c.includes(marker)) throw new Error("campaign follows marker missing");
  c = c.replace(
    marker,
    marker + `
      const verified = await requireWalletActionAuth({
        res,
        pool,
        auth: body.auth || body,
        expectedWallet: user,
        chainId,
        action: action === "follow" ? "follow_campaign" : "unfollow_campaign",
        routeLabel: "follows/campaign",
        extraLines: ["Campaign: " + campaign],
      });
      if (!verified) return;`,
  );
  fs.writeFileSync(path, c);
  console.log("patched follows/campaign.js");
}

function patchFollowsUser() {
  const path = "frontend/api/follows/user.js";
  let c = fs.readFileSync(path, "utf8");
  if (c.includes("requireWalletActionAuth")) return console.log("user follows already");
  c = c.replace(
    'from "../../server/http.js";\n',
    'from "../../server/http.js";\nimport { requireWalletActionAuth } from "../lib/walletActionAuth.js";\n',
  );
  const marker = 'if (action !== "follow" && action !== "unfollow") return json(res, 400, { error: "Invalid action" });';
  if (!c.includes(marker)) throw new Error("user follows marker missing");
  c = c.replace(
    marker,
    marker + `
      const verified = await requireWalletActionAuth({
        res,
        pool,
        auth: body.auth || body,
        expectedWallet: follower,
        chainId,
        action: action === "follow" ? "follow_user" : "unfollow_user",
        routeLabel: "follows/user",
      });
      if (!verified) return;`,
  );
  fs.writeFileSync(path, c);
  console.log("patched follows/user.js");
}

function patchClaims() {
  const path = "frontend/api/dev-fix/reward-claim-intent.js";
  let c = fs.readFileSync(path, "utf8");
  if (c.includes("requireWalletActionAuth")) return console.log("claims already");
  if (!c.includes('from "../lib/walletActionAuth.js"')) {
    c = c.replace(
      'import { pool } from "../../server/db.js";\n',
      'import { pool } from "../../server/db.js";\nimport { requireWalletActionAuth } from "../lib/walletActionAuth.js";\n',
    );
  }
  function injectAfterWalletCheck(fnName, action) {
    const start = c.indexOf(`export async function ${fnName}`);
    if (start < 0) throw new Error("missing " + fnName);
    const marker = `if (!ids.length || !wallet) return json(res, 400, { error: "Missing rewardLedgerIds or walletAddress" });`;
    const rel = c.indexOf(marker, start);
    if (rel < 0) throw new Error("marker missing in " + fnName);
    // only first occurrence after function start — check not already injected nearby
    const window = c.slice(rel, rel + 400);
    if (window.includes("requireWalletActionAuth")) return;
    const inject = marker + `

  const verified = await requireWalletActionAuth({
    res,
    pool,
    auth: body.auth || body,
    expectedWallet: wallet,
    chainId: chainId || Number(body.chainId) || 56,
    action: "${action}",
    routeLabel: "rewards/${action}",
  });
  if (!verified) return;`;
    c = c.slice(0, rel) + inject + c.slice(rel + marker.length);
  }
  injectAfterWalletCheck("rewardClaimIntent", "claim_intent");
  injectAfterWalletCheck("rewardClaimRecord", "claim_record");
  fs.writeFileSync(path, c);
  console.log("patched reward-claim-intent.js");
}

function patchUpsert() {
  const path = "frontend/api/campaigns/upsert.js";
  let c = fs.readFileSync(path, "utf8");
  if (c.includes("requireWalletActionAuth")) return console.log("upsert already");
  c = c.replace(
    'from "../../server/http.js";\n',
    'from "../../server/http.js";\nimport { getExpectedInternalToken, isAuthEnforceUserWrites, readInternalToken } from "../lib/apiAuth.js";\nimport { requireWalletActionAuth } from "../lib/walletActionAuth.js";\n',
  );
  const marker = 'if (!creatorAddress) return json(res, 400, { error: "Invalid creatorAddress" });';
  if (!c.includes(marker)) throw new Error("upsert marker missing");
  const inject = marker + `

    // Dual-auth: valid internal token (service) OR creator wallet signature (legacy open until enforce).
    const expectedInternal = getExpectedInternalToken();
    const providedInternal = readInternalToken(req);
    const internalAuthed = Boolean(expectedInternal && providedInternal && providedInternal === expectedInternal);
    if (!internalAuthed) {
      const verified = await requireWalletActionAuth({
        res,
        pool,
        auth: b.auth || b,
        expectedWallet: creatorAddress,
        chainId,
        action: "campaign_upsert",
        routeLabel: "campaigns/upsert",
        extraLines: ["Campaign: " + campaignAddress],
      });
      if (!verified) return;
    }`;
  c = c.replace(marker, inject);
  fs.writeFileSync(path, c);
  console.log("patched campaigns/upsert.js");
}

patchUpload();
patchFollowsCampaign();
patchFollowsUser();
patchClaims();
patchUpsert();
console.log("all user-write patches applied");
