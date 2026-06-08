import crypto from "node:crypto";
import { ethers } from "ethers";
import { isAddress, isEvmAddress, isSolanaPublicKey, json } from "../../server/http.js";

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

const SOLANA_CHAIN_IDS = new Set([101, 102]);
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function normalizeWallet(value) {
  const raw = String(value || "").trim();
  if (isEvmAddress(raw)) return raw.toLowerCase();
  if (isSolanaPublicKey(raw)) return raw;
  return "";
}

function nonceStorageAddress(wallet) {
  if (isEvmAddress(wallet)) return String(wallet).toLowerCase();
  return `sol:${crypto.createHash("sha256").update(String(wallet)).digest("hex").slice(0, 36)}`;
}

function walletTypeFor(chainId, auth) {
  const explicit = String(auth?.walletType || auth?.type || "").trim().toLowerCase();
  if (explicit === "solana" || explicit === "evm") return explicit;
  return SOLANA_CHAIN_IDS.has(Number(chainId)) ? "solana" : "evm";
}

function buildDraftAuthMessage({ action, walletAddress, chainId, nonce, draftId }) {
  const wallet = normalizeWallet(walletAddress);
  const lines = [
    "MemeWarzone Prepare Mode",
    `Action: ${action}`,
    `Wallet: ${wallet}`,
    `Chain ID: ${Number(chainId)}`,
  ];

  if (draftId) lines.push(`Draft ID: ${String(draftId)}`);
  lines.push(`Nonce: ${String(nonce || "")}`);

  return lines.join("\n");
}

function decodeBase58(value) {
  const input = String(value || "").trim();
  let bytes = [0];

  for (const char of input) {
    const valueIndex = BASE58_ALPHABET.indexOf(char);
    if (valueIndex < 0) return Buffer.alloc(0);

    let carry = valueIndex;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of input) {
    if (char !== "1") break;
    bytes.push(0);
  }

  return Buffer.from(bytes.reverse());
}

function decodeSignature(value) {
  const raw = String(value || "").trim();
  if (!raw) return Buffer.alloc(0);

  const asBase64 = Buffer.from(raw, "base64");
  if (asBase64.length === 64) return asBase64;

  const asHex = /^[a-fA-F0-9]+$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.alloc(0);
  if (asHex.length === 64) return asHex;

  const asBase58 = decodeBase58(raw);
  return asBase58.length === 64 ? asBase58 : Buffer.alloc(0);
}

function verifySolanaMessage({ message, signature, publicKey }) {
  const publicKeyBytes = decodeBase58(publicKey);
  const signatureBytes = decodeSignature(signature);
  if (publicKeyBytes.length !== 32 || signatureBytes.length !== 64) return false;

  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
      format: "der",
      type: "spki",
    });
    return crypto.verify(null, Buffer.from(message), key, signatureBytes);
  } catch {
    return false;
  }
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

  const expectedChainId = Number(chainId);
  const type = walletTypeFor(expectedChainId, auth);
  const wallet = normalizeWallet(auth?.walletAddress || auth?.address || auth?.viewer);
  const expected = normalizeWallet(expectedWallet);

  if (!wallet || !expected || wallet !== expected) {
    json(res, 401, { error: "Connected wallet does not match the draft owner." });
    return null;
  }

  if (!Number.isFinite(expectedChainId) || expectedChainId <= 0) {
    json(res, 400, { error: "Invalid draft chain id." });
    return null;
  }

  if (type === "solana" && !SOLANA_CHAIN_IDS.has(expectedChainId)) {
    json(res, 400, { error: "Solana draft auth requires a Solana draft chain id." });
    return null;
  }

  if (type === "evm" && !isAddress(wallet)) {
    json(res, 400, { error: "Invalid wallet address." });
    return null;
  }

  if (Number(auth?.chainId) !== expectedChainId) {
    json(res, 401, { error: "Connected wallet chain does not match this draft." });
    return null;
  }

  const hasSignedProof = Boolean(
    String(auth?.nonce || "").trim() && String(auth?.signature || "").trim(),
  );

  // Current migration scope: preserve the existing connected-wallet fallback for
  // non-create owner actions, but do not skip verification when the caller sends
  // a nonce/signature. Solana owner helpers now send signed Phantom proofs for
  // private reads, promotion saves/publishes, and archive actions.
  if (action !== "create_draft" && CONNECTED_WALLET_ALLOWED_ACTIONS.has(action) && !hasSignedProof) {
    return {
      walletAddress: wallet,
      chainId: expectedChainId,
      walletType: type,
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

  if (type === "solana") {
    if (!verifySolanaMessage({ message: expectedMessage, signature, publicKey: wallet })) {
      json(res, 401, { error: "Invalid Solana wallet signature." });
      return null;
    }
  } else {
    let recovered = "";

    try {
      recovered = normalizeWallet(ethers.verifyMessage(expectedMessage, signature));
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
  }

  const storedWallet = nonceStorageAddress(wallet);
  const nonceRes = await pool.query(
    `select nonce, expires_at, used_at
       from auth_nonces
      where chain_id = $1
        and address = $2
        and nonce = $3
      limit 1`,
    [expectedChainId, storedWallet, nonce],
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
    [expectedChainId, storedWallet, nonce],
  );

  return {
    walletAddress: wallet,
    chainId: expectedChainId,
    walletType: type,
  };
}
