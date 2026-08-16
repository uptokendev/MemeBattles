/**
 * Abuse-department authorization.
 * Isolated from requireAdminOrOps: no ops-key, no legacy-open, fail closed.
 */



export const ABUSE_PERMISSIONS = Object.freeze({
  VIEW: "abuse.view",
  REPLY: "abuse.reply",
  MANAGE: "abuse.manage",
  ADMIN: "abuse.admin",
});

export const ABUSE_PERMISSION_SET = new Set(Object.values(ABUSE_PERMISSIONS));

export const ABUSE_CODES = Object.freeze({
  AUTH_REQUIRED: "ABUSE_AUTH_REQUIRED",
  FORBIDDEN: "ABUSE_FORBIDDEN",
  UNAVAILABLE: "ABUSE_AUTH_UNAVAILABLE",
});

const PERMISSION_RANK = Object.freeze({
  [ABUSE_PERMISSIONS.VIEW]: 1,
  [ABUSE_PERMISSIONS.REPLY]: 2,
  [ABUSE_PERMISSIONS.MANAGE]: 3,
  [ABUSE_PERMISSIONS.ADMIN]: 4,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function abuseUnauthorizedBody() {
  return { ok: false, error: "Unauthorized", code: ABUSE_CODES.AUTH_REQUIRED };
}

export function abuseForbiddenBody() {
  return { ok: false, error: "Forbidden", code: ABUSE_CODES.FORBIDDEN };
}

export function abuseUnavailableBody() {
  return { ok: false, error: "Abuse authorization is unavailable.", code: ABUSE_CODES.UNAVAILABLE };
}

export function isLeakFreeAuthBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const keys = Object.keys(body).sort();
  if (keys.join(",") !== "code,error,ok") return false;
  if (body.ok !== false) return false;
  if (body.code === ABUSE_CODES.FORBIDDEN) return body.error === "Forbidden";
  if (body.code === ABUSE_CODES.AUTH_REQUIRED) return body.error === "Unauthorized";
  if (body.code === ABUSE_CODES.UNAVAILABLE) return typeof body.error === "string" && body.error.length > 0;
  return false;
}

export function normalizeAbusePermission(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (ABUSE_PERMISSION_SET.has(raw)) return raw;
  const prefixed = raw.startsWith("abuse.") ? raw : `abuse.${raw}`;
  return ABUSE_PERMISSION_SET.has(prefixed) ? prefixed : "";
}

export function capabilitiesFromPermissions(permissions) {
  const maxRank = (Array.isArray(permissions) ? permissions : []).reduce((max, permission) => {
    const rank = PERMISSION_RANK[normalizeAbusePermission(permission)] || 0;
    return rank > max ? rank : max;
  }, 0);
  return {
    view: maxRank >= 1,
    reply: maxRank >= 2,
    manage: maxRank >= 3,
    admin: maxRank >= 4,
  };
}

export function hasAbuseCapability(permissions, requiredPermission) {
  const required = normalizeAbusePermission(requiredPermission);
  if (!required) return false;
  const needed = PERMISSION_RANK[required] || 0;
  if (!needed) return false;
  return (Array.isArray(permissions) ? permissions : []).some((permission) => {
    const rank = PERMISSION_RANK[normalizeAbusePermission(permission)] || 0;
    return rank >= needed;
  });
}

export function isUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function readBearerToken(req) {
  const header = String(req.headers?.authorization || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function readOpsKey(req) {
  const query = req.query && typeof req.query === "object" ? req.query : {};
  return String(req.headers?.["x-ops-key"] || query.opsKey || "").trim();
}

function requestRoute(req) {
  return String(req.originalUrl || req.url || req.path || "").split("?")[0] || "";
}

export function createAbuseAuth({
  requireDashboardAdmin: requireAdmin,
  pool: db,
} = {}) {
  if (!db || typeof db.query !== "function") {
    throw new Error("createAbuseAuth requires a Postgres pool");
  }
  if (typeof requireAdmin !== "function") {
    throw new Error("createAbuseAuth requires requireDashboardAdmin");
  }
  async function writeAudit(event) {
    try {
      await db.query(
        `insert into public.abuse_audit_events
           (event_type, actor_type, actor_id, actor_email, subject_id, subject_email, old_value, new_value, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          event.eventType,
          event.actorType || "admin",
          event.actorId || null,
          event.actorEmail || null,
          event.subjectId || null,
          event.subjectEmail || null,
          event.oldValue ?? null,
          event.newValue ?? null,
          JSON.stringify(event.metadata || {}),
        ],
      );
    } catch (error) {
      console.error("[abuseAuth] audit write failed", error?.message || error);
    }
  }

  async function loadActivePermissions(employeeId) {
    const { rows } = await db.query(
      `select permission
         from public.employee_permissions
        where employee_id = $1
          and revoked_at is null
          and permission in ('abuse.view', 'abuse.reply', 'abuse.manage', 'abuse.admin')`,
      [employeeId],
    );
    return rows.map((row) => String(row.permission));
  }

  async function sendForbidden(req, res, actor, requiredPermission) {
    if (!res.headersSent) res.status(403).json(abuseForbiddenBody());
    await writeAudit({
      eventType: "UNAUTHORIZED_ACCESS",
      actorType: actor?.id ? "admin" : "system",
      actorId: actor?.id || null,
      actorEmail: actor?.email || null,
      metadata: {
        route: requestRoute(req),
        method: String(req.method || "").toUpperCase(),
        requiredPermission: requiredPermission || null,
      },
    });
    return null;
  }

  async function requireDashboardActor(req, res) {
    if (readOpsKey(req) && !readBearerToken(req)) {
      return sendForbidden(req, res, null, null);
    }

    if (!readBearerToken(req)) {
      if (!res.headersSent) res.status(401).json(abuseUnauthorizedBody());
      return null;
    }

    const admin = await requireAdmin(req, res);
    if (!admin?.id) {
      if (!res.headersSent) res.status(401).json(abuseUnauthorizedBody());
      return null;
    }

    return {
      id: String(admin.id),
      email: normalizeEmail(admin.email),
      roles: Array.isArray(admin.roles) ? admin.roles : [],
    };
  }

  async function requireAbusePermission(req, res, requiredPermission) {
    const required = normalizeAbusePermission(requiredPermission);
    const actor = await requireDashboardActor(req, res);
    if (!actor) return null;

    let permissions;
    try {
      permissions = await loadActivePermissions(actor.id);
    } catch (error) {
      console.error("[abuseAuth] permission lookup failed", error?.message || error);
      if (!res.headersSent) res.status(503).json(abuseUnavailableBody());
      return null;
    }

    if (!hasAbuseCapability(permissions, required)) {
      return sendForbidden(req, res, actor, required);
    }

    return {
      ...actor,
      permissions,
      capabilities: capabilitiesFromPermissions(permissions),
    };
  }

  return {
    writeAudit,
    loadActivePermissions,
    requireDashboardActor,
    requireAbusePermission,
  };
}
