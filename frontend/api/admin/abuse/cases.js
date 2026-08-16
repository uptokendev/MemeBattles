import { getQuery, readJson } from "../../../server/http.js";
import { ABUSE_PERMISSIONS } from "../../lib/abuseAuth.js";
import {
  ABUSE_STATUSES,
  MESSAGE_MAX,
  adminSafeReport,
  clampText,
  normalizePriority,
  normalizePublicReference,
  normalizeStatus,
  writeReportEvent,
} from "../../lib/abuseReports.js";
import { createEvidenceSignedUrl } from "../../lib/abuseEvidence.js";

function methodNotAllowed(res) {
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

function requestPath(req) {
  return String(req.originalUrl || req.url || req.path || "").split("?")[0];
}

function pathParts(req) {
  return requestPath(req).replace(/^\/api\/admin\/abuse\/?/, "").split("/").filter(Boolean);
}

const LIST_SQL = `
  select r.*,
         (
           select p.employee_email
             from public.employee_permissions p
            where p.employee_id = r.assigned_admin_id
              and p.revoked_at is null
            order by p.granted_at desc
            limit 1
         ) as assigned_admin_email
    from public.abuse_reports r
`;

async function loadReportByReference(db, reference) {
  const { rows } = await db.query(`${LIST_SQL} where r.public_reference = $1 limit 1`, [reference]);
  return rows[0] || null;
}

export function createAbuseCaseHandlers({ pool, auth }) {
  async function listReports(req, res) {
    const query = { ...getQuery(req), ...(req.query || {}) };
    const status = normalizeStatus(query.status);
    const category = String(query.category || "").trim().toLowerCase();
    const priority = normalizePriority(query.priority);
    const assigned = String(query.assigned || query.assignedAdminId || "").trim();
    const unassigned = ["1", "true", "yes"].includes(String(query.unassigned || "").trim().toLowerCase());
    const search = String(query.q || query.search || "").trim();

    const where = [];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      where.push(sql.replace("?", `$${params.length}`));
    };

    if (status) add("r.status = ?", status);
    if (category) add("r.category = ?", category);
    if (priority) add("r.priority = ?", priority);
    if (unassigned) where.push("r.assigned_admin_id is null");
    else if (assigned) add("r.assigned_admin_id = ?", assigned);
    if (search) {
      params.push(`%${search}%`);
      const idx = `$${params.length}`;
      where.push(`(
        r.public_reference ilike ${idx}
        or r.reporter_wallet ilike ${idx}
        or r.reporter_email ilike ${idx}
        or r.reported_wallet ilike ${idx}
        or coalesce(r.reported_campaign_address, '') ilike ${idx}
        or coalesce(r.reported_token_address, '') ilike ${idx}
        or coalesce(r.reported_profile_id, '') ilike ${idx}
        or coalesce(r.subject, '') ilike ${idx}
      )`);
    }

    const sql = `${LIST_SQL}
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by r.updated_at desc, r.created_at desc
      limit 200`;
    const { rows } = await pool.query(sql, params);
    return res.status(200).json({ ok: true, reports: rows.map((row) => adminSafeReport(row)) });
  }

  async function getReport(res, reference) {
    const report = await loadReportByReference(pool, reference);
    if (!report) return res.status(404).json({ ok: false, error: "Report not found." });
    const messages = await pool.query(
      `select id, sender_type, sender_admin_id, message, visibility, created_at
         from public.abuse_report_messages
        where report_id = $1
        order by created_at asc`,
      [report.id],
    );
    const evidence = await pool.query(
      `select id, message_id, original_filename, mime_type, size_bytes, created_at
         from public.abuse_report_evidence
        where report_id = $1
        order by created_at asc`,
      [report.id],
    );
    return res.status(200).json({
      ok: true,
      report: adminSafeReport(report, {
        includeDescription: true,
        messages: messages.rows,
        evidence: evidence.rows,
      }),
    });
  }

  async function addMessage(req, res, actor, reference, { visibility, eventType }) {
    const report = await loadReportByReference(pool, reference);
    if (!report) return res.status(404).json({ ok: false, error: "Report not found." });
    const body = await readJson(req);
    const message = clampText(body.message, MESSAGE_MAX);
    if (message.length < 2) return res.status(400).json({ ok: false, error: "Message is required." });

    const inserted = await pool.query(
      `insert into public.abuse_report_messages
         (report_id, sender_type, sender_admin_id, message, visibility)
       values ($1, 'admin', $2, $3, $4)
       returning id, sender_type, sender_admin_id, message, visibility, created_at`,
      [report.id, actor.id, message, visibility],
    );

    let nextStatus = report.status;
    if (visibility === "reporter" && report.status === ABUSE_STATUSES.OPEN) {
      nextStatus = ABUSE_STATUSES.UNDER_REVIEW;
      await pool.query(
        `update public.abuse_reports
            set status = $2, updated_at = now()
          where id = $1`,
        [report.id, nextStatus],
      );
    } else {
      await pool.query(`update public.abuse_reports set updated_at = now() where id = $1`, [report.id]);
    }

    await writeReportEvent(pool, {
      reportId: report.id,
      eventType,
      actorType: "admin",
      actorId: actor.id,
      newValue: visibility,
    });

    return res.status(200).json({
      ok: true,
      status: nextStatus,
      message: {
        id: String(inserted.rows[0].id),
        senderType: "admin",
        visibility,
        message,
        createdAt: inserted.rows[0].created_at,
      },
    });
  }

  async function patchStatus(req, res, actor, reference) {
    const report = await loadReportByReference(pool, reference);
    if (!report) return res.status(404).json({ ok: false, error: "Report not found." });
    const body = await readJson(req);
    const status = normalizeStatus(body.status);
    if (!status) return res.status(400).json({ ok: false, error: "A valid status is required." });
    if (status === report.status) return res.status(200).json({ ok: true, status, unchanged: true });

    const resolvedAt = status === ABUSE_STATUSES.RESOLVED ? "now()" : "null";
    const closedAt = status === ABUSE_STATUSES.CLOSED ? "now()" : "null";
    await pool.query(
      `update public.abuse_reports
          set status = $2,
              updated_at = now(),
              resolved_at = ${resolvedAt},
              closed_at = ${closedAt}
        where id = $1`,
      [report.id, status],
    );

    const reopened = (report.status === ABUSE_STATUSES.RESOLVED || report.status === ABUSE_STATUSES.CLOSED)
      && status !== ABUSE_STATUSES.RESOLVED
      && status !== ABUSE_STATUSES.CLOSED;
    await writeReportEvent(pool, {
      reportId: report.id,
      eventType: reopened ? "REPORT_REOPENED" : status === ABUSE_STATUSES.RESOLVED ? "REPORT_RESOLVED" : status === ABUSE_STATUSES.CLOSED ? "REPORT_CLOSED" : "STATUS_CHANGED",
      actorType: "admin",
      actorId: actor.id,
      oldValue: report.status,
      newValue: status,
    });
    return res.status(200).json({ ok: true, status, previousStatus: report.status });
  }

  async function patchPriority(req, res, actor, reference) {
    const report = await loadReportByReference(pool, reference);
    if (!report) return res.status(404).json({ ok: false, error: "Report not found." });
    const body = await readJson(req);
    const priority = normalizePriority(body.priority);
    if (!priority) return res.status(400).json({ ok: false, error: "A valid priority is required." });
    await pool.query(
      `update public.abuse_reports
          set priority = $2, updated_at = now()
        where id = $1`,
      [report.id, priority],
    );
    await writeReportEvent(pool, {
      reportId: report.id,
      eventType: "PRIORITY_CHANGED",
      actorType: "admin",
      actorId: actor.id,
      oldValue: report.priority,
      newValue: priority,
    });
    return res.status(200).json({ ok: true, priority });
  }

  async function patchAssignment(req, res, actor, reference) {
    const report = await loadReportByReference(pool, reference);
    if (!report) return res.status(404).json({ ok: false, error: "Report not found." });
    const body = await readJson(req);
    const raw = body.assignedAdminId ?? body.assigned_admin_id;
    const assignedAdminId = raw == null || raw === "" ? null : String(raw).trim();
    if (assignedAdminId && !/^[0-9a-f-]{36}$/i.test(assignedAdminId)) {
      return res.status(400).json({ ok: false, error: "assignedAdminId must be a user id or empty." });
    }
    await pool.query(
      `update public.abuse_reports
          set assigned_admin_id = $2, updated_at = now()
        where id = $1`,
      [report.id, assignedAdminId],
    );
    await writeReportEvent(pool, {
      reportId: report.id,
      eventType: report.assigned_admin_id ? "ADMIN_REASSIGNED" : "ADMIN_ASSIGNED",
      actorType: "admin",
      actorId: actor.id,
      oldValue: report.assigned_admin_id,
      newValue: assignedAdminId,
    });
    return res.status(200).json({ ok: true, assignedAdminId });
  }

  async function evidenceLink(req, res, actor, reference, evidenceId) {
    const report = await loadReportByReference(pool, reference);
    if (!report) return res.status(404).json({ ok: false, error: "Report not found." });
    const { rows } = await pool.query(
      `select storage_path
         from public.abuse_report_evidence
        where id = $1 and report_id = $2
        limit 1`,
      [evidenceId, report.id],
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: "Evidence not found." });
    const url = await createEvidenceSignedUrl(rows[0].storage_path, 60);
    await writeReportEvent(pool, {
      reportId: report.id,
      eventType: "EVIDENCE_VIEWED",
      actorType: "admin",
      actorId: actor.id,
      metadata: { evidenceId },
    });
    return res.status(200).json({ ok: true, url, expiresIn: 60 });
  }

  async function staff(req, res) {
    const actor = await auth.requireAbusePermission(req, res, ABUSE_PERMISSIONS.MANAGE);
    if (!actor) return;
    if (String(req.method || "").toUpperCase() !== "GET") return methodNotAllowed(res);
    const { rows } = await pool.query(
      `select employee_id, employee_email, permission
         from public.employee_permissions
        where revoked_at is null
        order by employee_email asc`,
    );
    const byId = new Map();
    for (const row of rows) {
      const id = String(row.employee_id);
      if (!byId.has(id)) {
        byId.set(id, { employeeId: id, employeeEmail: row.employee_email, permissions: [] });
      }
      byId.get(id).permissions.push(row.permission);
    }
    return res.status(200).json({ ok: true, staff: [...byId.values()] });
  }

  async function reports(req, res) {
    const method = String(req.method || "").toUpperCase();
    const parts = pathParts(req);
    const reference = normalizePublicReference(parts[1] || "");
    const action = parts[2] || "";
    const evidenceId = parts[3] || "";

    const required = action === "reply"
      ? ABUSE_PERMISSIONS.REPLY
      : action === "internal-note" || action === "status" || action === "priority" || action === "assignment"
        ? ABUSE_PERMISSIONS.MANAGE
        : ABUSE_PERMISSIONS.VIEW;

    const actor = await auth.requireAbusePermission(req, res, required);
    if (!actor) return;

    try {
      if (parts.length <= 1) {
        if (method !== "GET") return methodNotAllowed(res);
        return listReports(req, res);
      }
      if (!reference) return res.status(404).json({ ok: false, error: "Report not found." });

      if (action === "reply") {
        if (method !== "POST") return methodNotAllowed(res);
        return addMessage(req, res, actor, reference, { visibility: "reporter", eventType: "MESSAGE_SENT" });
      }
      if (action === "internal-note") {
        if (method !== "POST") return methodNotAllowed(res);
        return addMessage(req, res, actor, reference, { visibility: "internal", eventType: "INTERNAL_NOTE_ADDED" });
      }
      if (action === "status") {
        if (method !== "PATCH" && method !== "POST") return methodNotAllowed(res);
        return patchStatus(req, res, actor, reference);
      }
      if (action === "priority") {
        if (method !== "PATCH" && method !== "POST") return methodNotAllowed(res);
        return patchPriority(req, res, actor, reference);
      }
      if (action === "assignment") {
        if (method !== "PATCH" && method !== "POST") return methodNotAllowed(res);
        return patchAssignment(req, res, actor, reference);
      }
      if (action === "evidence" && evidenceId) {
        if (method !== "GET") return methodNotAllowed(res);
        return evidenceLink(req, res, actor, reference, evidenceId);
      }
      if (!action) {
        if (method !== "GET") return methodNotAllowed(res);
        return getReport(res, reference);
      }
      return res.status(404).json({ ok: false, error: "Report not found." });
    } catch (error) {
      if (error?.code === "42P01") {
        if (!res.headersSent) res.status(200).json({ ok: true, reports: [] });
        return;
      }
      console.error("[admin/abuse/reports]", error);
      if (!res.headersSent) res.status(500).json({ ok: false, error: "Could not process the abuse admin request." });
    }
  }

  return { reports, staff };
}
