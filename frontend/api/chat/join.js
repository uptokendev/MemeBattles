import { badMethod, json, readJson } from "../../server/http.js";
import {
  consumeNonce,
  createChatSession,
  ensureAuthNonceSchema,
  ensureChatSchema,
  fetchProfile,
  normalizeAddress,
  verifyChatSessionSignature,
} from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return badMethod(res);
  try {
    await ensureAuthNonceSchema();
    await ensureChatSchema();

    const b = await readJson(req);
    const chainId = Number(b.chainId);
    const campaignAddress = normalizeAddress(b.campaignAddress);
    const address = normalizeAddress(b.address);
    const nonce = String(b.nonce ?? "").trim();
    const signature = String(b.signature ?? "").trim();

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!campaignAddress) return json(res, 400, { error: "Invalid campaignAddress" });
    if (!address) return json(res, 400, { error: "Invalid address" });
    if (!nonce) return json(res, 400, { error: "Nonce missing" });
    if (!signature) return json(res, 400, { error: "Signature missing" });

    await consumeNonce(chainId, address, nonce);
    const recovered = verifyChatSessionSignature({ chainId, address, campaignAddress, nonce, signature });
    if (recovered !== address) return json(res, 401, { error: "Invalid signature" });

    const profile = await fetchProfile(chainId, address);
    const role = normalizeAddress(b.creatorAddress) === address ? "creator" : "trader";
    const session = await createChatSession({
      chainId,
      campaignAddress,
      walletAddress: address,
      displayName: profile?.display_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      role,
    });

    return json(res, 200, {
      sessionToken: session.rawToken,
      expiresAt: session.expiresAt,
      profile: {
        walletAddress: address,
        displayName: profile?.display_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        role,
      },
    });
  } catch (e) {
    const msg = String(e?.message ?? "");
    const status = /nonce|signature/i.test(msg) ? 401 : 500;
    console.error("[api/chat/join]", e);
    return json(res, status, {
      error: status === 401 ? msg : "Server error",
      details: process.env.NODE_ENV !== "production" ? msg : undefined,
    });
  }
}
