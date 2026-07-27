const ADMIN_ROLES = new Set(["admin", "dashboard_admin"]);

function csvSet(name, { lower = false } = {}) {
  return new Set(
    String(process.env[name] || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => (lower ? value.toLowerCase() : value)),
  );
}

function bearerToken(req) {
  const header = String(req.headers?.authorization || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function appMetadataRoles(user) {
  const metadata = user?.app_metadata && typeof user.app_metadata === "object"
    ? user.app_metadata
    : {};
  const roles = new Set();

  if (typeof metadata.role === "string") roles.add(metadata.role.toLowerCase());
  if (Array.isArray(metadata.roles)) {
    for (const role of metadata.roles) {
      if (typeof role === "string") roles.add(role.toLowerCase());
    }
  }

  return roles;
}

async function fetchSupabaseUser(accessToken) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required for dashboard authorization.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Supabase user validation failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return await response.json();
}

function isApprovedAdmin(user) {
  const approvedIds = csvSet("DASHBOARD_ADMIN_USER_IDS");
  const approvedEmails = csvSet("DASHBOARD_ADMIN_EMAILS", { lower: true });
  const userId = String(user?.id || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  const roles = appMetadataRoles(user);

  if (userId && approvedIds.has(userId)) return true;
  if (email && approvedEmails.has(email)) return true;
  return Array.from(roles).some((role) => ADMIN_ROLES.has(role));
}

export async function requireDashboardAdmin(req, res) {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: "Supabase access token required." });
    return null;
  }

  const user = await fetchSupabaseUser(token);
  if (!user) {
    res.status(401).json({ ok: false, error: "Invalid or expired Supabase session." });
    return null;
  }

  if (!isApprovedAdmin(user)) {
    res.status(403).json({ ok: false, error: "Dashboard administrator access required." });
    return null;
  }

  return {
    id: String(user.id),
    email: String(user.email || ""),
    roles: Array.from(appMetadataRoles(user)),
  };
}
