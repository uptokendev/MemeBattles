import { createClient } from "@supabase/supabase-js";
import formidable from "formidable";
import fs from "fs";
import crypto from "crypto";

// Keep as-is; harmless unless interpreted Next-style
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

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  const q = req.query || {};
  const kind = String(q.kind || "avatar"); // "avatar" | "logo"
  const chainId = String(q.chainId || "97");
  const address = String(q.address || "").toLowerCase();

  const maxBytes = 5 * 1024 * 1024;
  const form = formidable({
    multiples: false,
    maxFileSize: maxBytes,
    maxTotalFileSize: maxBytes,
  });

<<<<<<< HEAD
  form.parse(req, async (err, fields, files) => {
    try {
      if (err) return bad(res, 400, `Upload parse failed: ${err.message}`);

      const fRaw = files.file;
      const f = Array.isArray(fRaw) ? fRaw[0] : fRaw;
      if (!f) return bad(res, 400, "Missing file (field name: file)");
=======
  // Use the promise API for cleaner error handling and to ensure we always
  // send a response even if parsing or upload has issues. This helps avoid
  // situations where the connection gets reset without a proper HTTP response.
  try {
    const [fields, files] = await form.parse(req);

    const fRaw = files.file;
    const f = Array.isArray(fRaw) ? fRaw[0] : fRaw;
    if (!f) return bad(res, 400, "Missing file (field name: file)");

    const filepath = f.filepath || f.path;
    const mimetype = String(f.mimetype || "");
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(mimetype)) {
      return bad(res, 400, "Unsupported image type. Use png/jpg/webp.");
    }

    const ext = pickExt(mimetype);
    if (!ext) return bad(res, 400, "Unsupported image type.");

    const buf = fs.readFileSync(filepath);

    // best-effort cleanup of temp file
    try {
      fs.unlinkSync(filepath);
    } catch {}

    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (!supabaseUrl || !supabaseKey) {
      // Dev convenience only (this checkout has no storage creds in .env.local).
      // Return the image inline as data URL so the Create draft flow can complete
      // with the user's actual logo. On Railway (dev branch deploy) the creds are
      // present, a real small Supabase URL is returned, and the rest of the code
      // path is identical. We never take this branch in production.
      console.warn("[api/upload] Supabase storage envs missing — using in-memory data: URL (local dev only). Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for real uploads.");
      const dataUrl = `data:${mimetype};base64,${buf.toString("base64")}`;
      return res.status(200).json({ url: dataUrl });
    }

    let supabase;
    try {
      supabase = getStorageClient();
    } catch (e) {
      console.error("[api/upload] storage env missing", e);
      return bad(res, 503, "Uploads are not configured");
    }

    const bucket = process.env.SUPABASE_BUCKET || "memebattles";

    // Defensive UUID generation across runtimes
    const uuid =
      (crypto && typeof crypto.randomUUID === "function" && crypto.randomUUID()) ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const name =
      kind === "avatar" && address
        ? `avatars/${chainId}/${address}/${uuid}.${ext}`
        : `logos/${chainId}/${uuid}.${ext}`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(name, buf, {
      contentType: mimetype,
      upsert: true,
      cacheControl: kind === "avatar" ? "60" : "3600",
    });

    if (upErr) return bad(res, 500, `Supabase upload failed: ${upErr.message}`);
>>>>>>> d570b66 (fix: make draft creation (logo upload + /drafts) robust for local dev without Supabase storage creds)

      const filepath = f.filepath || f.path;
      const mimetype = String(f.mimetype || "");
      if (!/^image\/(png|jpeg|jpg|webp)$/.test(mimetype)) {
        return bad(res, 400, "Unsupported image type. Use png/jpg/webp.");
      }

      const ext = pickExt(mimetype);
      if (!ext) return bad(res, 400, "Unsupported image type.");

      const bucket = process.env.SUPABASE_BUCKET || "memebattles";

      // Defensive UUID generation across runtimes
      const uuid =
        (crypto && typeof crypto.randomUUID === "function" && crypto.randomUUID()) ||
        `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const name =
        kind === "avatar" && address
          ? `avatars/${chainId}/${address}/${uuid}.${ext}`
          : `logos/${chainId}/${uuid}.${ext}`;

      const buf = fs.readFileSync(filepath);

      const { error: upErr } = await supabase.storage.from(bucket).upload(name, buf, {
        contentType: mimetype,
        upsert: true,
        cacheControl: kind === "avatar" ? "60" : "3600",
      });

      // best-effort cleanup of temp file
      try {
        fs.unlinkSync(filepath);
      } catch {}

      if (upErr) return bad(res, 500, `Supabase upload failed: ${upErr.message}`);

      const { data } = supabase.storage.from(bucket).getPublicUrl(name);
      if (!data?.publicUrl) return bad(res, 500, "Failed to produce public URL");

      return res.status(200).json({ url: data.publicUrl });
    } catch (e) {
      console.error("[api/upload]", e);
      return bad(res, 500, "Server error");
    }
  });
}
