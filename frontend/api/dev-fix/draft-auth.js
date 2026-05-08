import { ethers } from "ethers";
import { isAddress, json } from "../../server/http.js";

const ACTIONS = new Set([
  "create_draft",
  "read_draft",
  "save_promotion",
  "publish_promotion",
  "archive_draft",
  "deploy_draft",
  "follow_draft",
  "comment_draft",
  "arm_draft_notifications",
  "draft_owner_session",
]);

const CONNECTED_WALLET_ALLOWED_ACTIONS = new Set([
  "read_draft",
  "save_promotion",
  "publish_promotion",
  "archive_draft",
  "deploy_draft",
]);

function normalizeAddress(value) {
  const raw = String(value || "").trim().toLowerCase();
  return isAddress(raw) ? raw : "";
}

function buildDraftAuthMessage({ action, walletAddress, chainId, nonce, draftId }) {
  const lines = [
    "MemeWarzone Prepare Mode",
    `Action: ${action}`,
    `Wallet: ${normalizeAddress(walletAddress)}`,
    `Chain ID: ${Number(chainId)}`,
  ];

  if (draftId) lines.push(`Draft ID: ${String(draftId)}`);
  lines.push(`Nonce: ${String(nonce || "")}`);

  return lines.join("\n");
}

export async function requireDraftActionAuth({
  res,
  pool,
  auth,
  expectedWallet,
  chainId,
  action,
  draftId = null,
}) {
  if (!ACTIONS.has(action)) {
    json(res, 500, { error: "Invalid draft auth action." });
    return null;
  }

  const wallet = normalizeAddress(auth?.walletAddress || auth?.address || auth?.viewer);
  const expected = normalizeAddress(expectedWallet);
  const expectedChainId = Number(chainId);

  if (!wallet || !expected || wallet !== expected) {
    json(res, 401, { error: "Connected wallet does not match the draft owner." });
    return null;
  }

  if (!Number.isFinite(expectedChainId) || expectedChainId <= 0) {
    json(res, 400, { error: "Invalid draft chain id." });
    return null;
  }

  if (Number(auth?.chainId) !== expectedChainId) {
    json(res, 401, { error: "Connected wallet chain does not match this draft." });
    return null;
  }

  // Current migration scope: after the creator wallet is connected, draft owner
  // actions do not require extra wallet signatures. Only create_draft still signs.
  if (action !== "create_draft" && CONNECTED_WALLET_ALLOWED_ACTIONS.has(action)) {
    return {
      walletAddress: wallet,
      chainId: expectedChainId,
    };
  }

  if (!pool) {
    json(res, 503, {
      error: "Draft wallet auth requires DATABASE_URL-backed nonce storage.",
    });
    return null;
  }

  const nonce = String(auth?.nonce || "").trim();
  const signature = String(auth?.signature || "").trim();
  const message = String(auth?.message || "");

  if (!nonce || !signature) {
    json(res, 401, { error: "Wallet signature required." });
    return null;
  }

  const expectedMessage = buildDraftAuthMessage({
    action,
    walletAddress: wallet,
    chainId: expectedChainId,
    nonce,
    draftId,
  });

  if (message && message !== expectedMessage) {
    json(res, 401, { error: "Wallet signature message mismatch." });
    return null;
  }

  let recovered = "";

  try {
    recovered = normalizeAddress(ethers.verifyMessage(expectedMessage, signature));
  } catch {
    json(res, 401, { error: "Invalid wallet signature." });
    return null;
  }

  if (recovered !== wallet) {
    json(res, 401, {
      error: "Wallet signature was not produced by the connected wallet.",
    });
    return null;
  }

  const nonceRes = await pool.query(
    `select nonce, expires_at, used_at
       from auth_nonces
      where chain_id = $1
        and address = $2
        and nonce = $3
      limit 1`,
    [expectedChainId, wallet, nonce],
  );

  const row = nonceRes.rows[0];

  if (!row) {
    json(res, 401, { error: "Wallet auth nonce not found. Please sign again." });
    return null;
  }

  if (row.used_at) {
    json(res, 401, { error: "Wallet auth nonce already used. Please sign again." });
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    json(res, 401, { error: "Wallet auth nonce expired. Please sign again." });
    return null;
  }

  await pool.query(
    `update auth_nonces
        set used_at = now()
      where chain_id = $1
        and address = $2
        and nonce = $3
        and used_at is null`,
    [expectedChainId, wallet, nonce],
  );

  return {
    walletAddress: wallet,
    chainId: expectedChainId,
  };
}
