/**
 * Shared API auth helpers for MemeWarzone frontend-api gateway.
 * Dual-auth: when enforce flags are off, privileged routes still accept legacy
 * unauthenticated callers (log via console.warn). When enforce is on, fail closed.
 */

import { requireDashboardAdmin } from "../dashboard/_auth.js";

function truthyEnv(name) {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] || "").trim().toLowerCase());
}

export function isAuthEnforceInternal() {
  return truthyEnv("API_AUTH_ENFORCE_INTERNAL");
}

export function isAuthEnforceSecurityMutations() {
  return truthyEnv("API_AUTH_ENFORCE_SECURITY_MUTATIONS");
}

export function isAuthEnforceUserWrites() {
  return truthyEnv("API_AUTH_ENFORCE_USER_WRITES");
}

export function isAuthEnforceArenaMutations() {
  return truthyEnv("API_AUTH_ENFORCE_ARENA_MUTATIONS");
}

export function readBearerToken(req) {
  const header = String(req.headers?.authorization || "").trim();
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return "";
}

export function readInternalToken(req) {
  return (
    readBearerToken(req) ||
    String(req.headers?.["x-rank-events-token"] || "").trim() ||
    String(req.headers?.["x-internal-token"] || "").trim()
  );
}

export function getExpectedInternalToken() {
  return String(process.env.RANK_EVENTS_TOKEN || process.env.INTERNAL_API_TOKEN || "").trim();
}

export function readOpsKey(req) {
  const q = req.query || {};
  return String(req.headers?.["x-ops-key"] || q.opsKey || "").trim();
}

export function getExpectedOpsKey() {
  return String(process.env.DASHBOARD_OPS_KEY || process.env.OPS_READ_KEY || "").trim();
}

/**
 * Internal / service-to-service auth (indexer parity).
 * @returns {boolean} true if request may proceed
 */
export function requireInternalAuth(req, res, { routeLabel = "internal" } = {}) {
  const expected = getExpectedInternalToken();
  const provided = readInternalToken(req);
  const enforce = isAuthEnforceInternal();

  if (!expected) {
    if (enforce) {
      res.status(503).json({
        ok: false,
        error: "Internal endpoints are disabled: RANK_EVENTS_TOKEN / INTERNAL_API_TOKEN missing",
        code: "INTERNAL_AUTH_NOT_CONFIGURED",
      });
      return false;
    }
    console.warn(`[apiAuth] ${routeLabel}: internal token unset; allowing legacy unauth (enforce off)`);
    return true;
  }

  if (provided && provided === expected) return true;

  if (!enforce) {
    console.warn(`[apiAuth] ${routeLabel}: missing/invalid internal token; allowing legacy unauth (enforce off)`);
    return true;
  }

  res.status(401).json({ ok: false, error: "Unauthorized", code: "INTERNAL_AUTH_REQUIRED" });
  return false;
}

/**
 * Dashboard admin Bearer and/or shared ops key.
 * @returns {Promise<object|null>} admin context or ops context, or null after response sent
 */
export async function requireAdminOrOps(req, res, { routeLabel = "admin", allowOps = true } = {}) {
  const enforce = isAuthEnforceSecurityMutations();
  const opsExpected = getExpectedOpsKey();
  const opsProvided = readOpsKey(req);

  if (allowOps && opsExpected && opsProvided && opsProvided === opsExpected) {
    return { mode: "ops-key" };
  }

  const token = readBearerToken(req);
  if (token) {
    const admin = await requireDashboardAdmin(req, res);
    // requireDashboardAdmin already wrote 401/403 when invalid
    if (admin) return { mode: "admin", admin };
    return null;
  }

  if (!enforce) {
    console.warn(`[apiAuth] ${routeLabel}: no admin/ops auth; allowing legacy unauth (enforce off)`);
    return { mode: "legacy-open" };
  }

  if (!res.headersSent) {
    res.status(401).json({
      ok: false,
      error: "Dashboard administrator access or ops key required.",
      code: "ADMIN_OR_OPS_REQUIRED",
    });
  }
  return null;
}

/**
 * Wrap an Express-style async handler with internal auth.
 */
export function withInternalAuth(handler, routeLabel) {
  return async function internalAuthWrapped(req, res, next) {
    try {
      if (!requireInternalAuth(req, res, { routeLabel: routeLabel || req.path })) return;
      return await handler(req, res, next);
    } catch (error) {
      if (typeof next === "function") return next(error);
      console.error(`[apiAuth] ${routeLabel || req.path}`, error);
      if (!res.headersSent) res.status(500).json({ ok: false, error: "Server error" });
    }
  };
}

/**
 * Wrap handler with admin/ops auth (for security mutations & sensitive admin GETs).
 */
export function withAdminOrOps(handler, routeLabel, options = {}) {
  return async function adminOrOpsWrapped(req, res, next) {
    try {
      const auth = await requireAdminOrOps(req, res, { routeLabel: routeLabel || req.path, ...options });
      if (!auth) return;
      req.apiAuth = auth;
      return await handler(req, res, next);
    } catch (error) {
      if (typeof next === "function") return next(error);
      console.error(`[apiAuth] ${routeLabel || req.path}`, error);
      if (!res.headersSent) res.status(500).json({ ok: false, error: "Server error" });
    }
  };
}
