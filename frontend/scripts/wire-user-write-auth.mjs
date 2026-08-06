import fs from "fs";

// --- upload.js: dual wallet auth via form/query fields (multipart-safe) ---
{
  const path = "frontend/api/upload.js";
  let c = fs.readFileSync(path, "utf8");
  if (!c.includes("requireWalletActionAuth")) {
    c = c.replace(
      'import { isSolanaAddress, normalizeAddress } from "../server/http.js";\n',
      'import { isSolanaAddress, normalizeAddress } from "../server/http.js";\nimport { requireWalletActionAuth } from "./lib/walletActionAuth.js";\n',
    );

    // After address normalization, require auth when address present
    const needle = `  const draftId = String(q.draftId || "").trim();\n\n  const maxBytes = 5 * 1024 * 1024;`;
    const insert = `  const draftId = String(q.draftId || "").trim();

  // Dual-auth wallet proof (query or pre-parsed fields). Enforce via API_AUTH_ENFORCE_USER_WRITES.
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
      extraLines: draftId ? [\`Draft ID: \${draftId}\`] : [],
    });
    if (!verified) return;
  }

  const maxBytes = 5 * 1024 * 1024;`;
    if (!c.includes(needle)) {
      console.error("upload.js needle not found");
      process.exit(1);
    }
    c = c.replace(needle, insert);
    fs.writeFileSync(path, c);
    console.log("patched upload.js");
  } else {
    console.log("upload.js already patched");
  }
}

// --- follows/campaign.js ---
{
  const path = "frontend/api/follows/campaign.js";
  let c = fs.readFileSync(path, "utf8");
  if (!c.includes("requireWalletActionAuth")) {
    c = c.replace(
      'import { badMethod, getQuery, isAddress, isSolanaChain, normalizeAddress, json, readJson } from "../../server/http.js";\n',
      'import { badMethod, getQuery, isAddress, isSolanaChain, normalizeAddress, json, readJson } from "../../server/http.js";\nimport { requireWalletActionAuth } from "../lib/walletActionAuth.js";\n',
    );
    c = c.replace(
      `      if (action !== "follow" && action !== "unfollow") return json(res, 400, { error: "Invalid action" });\n\n      if (action === "follow") {`,
      `      if (action !== "follow" && action !== "unfollow") return json(res, 400, { error: "Invalid action" });

      const verified = await requireWalletActionAuth({
        res,
        pool,
        auth: body.auth || body,
        expectedWallet: user,
        chainId,
        action: action === "follow" ? "follow_campaign" : "unfollow_campaign",
        routeLabel: "follows/campaign",
        extraLines: [\`Campaign: \${campaign}\`],
      });
      if (!verified) return;

      if (action === "follow") {`,
    );
    fs.writeFileSync(path, c);
    console.log("patched follows/campaign.js");
  }
}

// --- follows/user.js ---
{
  const path = "frontend/api/follows/user.js";
  let c = fs.readFileSync(path, "utf8");
  if (!c.includes("requireWalletActionAuth")) {
    c = c.replace(
      'import { badMethod, getQuery, isAddress, isSolanaChain, normalizeAddress, json, readJson } from "../../server/http.js";\n',
      'import { badMethod, getQuery, isAddress, isSolanaChain, normalizeAddress, json, readJson } from "../../server/http.js";\nimport { requireWalletActionAuth } from "../lib/walletActionAuth.js";\n',
    );
    // Find POST unfollow/follow branch - more generic insert after action check
    if (c.includes('if (action !== "follow" && action !== "unfollow")')) {
      c = c.replace(
        `if (action !== "follow" && action !== "unfollow") return json(res, 400, { error: "Invalid action" });`,
        `if (action !== "follow" && action !== "unfollow") return json(res, 400, { error: "Invalid action" });

      const follower = normalizeAddress(String(body.followerAddress || body.userAddress || body.follower || "").trim(), chainId) || user;
      const verified = await requireWalletActionAuth({
        res,
        pool,
        auth: body.auth || body,
        expectedWallet: follower || user,
        chainId,
        action: action === "follow" ? "follow_user" : "unfollow_user",
        routeLabel: "follows/user",
      });
      if (!verified) return;`,
      );
      fs.writeFileSync(path, c);
      console.log("patched follows/user.js");
    } else {
      console.warn("follows/user.js action check not found — manual review");
    }
  }
}

// --- reward-claim-intent.js: optional wallet auth dual ---
{
  const path = "frontend/api/dev-form/reward-claim-intent.js";
  let c = fs.readFileSync(path, "utf8");
  if (!c.includes("requireWalletActionAuth")) {
    // Find existing imports
    if (c.includes('from "../../server/db.js"') || c.includes("from '../../server/db.js'")) {
      c = c.replace(
        /import \{ pool \} from "\.\.\/\.\.\/server\/db\.js";/,
        'import { pool } from "../../server/db.js";\nimport { requireWalletActionAuth } from "../lib/walletActionAuth.js";',
      );
    } else {
      // prepend after first import
      c = c.replace(
        /^(import .+\n)/m,
        '$1import { requireWalletActionAuth } from "../lib/walletActionAuth.js";\n',
      );
    }

    const intentNeedle = `  if (!ids.length || !wallet) return json(res, 400, { error: "Missing rewardLedgerIds or walletAddress" });

  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: existing } = await client.query(
      \`select *
         from public.reward_ledger
        where id = any($1::uuid[])
          and wallet_address = $2
          and status in ('claimable', 'claim_pending', 'failed')`;

    // simpler unique needle
    const simple = `export async function rewardClaimIntent(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const ids = Array.isArray(body.rewardLedgerIds) ? body.rewardLedgerIds : [body.rewardLedgerId || body.id].filter(Boolean);
  const chainId = body.chainId ? Number(body.chainId) : null;
  const address = String(body.address || body.walletAddress || "").trim();
  const wallet = normalizeWallet(address, chainId);

  if (!ids.length || !wallet) return json(res, 400, { error: "Missing rewardLedgerIds or walletAddress" });`;

    const simpleRepl = `export async function rewardClaimIntent(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const ids = Array.isArray(body.rewardLedgerIds) ? body.rewardLedgerIds : [body.rewardLedgerId || body.id].filter(Boolean);
  const chainId = body.chainId ? Number(body.chainId) : null;
  const address = String(body.address || body.walletAddress || "").trim();
  const wallet = normalizeWallet(address, chainId);

  if (!ids.length || !wallet) return json(res, 400, { error: "Missing rewardLedgerIds or walletAddress" });

  const verified = await requireWalletActionAuth({
    res,
    pool,
    auth: body.auth || body,
    expectedWallet: wallet,
    chainId: chainId || Number(body.chainId) || 56,
    action: "claim_intent",
    routeLabel: "rewards/claim-intent",
  });
  if (!verified) return;`;

    if (c.includes(simple)) {
      c = c.replace(simple, simpleRepl);
    } else {
      console.warn("claim-intent needle mismatch");
    }

    const recordSimple = `export async function rewardClaimRecord(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const ids = Array.isArray(body.rewardLedgerIds) ? body.rewardLedgerIds : [body.rewardLedgerId || body.id].filter(Boolean);
  const chainId = body.chainId ? Number(body.chainId) : null;
  const wallet = normalizeWallet(body.address || body.walletAddress, chainId);
  const txHash = String(body.txHash || body.claimTxHash || "").trim();
  const failed = String(body.status || "claimed").toLowerCase() === "failed";
  const claimError = String(body.claimError || body.error || "").trim();

  if (!ids.length || !wallet) return json(res, 400, { error: "Missing rewardLedgerIds or walletAddress" });`;

    const recordRepl = `export async function rewardClaimRecord(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const ids = Array.isArray(body.rewardLedgerIds) ? body.rewardLedgerIds : [body.rewardLedgerId || body.id].filter(Boolean);
  const chainId = body.chainId ? Number(body.chainId) : null;
  const wallet = normalizeWallet(body.address || body.walletAddress, chainId);
  const txHash = String(body.txHash || body.claimTxHash || "").trim();
  const failed = String(body.status || "claimed").toLowerCase() === "failed";
  const claimError = String(body.claimError || body.error || "").trim();

  if (!ids.length || !wallet) return json(res, 400, { error: "Missing rewardLedgerIds or walletAddress" });

  const verified = await requireWalletActionAuth({
    res,
    pool,
    auth: body.auth || body,
    expectedWallet: wallet,
    chainId: chainId || Number(body.chainId) || 56,
    action: "claim_record",
    routeLabel: "rewards/claim-record",
  });
  if (!verified) return;`;

    if (c.includes(recordSimple)) {
      c = c.replace(recordSimple, recordRepl);
    } else {
      console.warn("claim-record needle mismatch");
    }

    fs.writeFileSync(path, c);
    console.log("patched reward-claim-intent.js");
  }
}

// --- campaigns/upsert.js ---
{
  const path = "frontend/api/campaigns/upsert.js";
  let c = fs.readFileSync(path, "utf8");
  if (!c.includes("requireWalletActionAuth")) {
    c = c.replace(
      'import { badMethod, json, normalizeAddress, readJson } from "../../server/http.js";\n',
      'import { badMethod, json, normalizeAddress, readJson } from "../../server/http.js";\nimport { getExpectedInternalToken, isAuthEnforceUserWrites, readInternalToken } from "../lib/apiAuth.js";\nimport { requireWalletActionAuth } from "../lib/walletActionAuth.js";\n',
    );
    const needle = `  if (!creatorAddress) return json(res, 400, { error: "Invalid creatorAddress" });

    const logoUri = cleanText(b.logoURI ?? b.logoUri ?? b.logo_url, 1000) || null;`;
    const repl = `  if (!creatorAddress) return json(res, 400, { error: "Invalid creatorAddress" });

    // Dual-auth: valid internal token (service) OR creator wallet signature OR legacy when enforce off.
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
        extraLines: [\`Campaign: \${campaignAddress}\`],
      });
      if (!verified) return;
      if (verified.legacy && isAuthEnforceUserWrites()) {
        return json(res, 401, { error: "Creator signature or internal token required.", code: "UPSERT_AUTH_REQUIRED" });
      }
    }

    const logoUri = cleanText(b.logoURI ?? b.logoUri ?? b.logo_url, 1000) || null;`;
    if (c.includes(needle)) {
      c = c.replace(needle, repl);
      fs.writeFileSync(path, c);
      console.log("patched campaigns/upsert.js");
    } else {
      console.warn("campaigns upsert needle not found");
    }
  }
}

console.log("user-write auth wiring done");
