import crypto from "node:crypto";

export const WAR_ADMIN_AUTH_COOKIE = "mwz_wm_admin";
export const WAR_ADMIN_AUTH_TTL_SECONDS = 60 * 60 * 12;

function parseCookies(raw) {
  return String(raw || "")
    .split(";")
    .reduce((acc, pair) => {
      const index = pair.indexOf("=");
      if (index === -1) return acc;
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!key) return acc;
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function getAuthSecret() {
  const secret = String(
    process.env.WAR_ADMIN_AUTH_SECRET ||
      process.env.WAR_MISSIONS_AUTH_SECRET ||
      process.env.RECRUITER_AUTH_SECRET ||
      ""
  ).trim();
  if (!secret) throw new Error("War admin auth secret is not configured.");
  return secret;
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function signPayload(payload) {
  return crypto.createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
}

function getSecureCookieFlag(req) {
  const proto = String(req.headers?.["x-forwarded-proto"] || "");
  const host = String(req.headers?.host || "");
  if (/localhost|127\.0\.0\.1/i.test(host)) return false;
  return proto ? proto === "https" : process.env.NODE_ENV === "production";
}

function buildCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || "/"}`);
  if (typeof options.maxAge === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.secure !== false) parts.push("Secure");
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join("; ");
}

function configuredUsername() {
  return String(process.env.WAR_ADMIN_USERNAME || process.env.ADMIN_USERNAME || "").trim();
}

function configuredPasswordHash() {
  return String(process.env.WAR_ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD_HASH || "").trim();
}

function configuredBootstrapPassword() {
  return String(process.env.WAR_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "");
}

export function hashAdminPassword(password, salt = crypto.randomBytes(16).toString("base64url")) {
  const key = crypto.scryptSync(String(password || ""), salt, 64);
  return `scrypt:${salt}:${key.toString("base64url")}`;
}

export function verifyAdminPassword(password, encodedHash) {
  const value = String(encodedHash || "").trim();
  if (!value) return false;
  const [algorithm, salt, expected] = value.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password || ""), salt, 64).toString("base64url");
  return timingSafeEqualText(actual, expected);
}

export function verifyAdminCredentials(username, password) {
  const expectedUsername = configuredUsername();
  if (!expectedUsername) throw new Error("WAR_ADMIN_USERNAME is not configured.");
  if (!timingSafeEqualText(String(username || "").trim(), expectedUsername)) return false;

  const passwordHash = configuredPasswordHash();
  if (passwordHash) return verifyAdminPassword(password, passwordHash);

  const bootstrapPassword = configuredBootstrapPassword();
  if (bootstrapPassword) return timingSafeEqualText(String(password || ""), bootstrapPassword);

  throw new Error("WAR_ADMIN_PASSWORD_HASH is not configured.");
}

export function createAdminAuthCookie(req, admin) {
  const exp = Math.floor(Date.now() / 1000) + WAR_ADMIN_AUTH_TTL_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({ sub: admin.username, role: "admin", exp }),
  ).toString("base64url");
  const signature = signPayload(payload);
  const domain = String(process.env.WAR_MISSIONS_COOKIE_DOMAIN || "").trim() || undefined;

  return buildCookie(WAR_ADMIN_AUTH_COOKIE, `${payload}.${signature}`, {
    maxAge: WAR_ADMIN_AUTH_TTL_SECONDS,
    httpOnly: true,
    secure: getSecureCookieFlag(req),
    sameSite: "Lax",
    path: "/",
    domain,
  });
}

export function clearAdminAuthCookie(req) {
  const domain = String(process.env.WAR_MISSIONS_COOKIE_DOMAIN || "").trim() || undefined;
  return buildCookie(WAR_ADMIN_AUTH_COOKIE, "", {
    maxAge: 0,
    httpOnly: true,
    secure: getSecureCookieFlag(req),
    sameSite: "Lax",
    path: "/",
    domain,
  });
}

export function readAdminAuth(req) {
  const cookies = parseCookies(req.headers?.cookie || req.headers?.Cookie);
  const raw = cookies[WAR_ADMIN_AUTH_COOKIE];
  if (!raw) return null;

  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  if (!timingSafeEqualText(signPayload(payload), signature)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded?.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    if (decoded.role !== "admin") return null;
    return { username: String(decoded.sub || "admin"), role: "admin" };
  } catch {
    return null;
  }
}

export function adminUnauthorized(res, message = "Admin login required.") {
  return res.status(401).json({ ok: false, error: message });
}

export function requireAdmin(req, res) {
  const admin = readAdminAuth(req);
  if (!admin) {
    adminUnauthorized(res);
    return null;
  }
  return admin;
}
