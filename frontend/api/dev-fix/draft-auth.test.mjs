import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { ethers } from "ethers";

import { requireDraftActionAuth } from "./draft-auth.js";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes) {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let result = "";
  while (value > 0n) {
    const remainder = Number(value % 58n);
    result = BASE58_ALPHABET[remainder] + result;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = `1${result}`;
  }
  return result || "1";
}

function authMessage({ action, walletAddress, chainId, nonce, draftId }) {
  const wallet = chainId === 101 ? walletAddress : walletAddress.toLowerCase();
  const lines = [
    "MemeWarzone Prepare Mode",
    `Action: ${action}`,
    `Wallet: ${wallet}`,
    `Chain ID: ${chainId}`,
  ];
  if (draftId) lines.push(`Draft ID: ${draftId}`);
  lines.push(`Nonce: ${nonce}`);
  return lines.join("\n");
}

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    setHeader() {},
    end() {},
  };
}

function mockPool() {
  const nonces = new Map();
  const sessions = new Map();

  return {
    nonces,
    sessions,
    async query(sql, params) {
      if (sql.includes("update public.auth_nonces")) {
        const [chainId, wallet, nonce] = params;
        const key = `${chainId}:${wallet}:${nonce}`;
        const row = nonces.get(key);
        if (!row || row.usedAt || row.expiresAt <= Date.now()) return { rows: [] };
        row.usedAt = Date.now();
        return { rows: [{ expires_at: new Date(row.expiresAt).toISOString() }] };
      }

      if (sql.includes("insert into public.draft_owner_sessions")) {
        const [tokenHash, draftId, chainId, wallet, expiresAt] = params;
        if (!sessions.has(tokenHash)) {
          sessions.set(tokenHash, {
            draftId,
            chainId,
            wallet,
            expiresAt: new Date(expiresAt).getTime(),
            revokedAt: null,
          });
        }
        return { rows: [] };
      }

      if (sql.includes("update public.draft_owner_sessions")) {
        const [tokenHash, draftId, chainId, wallet] = params;
        const row = sessions.get(tokenHash);
        if (
          !row ||
          row.draftId !== draftId ||
          row.chainId !== chainId ||
          row.wallet !== wallet ||
          row.revokedAt ||
          row.expiresAt <= Date.now()
        ) return { rows: [] };
        return { rows: [{ expires_at: new Date(row.expiresAt).toISOString() }] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
}

function addNonce(pool, chainId, wallet, nonce) {
  pool.nonces.set(`${chainId}:${wallet}:${nonce}`, {
    expiresAt: Date.now() + 10 * 60 * 1000,
    usedAt: null,
  });
}

test("EVM owner session is verified once and reusable only for its draft scope", async () => {
  const wallet = ethers.Wallet.createRandom();
  const chainId = 97;
  const draftId = "draft-a";
  const nonce = "nonce-a";
  const message = authMessage({ action: "draft_owner_session", walletAddress: wallet.address, chainId, nonce, draftId });
  const signature = await wallet.signMessage(message);
  const auth = {
    action: "draft_owner_session",
    walletAddress: wallet.address,
    chainId,
    draftId,
    nonce,
    message,
    signature,
  };
  const pool = mockPool();
  addNonce(pool, chainId, wallet.address.toLowerCase(), nonce);

  const first = await requireDraftActionAuth({
    res: mockResponse(), pool, auth, expectedWallet: wallet.address, chainId, action: "save_promotion", draftId,
  });
  assert.equal(first?.ownerSession, true);
  assert.equal(pool.sessions.size, 1);

  const second = await requireDraftActionAuth({
    res: mockResponse(), pool, auth, expectedWallet: wallet.address, chainId, action: "deploy_draft", draftId,
  });
  assert.equal(second?.ownerSession, true);

  const wrongDraftResponse = mockResponse();
  const wrongDraft = await requireDraftActionAuth({
    res: wrongDraftResponse, pool, auth, expectedWallet: wallet.address, chainId, action: "deploy_draft", draftId: "draft-b",
  });
  assert.equal(wrongDraft, null);
  assert.equal(wrongDraftResponse.statusCode, 401);
});

test("exact action signatures cannot replay their nonce", async () => {
  const wallet = ethers.Wallet.createRandom();
  const chainId = 97;
  const nonce = "nonce-exact";
  const message = authMessage({ action: "create_draft", walletAddress: wallet.address, chainId, nonce });
  const signature = await wallet.signMessage(message);
  const auth = { action: "create_draft", walletAddress: wallet.address, chainId, draftId: null, nonce, message, signature };
  const pool = mockPool();
  addNonce(pool, chainId, wallet.address.toLowerCase(), nonce);

  const first = await requireDraftActionAuth({
    res: mockResponse(), pool, auth, expectedWallet: wallet.address, chainId, action: "create_draft",
  });
  assert.ok(first);

  const replayResponse = mockResponse();
  const replay = await requireDraftActionAuth({
    res: replayResponse, pool, auth, expectedWallet: wallet.address, chainId, action: "create_draft",
  });
  assert.equal(replay, null);
  assert.equal(replayResponse.statusCode, 401);
});

test("Solana Ed25519 signatures are cryptographically verified", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const walletAddress = encodeBase58(publicDer.subarray(publicDer.length - 32));
  const chainId = 101;
  const draftId = "solana-draft";
  const nonce = "solana-nonce";
  const message = authMessage({ action: "save_promotion", walletAddress, chainId, nonce, draftId });
  const signature = crypto.sign(null, Buffer.from(message), privateKey).toString("base64");
  const auth = {
    walletType: "solana",
    action: "save_promotion",
    walletAddress,
    chainId,
    draftId,
    nonce,
    message,
    signature,
  };
  const pool = mockPool();
  addNonce(pool, chainId, walletAddress, nonce);

  const result = await requireDraftActionAuth({
    res: mockResponse(), pool, auth, expectedWallet: walletAddress, chainId, action: "save_promotion", draftId,
  });
  assert.ok(result);

  const tamperedResponse = mockResponse();
  const tampered = await requireDraftActionAuth({
    res: tamperedResponse,
    pool: mockPool(),
    auth: { ...auth, message: `${message}!` },
    expectedWallet: walletAddress,
    chainId,
    action: "save_promotion",
    draftId,
  });
  assert.equal(tampered, null);
  assert.equal(tamperedResponse.statusCode, 401);
});
