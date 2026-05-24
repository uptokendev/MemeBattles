import { pool } from "../server/db.js";
import { badMethod, getQuery, json, readJson } from "../server/http.js";

const VALID_STATUSES = new Set([
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "paid",
  "scheduled",
  "active",
  "expired",
  "paused",
]);

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cleanText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeStatus(value, fallback = "submitted") {
  const status = String(value ?? "").trim().toLowerCase();
  return VALID_STATUSES.has(status) ? status : fallback;
}

function mapRow(row) {
  return {
    id: row.id,
    projectName: row.projectName,
    contactName: row.contactName,
    contactChannel: row.contactChannel,
    applicantWallet: row.applicantWallet,
    websiteUrl: row.websiteUrl,
    imageUrl: row.imageUrl,
    bio: row.bio,
    preferredSlot: row.preferredSlot,
    preferredStart: row.preferredStart,
    preferredEnd: row.preferredEnd,
    paymentReference: row.paymentReference,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listApplications(req, res) {
  const q = getQuery(req);
  const status = String(q.status || "all").trim().toLowerCase();
  const limit = clamp(toInt(q.limit, 50), 1, 200);

  const values = [];
  let where = "";
  if (status && status !== "all" && VALID_STATUSES.has(status)) {
    values.push(status);
    where = `WHERE sa.status = $${values.length}`;
  }
  values.push(limit);

  const result = await pool.query(
    `SELECT
       sa.id,
       sa.project_name AS "projectName",
       sa.contact_name AS "contactName",
       sa.contact_channel AS "contactChannel",
       sa.applicant_wallet AS "applicantWallet",
       sa.website_url AS "websiteUrl",
       sa.image_url AS "imageUrl",
       sa.bio,
       sa.preferred_slot AS "preferredSlot",
       sa.preferred_start AS "preferredStart",
       sa.preferred_end AS "preferredEnd",
       sa.payment_reference AS "paymentReference",
       sa.notes,
       sa.status,
       sa.created_at AS "createdAt",
       sa.updated_at AS "updatedAt"
     FROM sponsorship_applications sa
     ${where}
     ORDER BY sa.created_at DESC
     LIMIT $${values.length}`,
    values,
  );

  return json(res, 200, {
    items: result.rows.map(mapRow),
    updatedAt: new Date().toISOString(),
  });
}

async function createApplication(req, res) {
  const body = await readJson(req);

  const projectName = cleanText(body.projectName, 120);
  const contactName = cleanText(body.contactName, 120);
  const contactChannel = cleanText(body.contactChannel, 160);
  const applicantWallet = cleanText(body.applicantWallet, 160);
  const websiteUrl = cleanText(body.websiteUrl, 500);
  const imageUrl = cleanText(body.imageUrl, 500);
  const bio = cleanText(body.bio, 500);
  const preferredSlot = cleanText(body.preferredSlot, 80) || "homepage-sponsored-rail";
  const preferredStart = normalizeDate(body.preferredStart);
  const preferredEnd = normalizeDate(body.preferredEnd);
  const paymentReference = cleanText(body.paymentReference, 160);
  const notes = cleanText(body.notes, 1000);
  const status = normalizeStatus(body.status, "submitted");

  if (!projectName || !contactName || !contactChannel || !websiteUrl || !bio) {
    return json(res, 400, { error: "projectName, contactName, contactChannel, websiteUrl, and bio are required" });
  }

  const result = await pool.query(
    `INSERT INTO sponsorship_applications (
       project_name,
       contact_name,
       contact_channel,
       applicant_wallet,
       website_url,
       image_url,
       bio,
       preferred_slot,
       preferred_start,
       preferred_end,
       payment_reference,
       notes,
       status
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
     )
     RETURNING
       id,
       project_name AS "projectName",
       contact_name AS "contactName",
       contact_channel AS "contactChannel",
       applicant_wallet AS "applicantWallet",
       website_url AS "websiteUrl",
       image_url AS "imageUrl",
       bio,
       preferred_slot AS "preferredSlot",
       preferred_start AS "preferredStart",
       preferred_end AS "preferredEnd",
       payment_reference AS "paymentReference",
       notes,
       status,
       created_at AS "createdAt",
       updated_at AS "updatedAt"`,
    [
      projectName,
      contactName,
      contactChannel,
      applicantWallet || null,
      websiteUrl,
      imageUrl || null,
      bio,
      preferredSlot,
      preferredStart,
      preferredEnd,
      paymentReference || null,
      notes || null,
      status,
    ],
  );

  return json(res, 201, {
    item: mapRow(result.rows[0]),
    updatedAt: new Date().toISOString(),
  });
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") return await listApplications(req, res);
    if (req.method === "POST") return await createApplication(req, res);
    return badMethod(res);
  } catch (error) {
    console.error("[api/sponsorship-applications] request failed", error);
    return json(res, 503, {
      error: "Sponsorship application storage is unavailable",
      detail: String(error?.message || error || "unknown error"),
    });
  }
}
