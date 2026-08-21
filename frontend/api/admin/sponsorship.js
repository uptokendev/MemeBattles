/**
 * Authenticated sponsorship admin API.
 * Browser roles cannot mutate sponsorship tables; this route uses the backend pool.
 */
import { pool } from "../../server/db.js";
import { getQuery, json, readJson } from "../../server/http.js";
import { requireAdminOrOps } from "../lib/apiAuth.js";

const APP_STATUSES = new Set([
  "submitted", "under_review", "approved", "rejected", "paid",
  "scheduled", "active", "expired", "paused",
]);
const PAYMENT_STATUSES = new Set(["pending", "invoice_sent", "paid", "verified", "refunded", "waived"]);

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function requireAdmin(req, res) {
  return requireAdminOrOps(req, res, { routeLabel: "admin/sponsorship", allowOps: true });
}

async function listApplications(req, res) {
  const q = getQuery(req);
  const status = String(q.status || "").trim().toLowerCase();
  const values = [];
  let where = "";
  if (APP_STATUSES.has(status)) {
    values.push(status);
    where = `where status = $1`;
  }
  const result = await pool.query(
    `select * from public.sponsorship_applications ${where} order by created_at desc limit 200`,
    values,
  );
  return json(res, 200, { items: result.rows, updatedAt: new Date().toISOString() });
}

async function patchApplication(req, res) {
  const body = await readJson(req);
  const id = clean(body.id || body.applicationId, 80);
  if (!id) return json(res, 400, { error: "id is required" });
  const status = body.status != null ? String(body.status).trim().toLowerCase() : null;
  if (status && !APP_STATUSES.has(status)) return json(res, 400, { error: "invalid status" });
  const notes = body.notes != null ? clean(body.notes, 1000) : null;
  const paymentReference = body.paymentReference != null ? clean(body.paymentReference, 160) : null;
  const result = await pool.query(
    `update public.sponsorship_applications
        set status = coalesce($2, status),
            notes = coalesce($3, notes),
            payment_reference = coalesce($4, payment_reference),
            approved_at = case when $2 = 'approved' then now() else approved_at end,
            paid_at = case when $2 = 'paid' then now() else paid_at end,
            updated_at = now()
      where id = $1::uuid
      returning *`,
    [id, status, notes, paymentReference],
  );
  if (!result.rows[0]) return json(res, 404, { error: "application not found" });
  return json(res, 200, { item: result.rows[0] });
}

async function listPlacements(req, res) {
  const result = await pool.query(
    `select * from public.sponsored_placements order by created_at desc limit 200`,
  );
  return json(res, 200, { items: result.rows });
}

async function upsertPlacement(req, res) {
  const body = await readJson(req);
  const id = clean(body.id, 80) || null;
  const projectName = clean(body.projectName, 120);
  const bio = clean(body.bio, 500);
  const websiteUrl = clean(body.websiteUrl, 500);
  if (!projectName || !bio || !websiteUrl) {
    return json(res, 400, { error: "projectName, bio, and websiteUrl are required" });
  }
  const paymentStatus = String(body.paymentStatus || "pending").trim().toLowerCase();
  if (!PAYMENT_STATUSES.has(paymentStatus)) return json(res, 400, { error: "invalid paymentStatus" });
  const values = [
    id,
    body.applicationId || null,
    Number(body.chainId || 97),
    clean(body.campaignAddress, 160) || null,
    clean(body.tokenAddress, 160) || null,
    clean(body.creatorAddress, 160) || null,
    projectName,
    clean(body.symbol, 24) || null,
    clean(body.imageUrl, 2000) || null,
    bio,
    websiteUrl,
    clean(body.targetUrl, 500) || websiteUrl,
    clean(body.projectType, 24) || "external",
    clean(body.placementLabel, 80) || "Homepage rail",
    clean(body.slotCode, 80) || "homepage-sponsored-rail",
    Number(body.priority || 1000),
    Boolean(body.active),
    paymentStatus,
    iso(body.startsAt),
    iso(body.endsAt),
    clean(body.adminNotes, 1000) || null,
  ];
  const result = await pool.query(
    `insert into public.sponsored_placements (
       id, application_id, chain_id, campaign_address, token_address, creator_address,
       project_name, symbol, image_url, bio, website_url, target_url, project_type,
       placement_label, slot_code, priority, active, payment_status, starts_at, ends_at, admin_notes
     ) values (
       coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18, $19, $20, $21
     )
     on conflict (id) do update set
       application_id = excluded.application_id,
       chain_id = excluded.chain_id,
       campaign_address = excluded.campaign_address,
       token_address = excluded.token_address,
       creator_address = excluded.creator_address,
       project_name = excluded.project_name,
       symbol = excluded.symbol,
       image_url = excluded.image_url,
       bio = excluded.bio,
       website_url = excluded.website_url,
       target_url = excluded.target_url,
       project_type = excluded.project_type,
       placement_label = excluded.placement_label,
       slot_code = excluded.slot_code,
       priority = excluded.priority,
       active = excluded.active,
       payment_status = excluded.payment_status,
       starts_at = excluded.starts_at,
       ends_at = excluded.ends_at,
       admin_notes = excluded.admin_notes,
       paused_at = case when excluded.active then null else now() end,
       updated_at = now()
     returning *`,
    values,
  );
  return json(res, 200, { item: result.rows[0] });
}

async function deletePlacement(req, res) {
  const body = await readJson(req);
  const id = clean(body.id, 80);
  if (!id) return json(res, 400, { error: "id is required" });
  const result = await pool.query(
    `delete from public.sponsored_placements where id = $1::uuid returning id`,
    [id],
  );
  if (!result.rows[0]) return json(res, 404, { error: "placement not found" });
  return json(res, 200, { ok: true, id });
}

export default async function handler(req, res) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (!pool) return json(res, 503, { error: "Database unavailable" });
    const q = getQuery(req);
    const resource = String(q.resource || "applications").trim().toLowerCase();
    if (resource === "applications") {
      if (req.method === "GET") return listApplications(req, res);
      if (req.method === "PATCH" || req.method === "POST") return patchApplication(req, res);
    }
    if (resource === "placements") {
      if (req.method === "GET") return listPlacements(req, res);
      if (req.method === "PUT" || req.method === "POST") return upsertPlacement(req, res);
      if (req.method === "DELETE") return deletePlacement(req, res);
    }
    return json(res, 400, { error: "Unknown resource. Use applications or placements." });
  } catch (error) {
    console.error("[admin/sponsorship]", error);
    return json(res, 503, { error: "Sponsorship admin API unavailable", detail: String(error?.message || error) });
  }
}


