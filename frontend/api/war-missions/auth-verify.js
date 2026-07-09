import { pool } from "../../server/db.js";
import {
  createWarAuthCookie,
  isSolanaAddress,
  isWalletAddress,
  normalizeAddress,
  verifyWalletSignature,
  warLoginMessage,
} from "./_lib/auth.js";
import { awardQuestForUser, buildWarProfile, ensureUser, maybeVerifyReferralForUser } from "./_lib/profile.js";
import { getActiveReferralLinkByCode, linkReferralToUser, readReferralCode } from "./_lib/referrals.js";

function hasSignature(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(String(value || "").trim());
}

export default async function wmAuthVerify(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const address = normalizeAddress(String(req.body?.address || ""));
  const signature = req.body?.signature;
  if (!isWalletAddress(address)) return res.status(400).json({ error: "Enter a valid wallet address." });
  if (!hasSignature(signature)) return res.status(400).json({ error: "Missing signature." });

  try {
    const solana = isSolanaAddress(address);
    const { rows: nonceRows } = await pool.query(
      `
        select id, wallet_address, nonce, expires_at, used_at
        from public.wm_wallet_auth_nonces
        where case when $2::boolean then wallet_address = $1 else lower(wallet_address) = $1 end
          and used_at is null
        order by created_at desc
        limit 1
      `,
      [address, solana],
    );
    const nonceRow = nonceRows[0];
    if (!nonceRow) return res.status(400).json({ error: "No login challenge found. Request a new nonce." });
    if (new Date(nonceRow.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: "This login challenge expired. Request a new nonce." });
    }

    const isValid = await verifyWalletSignature(warLoginMessage(address, nonceRow.nonce), signature, address);
    if (!isValid) return res.status(401).json({ error: "Signature verification failed." });

    const user = await ensureUser(address);
    if (user.is_banned) return res.status(403).json({ error: "This wallet is excluded from War Missions." });

    const referralCode = readReferralCode(req);
    const referralLink = referralCode ? await getActiveReferralLinkByCode(referralCode).catch(() => null) : null;

    await Promise.all([
      pool.query(`update public.wm_wallet_auth_nonces set used_at = now() where id = $1`, [nonceRow.id]),
      awardQuestForUser(user.id, "take-the-oath", "wallet_signature", { address }),
      referralLink
        ? linkReferralToUser({
            recruiterUserId: referralLink.recruiter_user_id,
            referredUserId: user.id,
            referralCode: referralLink.code,
          }).catch(() => undefined)
        : Promise.resolve(),
    ]);
    await maybeVerifyReferralForUser(user.id).catch(() => undefined);

    const profile = await buildWarProfile(user);
    res.setHeader("Set-Cookie", createWarAuthCookie(req, { userId: user.id, address }));
    return res.status(200).json({ ok: true, profile });
  } catch (error) {
    console.error("[war-missions/auth-verify] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
