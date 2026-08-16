import assert from "node:assert/strict";
import test from "node:test";

import { ABUSE_CODES, isLeakFreeAuthBody } from "../../lib/abuseAuth.js";
import { createAbuseAdminHandlers } from "./handlers.js";

const VIEWER = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "viewer@example.com" };
const ADMIN = { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", email: "abuse-admin@example.com" };
const STAFF = { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", email: "support@example.com" };
const TARGET = { id: "dddddddd-dddd-dddd-dddd-dddddddddddd", email: "new-staff@example.com" };

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

function createMemoryPool() {
  const grants = [];
  const audits = [];
  return {
    grants,
    audits,
    async query(sql, params = []) {
      const text = String(sql);

      if (text.includes("insert into public.abuse_audit_events")) {
        audits.push({
          eventType: params[0],
          actorType: params[1],
          actorId: params[2],
          actorEmail: params[3],
          subjectId: params[4],
          subjectEmail: params[5],
          oldValue: params[6],
          newValue: params[7],
          metadata: JSON.parse(params[8] || "{}"),
        });
        return { rows: [] };
      }

      if (text.includes("from public.abuse_reports")) {
        return { rows: [] };
      }

      if (text.includes("from public.employee_permissions") && text.includes("select permission")) {
        const rows = grants
          .filter((row) => row.employee_id === params[0] && !row.revoked_at)
          .map((row) => ({ permission: row.permission }));
        return { rows };
      }

      if (text.includes("from public.employee_permissions") && text.includes("order by granted_at")) {
        return {
          rows: grants.filter((row) => !row.revoked_at).map((row) => ({ ...row })),
        };
      }

      if (text.includes("from public.employee_permissions") && text.includes("limit 1")) {
        const row = grants.find((item) => (
          item.employee_id === params[0]
          && item.permission === params[1]
          && !item.revoked_at
        ));
        return { rows: row ? [{ ...row }] : [] };
      }

      if (text.includes("insert into public.employee_permissions")) {
        const row = {
          id: `grant-${grants.length + 1}`,
          employee_id: params[0],
          employee_email: params[1],
          permission: params[2],
          granted_by: params[3],
          granted_by_email: params[4],
          granted_at: new Date("2026-08-16T12:00:00.000Z"),
          revoked_at: null,
          revoke_reason: null,
        };
        grants.push(row);
        return { rows: [{ ...row }] };
      }

      if (text.includes("update public.employee_permissions")) {
        const row = grants.find((item) => (
          item.employee_id === params[0]
          && item.permission === params[1]
          && !item.revoked_at
        ));
        if (!row) return { rows: [] };
        row.revoked_at = new Date("2026-08-16T13:00:00.000Z");
        row.revoke_reason = params[2];
        return { rows: [{ id: row.id, employee_email: row.employee_email, permission: row.permission }] };
      }

      throw new Error(`Unexpected SQL in abuse-rbac test: ${text}`);
    },
  };
}

function seedGrant(pool, employee, permission) {
  pool.grants.push({
    id: `seed-${pool.grants.length + 1}`,
    employee_id: employee.id,
    employee_email: employee.email,
    permission,
    granted_by: ADMIN.id,
    granted_by_email: ADMIN.email,
    granted_at: new Date("2026-08-16T11:00:00.000Z"),
    revoked_at: null,
    revoke_reason: null,
  });
}

function createHandlers(pool, currentAdmin) {
  return createAbuseAdminHandlers({
    pool,
    requireDashboardAdmin: async (req, res) => {
      if (!String(req.headers?.authorization || "").startsWith("Bearer ")) {
        res.status(401).json({ ok: false, error: "Supabase access token required." });
        return null;
      }
      if (!currentAdmin) {
        res.status(403).json({ ok: false, error: "Dashboard administrator access required." });
        return null;
      }
      return currentAdmin;
    },
  });
}

function authed(path, method = "GET", body) {
  return {
    headers: { authorization: "Bearer valid-token" },
    method,
    url: path,
    originalUrl: path,
    body,
  };
}

test("unauthenticated /reports is leak-free 401", async () => {
  const pool = createMemoryPool();
  const handlers = createHandlers(pool, STAFF);
  const res = mockRes();
  await handlers.reports({ headers: {}, method: "GET", url: "/api/admin/abuse/reports" }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(isLeakFreeAuthBody(res.body), true);
});

test("normal support employee cannot see reports, counts, or emails", async () => {
  const pool = createMemoryPool();
  const handlers = createHandlers(pool, STAFF);
  const res = mockRes();
  await handlers.reports(authed("/api/admin/abuse/reports"), res);
  assert.equal(res.statusCode, 403);
  assert.equal(isLeakFreeAuthBody(res.body), true);
  assert.equal(JSON.stringify(res.body).includes("@"), false);
  assert.equal(Object.hasOwn(res.body, "reports"), false);
  assert.equal(pool.audits[0]?.eventType, "UNAUTHORIZED_ACCESS");
});

test("same support employee can read empty personal capabilities from /me", async () => {
  const pool = createMemoryPool();
  const handlers = createHandlers(pool, STAFF);
  const res = mockRes();
  await handlers.me(authed("/api/admin/abuse/me"), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.permissions, []);
  assert.deepEqual(res.body.capabilities, { view: false, reply: false, manage: false, admin: false });
  assert.equal(Object.hasOwn(res.body, "reports"), false);
});

test("ops-key only request is 403 on /reports", async () => {
  const pool = createMemoryPool();
  const handlers = createHandlers(pool, STAFF);
  const res = mockRes();
  await handlers.reports(
    {
      headers: { "x-ops-key": "DASHBOARD_OPS_KEY" },
      query: { opsKey: "DASHBOARD_OPS_KEY" },
      method: "GET",
      url: "/api/admin/abuse/reports",
    },
    res,
  );
  assert.equal(res.statusCode, 403);
  assert.equal(isLeakFreeAuthBody(res.body), true);
});

test("abuse.view can list the stub queue and cannot grant permissions", async () => {
  const pool = createMemoryPool();
  seedGrant(pool, VIEWER, "abuse.view");
  const handlers = createHandlers(pool, VIEWER);

  const listRes = mockRes();
  await handlers.reports(authed("/api/admin/abuse/reports"), listRes);
  assert.equal(listRes.statusCode, 200);
  assert.deepEqual(listRes.body, { ok: true, reports: [] });

  const grantRes = mockRes();
  await handlers.permissions(
    authed("/api/admin/abuse/permissions", "POST", {
      employeeId: TARGET.id,
      employeeEmail: TARGET.email,
      permission: "abuse.view",
    }),
    grantRes,
  );
  assert.equal(grantRes.statusCode, 403);
  assert.equal(isLeakFreeAuthBody(grantRes.body), true);
});

test("abuse.reply and abuse.manage satisfy view on the stub list", async () => {
  for (const permission of ["abuse.reply", "abuse.manage"]) {
    const pool = createMemoryPool();
    const actor = { id: VIEWER.id, email: `${permission}@example.com` };
    seedGrant(pool, actor, permission);
    const handlers = createHandlers(pool, actor);
    const res = mockRes();
    await handlers.reports(authed("/api/admin/abuse/reports"), res);
    assert.equal(res.statusCode, 200, permission);
    assert.deepEqual(res.body.reports, []);
  }
});

test("abuse.admin can grant and revoke, and both write audit rows", async () => {
  const pool = createMemoryPool();
  seedGrant(pool, ADMIN, "abuse.admin");
  const handlers = createHandlers(pool, ADMIN);

  const grantRes = mockRes();
  await handlers.permissions(
    authed("/api/admin/abuse/permissions", "POST", {
      employeeId: TARGET.id,
      employeeEmail: TARGET.email,
      permission: "abuse.view",
    }),
    grantRes,
  );
  assert.equal(grantRes.statusCode, 200);
  assert.equal(grantRes.body.alreadyGranted, false);
  assert.equal(grantRes.body.grant.permission, "abuse.view");
  assert.equal(pool.audits.at(-1)?.eventType, "PERMISSION_GRANTED");

  const listRes = mockRes();
  await handlers.permissions(authed("/api/admin/abuse/permissions"), listRes);
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.body.grants.some((grant) => grant.employeeId === TARGET.id), true);

  const revokeRes = mockRes();
  await handlers.permissions(
    authed("/api/admin/abuse/permissions/revoke", "POST", {
      employeeId: TARGET.id,
      permission: "abuse.view",
      reason: "no longer needed",
    }),
    revokeRes,
  );
  assert.equal(revokeRes.statusCode, 200);
  assert.equal(revokeRes.body.revoked, true);
  assert.equal(pool.audits.at(-1)?.eventType, "PERMISSION_REVOKED");
  assert.equal(pool.grants.find((row) => row.employee_id === TARGET.id).revoked_at != null, true);
});

test("revoked permission no longer authorizes /reports", async () => {
  const pool = createMemoryPool();
  seedGrant(pool, VIEWER, "abuse.view");
  pool.grants[0].revoked_at = new Date();
  const handlers = createHandlers(pool, VIEWER);
  const res = mockRes();
  await handlers.reports(authed("/api/admin/abuse/reports"), res);
  assert.equal(res.statusCode, 403);
  assert.equal(isLeakFreeAuthBody(res.body), true);
});

test("grant is idempotent and does not duplicate an active row", async () => {
  const pool = createMemoryPool();
  seedGrant(pool, ADMIN, "abuse.admin");
  seedGrant(pool, TARGET, "abuse.view");
  const handlers = createHandlers(pool, ADMIN);
  const res = mockRes();
  await handlers.permissions(
    authed("/api/admin/abuse/permissions", "POST", {
      employeeId: TARGET.id,
      employeeEmail: TARGET.email,
      permission: "abuse.view",
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.alreadyGranted, true);
  assert.equal(pool.grants.filter((row) => row.employee_id === TARGET.id && row.permission === "abuse.view").length, 1);
});
