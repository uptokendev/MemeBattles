import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { EVIDENCE_MAX_BYTES } from "./abuseReports.js";

export const ABUSE_EVIDENCE_BUCKET = "abuse-evidence-private";

const SIGNATURES = [
  { mime: "image/jpeg", ext: "jpg", test: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  { mime: "image/png", ext: "png", test: (buf) => buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: "webp", test: (buf) => buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP" },
  { mime: "application/pdf", ext: "pdf", test: (buf) => buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-" },
];

const DECLARED_MIME = new Map([
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/png", "image/png"],
  ["image/webp", "image/webp"],
  ["application/pdf", "application/pdf"],
]);

export function detectEvidenceType(buffer, declaredMime = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  if (buffer.length > EVIDENCE_MAX_BYTES) return null;
  const detected = SIGNATURES.find((entry) => entry.test(buffer));
  if (!detected) return null;
  const declared = DECLARED_MIME.get(String(declaredMime || "").trim().toLowerCase());
  if (declared && declared !== detected.mime) return null;
  return detected;
}

export function safeEvidenceFilename(name, ext) {
  const base = String(name || "evidence")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const cleaned = base || "evidence";
  return cleaned.toLowerCase().endsWith(`.${ext}`) ? cleaned : `${cleaned}.${ext}`;
}

export function evidenceObjectPath(reportId, ext) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `abuse/${year}/${month}/${reportId}/${crypto.randomUUID()}.${ext}`;
}

function bucketName() {
  return String(process.env.ABUSE_EVIDENCE_BUCKET || ABUSE_EVIDENCE_BUCKET).trim() || ABUSE_EVIDENCE_BUCKET;
}

function getStorageClient() {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    throw new Error("Supabase upload storage env is missing");
  }
  return createClient(url, key);
}

export async function storePrivateEvidence({ buffer, mimeType, reportId, ext }) {
  const client = getStorageClient();
  const bucket = bucketName();
  const path = evidenceObjectPath(reportId, ext);

  const existing = await client.storage.getBucket(bucket);
  if (existing.error) {
    const created = await client.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: EVIDENCE_MAX_BYTES,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    });
    if (created.error && !/already exists/i.test(String(created.error.message || ""))) {
      throw new Error(created.error.message || "Could not create private evidence bucket");
    }
  }

  const uploaded = await client.storage.from(bucket).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
    cacheControl: "private, max-age=0, no-store",
  });
  if (uploaded.error) {
    throw new Error(uploaded.error.message || "Evidence upload failed");
  }

  return { bucket, path };
}

export async function createEvidenceSignedUrl(storagePath, expiresIn = 60) {
  const client = getStorageClient();
  const signed = await client.storage.from(bucketName()).createSignedUrl(storagePath, expiresIn);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(signed.error?.message || "Could not create evidence link");
  }
  return signed.data.signedUrl;
}
