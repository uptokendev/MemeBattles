import assert from "node:assert/strict";
import test from "node:test";

import {
  ABUSE_CODES,
  ABUSE_PERMISSIONS,
  abuseForbiddenBody,
  abuseUnauthorizedBody,
  capabilitiesFromPermissions,
  createAbuseAuth,
  hasAbuseCapability,
  isLeakFreeAuthBody,
  normalizeAbusePermission,
} from "./abuseAuth.js";

test("normalizes short and fully-qualified abuse permissions", () => {
  assert.equal(normalizeAbusePermission("view"), ABUSE_PERMISSIONS.VIEW);
  assert.equal(normalizeAbusePermission("abuse.admin"), ABUSE_PERMISSIONS.ADMIN);
  assert.equal(normalizeAbusePermission("tickets.view"), "");
  assert.equal(normalizeAbusePermission(""), "");
});

test("hierarchy: higher grants satisfy lower capabilities", () => {
  assert.equal(hasAbuseCapability(["abuse.admin"], "abuse.view"), true);
  assert.equal(hasAbuseCapability(["abuse.manage"], "abuse.reply"), true);
  assert.equal(hasAbuseCapability(["abuse.reply"], "abuse.view"), true);
  assert.equal(hasAbuseCapability(["abuse.view"], "abuse.reply"), false);
  assert.equal(hasAbuseCapability(["abuse.view"], "abuse.admin"), false);
  assert.equal(hasAbuseCapability([], "abuse.view"), false);

  assert.deepEqual(capabilitiesFromPermissions(["abuse.reply"]), {
    view: true,
    reply: true,
    manage: false,
    admin: false,
  });
  assert.deepEqual(capabilitiesFromPermissions(["abuse.admin"]), {
    view: true,
    reply: true,
    manage: true,
    admin: true,
  });
});

test("auth failure bodies are leak-free", () => {
  assert.equal(isLeakFreeAuthBody(abuseForbiddenBody()), true);
  assert.equal(isLeakFreeAuthBody(abuseUnauthorizedBody()), true);
  assert.equal(isLeakFreeAuthBody({ ok: false, error: "Forbidden", code: ABUSE_CODES.FORBIDDEN, reports: [] }), false);
  assert.equal(isLeakFreeAuthBody({ ok: false, error: "Forbidden", code: "ABUSE_FORBIDDEN", count: 1 }), false);
  assert.equal(isLeakFreeAuthBody({ ok: false, error: "you lack abuse.view", code: ABUSE_CODES.FORBIDDEN }), false);
});

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

function mockPool(grantsByEmployee = new Map(), { failLookup = false } = {}) {
  const audits = [];
  return {
    audits,
    async query(sql, params = []) {
      if (failLookup && String(sql).includes("from public.employee_permissions")) {
        throw new Error("permission table missing");
      }
      if (String(sql).includes("from public.employee_permissions")) {
        const rows = (grantsByEmployee.get(params[0]) || []).map((permission) => ({ permission }));
        return { rows };
      }
      if (String(sql).includes("insert into public.abuse_audit_events")) {
        audits.push({
          eventType: params[0],
          actorType: params[1],
          actorId: params[2],
          actorEmail: params[3],
          metadata: JSON.parse(params[8] || "{}"),
        });
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in abuseAuth test: ${sql}`);
    },
  };
}

test("legacy-open enforce flags do not authorize abuse routes", async () => {
  const previous = process.env.API_AUTH_ENFORCE_SECURITY_MUTATIONS;
  process.env.API_AUTH_ENFORCE_SECURITY_MUTATIONS = "0";
  try {
    const db = mockPool();
    const auth = createAbuseAuth({
      pool: db,
      requireDashboardAdmin: async () => {
        throw new Error("should not reach supabase");
      },
    });
    const res = mockRes();
    const actor = await auth.requireAbusePermission({ headers: {}, method: "GET", url: "/api/admin/abuse/reports" }, res, "view");
    assert.equal(actor, null);
    assert.equal(res.statusCode, 401);
    assert.equal(isLeakFreeAuthBody(res.body), true);
  } finally {
    if (previous === undefined) delete process.env.API_AUTH_ENFORCE_SECURITY_MUTATIONS;
    else process.env.API_AUTH_ENFORCE_SECURITY_MUTATIONS = previous;
  }
});

test("no bearer returns leak-free 401", async () => {
  const db = mockPool();
  const auth = createAbuseAuth({
    pool: db,
    requireDashboardAdmin: async () => {
      throw new Error("should not reach supabase");
    },
  });
  const res = mockRes();
  const actor = await auth.requireAbusePermission({ headers: {}, method: "GET", url: "/api/admin/abuse/reports" }, res, "view");
  assert.equal(actor, null);
  assert.equal(res.statusCode, 401);
  assert.equal(isLeakFreeAuthBody(res.body), true);
  assert.equal(res.body.code, ABUSE_CODES.AUTH_REQUIRED);
});

test("ops key without bearer is 403, never authorized", async () => {
  const db = mockPool();
  const auth = createAbuseAuth({
    pool: db,
    requireDashboardAdmin: async () => ({ id: "admin-1", email: "ops@example.com" }),
  });
  const res = mockRes();
  const actor = await auth.requireAbusePermission(
    {
      headers: { "x-ops-key": "super-secret" },
      query: { opsKey: "super-secret" },
      method: "GET",
      url: "/api/admin/abuse/reports",
    },
    res,
    "view",
  );
  assert.equal(actor, null);
  assert.equal(res.statusCode, 403);
  assert.equal(isLeakFreeAuthBody(res.body), true);
  assert.equal(db.audits[0]?.eventType, "UNAUTHORIZED_ACCESS");
  assert.equal(Object.hasOwn(db.audits[0].metadata, "body"), false);
});

test("dashboard admin without abuse permission gets leak-free 403 and an audit row", async () => {
  const admin = { id: "11111111-1111-1111-1111-111111111111", email: "staff@example.com" };
  const db = mockPool(new Map([[admin.id, []]]));
  const auth = createAbuseAuth({
    pool: db,
    requireDashboardAdmin: async () => admin,
  });
  const res = mockRes();
  const actor = await auth.requireAbusePermission(
    {
      headers: { authorization: "Bearer valid-token" },
      method: "GET",
      url: "/api/admin/abuse/reports",
    },
    res,
    "abuse.view",
  );
  assert.equal(actor, null);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(Object.keys(res.body).sort(), ["code", "error", "ok"]);
  assert.equal(isLeakFreeAuthBody(res.body), true);
  assert.equal(JSON.stringify(res.body).includes("staff@example.com"), false);
  assert.equal(db.audits[0]?.eventType, "UNAUTHORIZED_ACCESS");
  assert.equal(db.audits[0]?.actorId, admin.id);
});

test("abuse.manage satisfies view", async () => {
  const admin = { id: "22222222-2222-2222-2222-222222222222", email: "manager@example.com" };
  const db = mockPool(new Map([[admin.id, ["abuse.manage"]]]));
  const auth = createAbuseAuth({
    pool: db,
    requireDashboardAdmin: async () => admin,
  });
  const res = mockRes();
  const actor = await auth.requireAbusePermission(
    {
      headers: { authorization: "Bearer valid-token" },
      method: "GET",
      url: "/api/admin/abuse/reports",
    },
    res,
    "view",
  );
  assert.ok(actor);
  assert.equal(actor.capabilities.view, true);
  assert.equal(actor.capabilities.manage, true);
  assert.equal(actor.capabilities.admin, false);
  assert.equal(res.headersSent, false);
});

test("permission lookup failure is 503 without report fields", async () => {
  const admin = { id: "33333333-3333-3333-3333-333333333333", email: "admin@example.com" };
  const db = mockPool(new Map(), { failLookup: true });
  const auth = createAbuseAuth({
    pool: db,
    requireDashboardAdmin: async () => admin,
  });
  const res = mockRes();
  const actor = await auth.requireAbusePermission(
    {
      headers: { authorization: "Bearer valid-token" },
      method: "GET",
      url: "/api/admin/abuse/reports",
    },
    res,
    "view",
  );
  assert.equal(actor, null);
  assert.equal(res.statusCode, 503);
  assert.equal(isLeakFreeAuthBody(res.body), true);
  assert.equal(res.body.code, ABUSE_CODES.UNAVAILABLE);
});
