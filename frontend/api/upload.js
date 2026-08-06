import { createClient } from "@supabase/supabase-js";
import formidable from "formidable";
import fs from "fs";
import crypto from "crypto";
import { pool } from "../server/db.js";
import { isSolanaAddress, normalizeAddress } from "../server/http.js";

export const config = {
  api: { bodyParser: false },
};

let storageClient = null;

function getStorageClient() {
  if (storageClient) return storageClient;

  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!url || !key) {
    throw new Error("Supabase upload storage env is missing");
  }

  storageClient = createClient(url, key);
  return storageClient;
}

function bad(res, code, msg) {
  return res.status(code).json({ error: msg });
}

function pickExt(mimetype) {
  switch (mimetype) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

function isSolanaUploadChain(chainId) {
  const id = Number(chainId);
  return id === 101 || id === 102;
}

function normalizeUploadAddress(raw, chainId) {
  const input = String(raw || "").trim();
  if (!input) return "";

  if (isSolanaUploadChain(chainId)) {
    return isSolanaAddress(input) ? input : "";
  }

  return normalizeAddress(input, chainId);
}

async function persistDraftLogo({ draftId, chainId, address, publicUrl }) {
  const id = String(draftId || "").trim();
  if (!id || !address || !publicUrl || !pool) return false;

  try {
    const { rowCount } = await pool.query(
      `update public.campaign_drafts
          set logo_url = $1,
              updated_at = now()
        where id::text = $2
          and chain_id = $3
          and creator_wallet = $4`,
      [publicUrl, id, Number(chainId), address],
    );
    return Number(rowCount || 0) > 0;
  } catch (error) {
    console.warn("[api/upload] failed to persist draft logo", error?.message || error);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  const q = req.query || {};
  const kind = String(q.kind || "avatar");
  const chainId = Number(q.chainId || 97);
  const address = normalizeUploadAddress(q.address, chainId);
  const draftId = String(q.draftId || "").trim();

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


  const maxBytes = 5 * 1024 * 1024;
  const form = formidable({ multiples: false, maxFileSize: maxBytes, maxTotalFileSize: maxBytes });

  try {
    const [, files] = await form.parse(req);
    const fRaw = files.file;
    const f = Array.isArray(fRaw) ? fRaw[0] : fRaw;
    if (!f) return bad(res, 400, "Missing file (field name: file)");

    const filepath = f.filepath || f.path;
    const mimetype = String(f.mimetype || "");
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(mimetype)) return bad(res, 400, "Unsupported image type. Use png/jpg/webp.");

    const ext = pickExt(mimetype);
    if (!ext) return bad(res, 400, "Unsupported image type.");

    const buf = fs.readFileSync(filepath);
    try {
      fs.unlinkSync(filepath);
    } catch {}

    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!supabaseUrl || !supabaseKey) {
      console.warn("[api/upload] Supabase storage envs missing - using in-memory data URL (local dev only). Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for real uploads.");
      const dataUrl = `data:${mimetype};base64,${buf.toString("base64")}`;
      return res.status(200).json({ url: dataUrl, persistedDraftLogo: false });
    }

    let supabase;
    try {
      supabase = getStorageClient();
    } catch (e) {
      console.error("[api/upload] storage env missing", e);
      return bad(res, 503, "Uploads are not configured");
    }

    const bucket = process.env.SUPABASE_BUCKET || "memebattles";
    const uuid = (crypto && typeof crypto.randomUUID === "function" && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name = kind === "avatar" && address ? `avatars/${chainId}/${address}/${uuid}.${ext}` : `logos/${chainId}/${uuid}.${ext}`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(name, buf, { contentType: mimetype, upsert: true, cacheControl: kind === "avatar" ? "60" : "3600" });
    if (upErr) return bad(res, 500, `Supabase upload failed: ${upErr.message}`);

    const { data } = supabase.storage.from(bucket).getPublicUrl(name);
    if (!data?.publicUrl) return bad(res, 500, "Failed to produce public URL");

    const persistedDraftLogo = kind === "logo" && draftId
      ? await persistDraftLogo({ draftId, chainId, address, publicUrl: data.publicUrl })
      : false;

    return res.status(200).json({ url: data.publicUrl, persistedDraftLogo });
  } catch (e) {
    console.error("[api/upload]", e);
    return bad(res, 500, "Server error");
  }
}
