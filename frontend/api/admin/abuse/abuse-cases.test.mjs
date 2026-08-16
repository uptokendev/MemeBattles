import assert from "node:assert/strict";
import test from "node:test";

import { isLeakFreeAuthBody } from "../../lib/abuseAuth.js";
import { createAbuseAdminHandlers } from "./handlers.js";

const VIEWER = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "viewer@example.com" };
const REPLIER = { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", email: "replier@example.com" };
const MANAGER = { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", email: "manager@example.com" };

function mockRes() {
  return {
    headersSent: false,
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
}

function createPool() {
  const grants = [];
  const reports = [];
  const messages = [];
  const events = [];
  const evidence = [];

  return {
    grants,
    reports,
    messages,
    events,
    seedGrant(employee, permission) {
      grants.push({
        employee_id: employee.id,
        employee_email: employee.email,
        permission,
        revoked_at: null,
        granted_at: new Date(),
      });
    },
    seedReport(overrides = {}) {
      const row = {
        id: `rep-${reports.length + 1}`,
        public_reference: overrides.public_reference || "MWZ-AB-000001",
        reporter_wallet: "0xabc",
        reporter_chain: 97,
        reporter_email: "reporter@example.com",
        category: "impersonation",
        subject: "Someone is impersonating me",
        description: "Cloned my profile on a fake official page.",
        reported_entity_type: "profile",
        reported_wallet: "0xdef",
        reported_profile_id: null,
        reported_campaign_address: null,
        reported_token_address: null,
        reported_url: "https://example.com",
        status: "OPEN",
        priority: "NORMAL",
        assigned_admin_id: null,
        assigned_admin_email: null,
        created_at: new Date(),
        updated_at: new Date(),
        resolved_at: null,
        closed_at: null,
        ...overrides,
      };
      reports.push(row);
      return row;
    },
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes("insert into public.abuse_audit_events")) return { rows: [] };
      if (text.includes("from public.employee_permissions") && text.includes("select permission")) {
        return { rows: grants.filter((row) => row.employee_id === params[0] && !row.revoked_at).map((row) => ({ permission: row.permission })) };
      }
      if (text.includes("from public.employee_permissions") && text.includes("order by employee_email")) {
        return { rows: grants.filter((row) => !row.revoked_at) };
      }
      if (text.includes("from public.abuse_reports") && text.includes("public_reference")) {
        const row = reports.find((item) => item.public_reference === params[0]);
        return { rows: row ? [{ ...row }] : [] };
      }
      if (text.includes("from public.abuse_reports")) {
        return { rows: reports.map((row) => ({ ...row })) };
      }
      if (text.includes("from public.abuse_report_messages")) {
        return { rows: messages.filter((row) => row.report_id === params[0]) };
      }
      if (text.includes("from public.abuse_report_evidence")) {
        return { rows: evidence.filter((row) => row.report_id === params[0]) };
      }
      if (text.includes("insert into public.abuse_report_messages")) {
        const row = {
          id: `msg-${messages.length + 1}`,
          report_id: params[0],
          sender_type: "admin",
          sender_admin_id: params[1],
          message: params[2],
          visibility: params[3],
          created_at: new Date(),
        };
        messages.push(row);
        return { rows: [row] };
      }
      if (text.includes("insert into public.abuse_report_events")) {
        events.push({ eventType: params[1], visibility: params[4] });
        return { rows: [] };
      }
      if (text.includes("update public.abuse_reports") && text.includes("status")) {
        const row = reports.find((item) => item.id === params[0]);
        if (row) {
          row.status = params[1];
          if (String(sql).includes("resolved_at = now()")) row.resolved_at = new Date();
        }
        return { rows: [] };
      }
      if (text.includes("update public.abuse_reports") && text.includes("priority")) {
        const row = reports.find((item) => item.id === params[0]);
        if (row) row.priority = params[1];
        return { rows: [] };
      }
      if (text.includes("update public.abuse_reports") && text.includes("assigned_admin_id")) {
        const row = reports.find((item) => item.id === params[0]);
        if (row) row.assigned_admin_id = params[1];
        return { rows: [] };
      }
      if (text.includes("update public.abuse_reports")) return { rows: [] };
      throw new Error(`Unexpected SQL in case test: ${text}`);
    },
  };
}

function handlersFor(pool, admin) {
  return createAbuseAdminHandlers({
    pool,
    requireDashboardAdmin: async () => admin,
  });
}

function req(path, { method = "GET", body } = {}) {
  return {
    method,
    url: path,
    originalUrl: path,
    headers: { authorization: "Bearer token" },
    body,
    query: {},
  };
}

test("viewer can open a case including internal notes, but cannot reply", async () => {
  const pool = createPool();
  pool.seedGrant(VIEWER, "abuse.view");
  pool.seedReport();
  const handlers = handlersFor(pool, VIEWER);

  const list = mockRes();
  await handlers.reports(req("/api/admin/abuse/reports"), list);
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.reports[0].id, "MWZ-AB-000001");
  assert.equal(list.body.reports[0].reporterEmail, "reporter@example.com");

  const detail = mockRes();
  await handlers.reports(req("/api/admin/abuse/reports/MWZ-AB-000001"), detail);
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.body.report.description.includes("Cloned"), true);

  const reply = mockRes();
  await handlers.reports(req("/api/admin/abuse/reports/MWZ-AB-000001/reply", {
    method: "POST",
    body: { message: "We are reviewing this." },
  }), reply);
  assert.equal(reply.statusCode, 403);
  assert.equal(isLeakFreeAuthBody(reply.body), true);
});

test("reply is reporter-visible and internal notes stay marked internal", async () => {
  const pool = createPool();
  pool.seedGrant(REPLIER, "abuse.reply");
  pool.seedGrant(MANAGER, "abuse.manage");
  pool.seedReport();

  const replyHandlers = handlersFor(pool, REPLIER);
  const replyRes = mockRes();
  await replyHandlers.reports(req("/api/admin/abuse/reports/MWZ-AB-000001/reply", {
    method: "POST",
    body: { message: "Can you provide the original X account?" },
  }), replyRes);
  assert.equal(replyRes.statusCode, 200);
  assert.equal(replyRes.body.message.visibility, "reporter");

  const noteRes = mockRes();
  await replyHandlers.reports(req("/api/admin/abuse/reports/MWZ-AB-000001/internal-note", {
    method: "POST",
    body: { message: "Wallet also matches cluster ABC." },
  }), noteRes);
  assert.equal(noteRes.statusCode, 403);

  const manageHandlers = handlersFor(pool, MANAGER);
  const manageNote = mockRes();
  await manageHandlers.reports(req("/api/admin/abuse/reports/MWZ-AB-000001/internal-note", {
    method: "POST",
    body: { message: "Wallet also matches cluster ABC." },
  }), manageNote);
  assert.equal(manageNote.statusCode, 200);
  assert.equal(manageNote.body.message.visibility, "internal");

  const detail = mockRes();
  await manageHandlers.reports(req("/api/admin/abuse/reports/MWZ-AB-000001"), detail);
  const vis = detail.body.report.messages.map((item) => item.visibility).sort();
  assert.deepEqual(vis, ["internal", "reporter"]);
});

test("manager can change status, priority and assignment", async () => {
  const pool = createPool();
  pool.seedGrant(MANAGER, "abuse.manage");
  pool.seedReport();
  const handlers = handlersFor(pool, MANAGER);

  const statusRes = mockRes();
  await handlers.reports(req("/api/admin/abuse/reports/MWZ-AB-000001/status", {
    method: "PATCH",
    body: { status: "RESOLVED" },
  }), statusRes);
  assert.equal(statusRes.statusCode, 200);
  assert.equal(statusRes.body.status, "RESOLVED");

  const priorityRes = mockRes();
  await handlers.reports(req("/api/admin/abuse/reports/MWZ-AB-000001/priority", {
    method: "PATCH",
    body: { priority: "HIGH" },
  }), priorityRes);
  assert.equal(priorityRes.statusCode, 200);
  assert.equal(priorityRes.body.priority, "HIGH");

  const assignRes = mockRes();
  await handlers.reports(req("/api/admin/abuse/reports/MWZ-AB-000001/assignment", {
    method: "PATCH",
    body: { assignedAdminId: MANAGER.id },
  }), assignRes);
  assert.equal(assignRes.statusCode, 200);
  assert.equal(assignRes.body.assignedAdminId, MANAGER.id);
});
