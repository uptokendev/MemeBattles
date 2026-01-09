import { createClient } from "@supabase/supabase-js";
import formidable from "formidable";
import fs from "fs";

// Keep as-is; harmless unless interpreted Next-style
export const config = {
  api: { bodyParser: false },
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

  const maxBytes = kind === "avatar" ? 500 * 1024 : 2 * 1024 * 1024; // keep under Vercel body limits
  const form = formidable({
    multiples: false,
    maxFileSize: maxBytes,
    // optionally: uploadDir: "/tmp"  (formidable defaults to OS temp)
  });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) return bad(res, 400, `Upload parse failed: ${err.message}`);

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

      const bucket = process.env.SUPABASE_BUCKET || "upmeme";

      const name =
        kind === "avatar" && address
          ? `avatars/${chainId}/${address}.${ext}`
          : `logos/${chainId}/${crypto.randomUUID()}.${ext}`;

      const buf = fs.readFileSync(filepath);

      const { error: upErr } = await supabase.storage.from(bucket).upload(name, buf, {
        contentType: mimetype,
        upsert: true,
        cacheControl: "3600",
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
