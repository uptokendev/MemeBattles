export default async function handler(req, res) {
  try {
    const want = String(process.env.DIAGNOSTICS_TOKEN || "");
    const got = String(req.query?.token || "");

    // Hide endpoint if not authorized (same behavior as diagnostics)
    if (!want || got !== want) {
      return res.status(404).send("Not found");
    }

    const token = got; // token comes from querystring
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>UPMEME Diagnostics</title>
  <style>
    :root{
      --bg:#0b1020;
      --panel:#0f1733;
      --panel2:#0c132b;
      --text:#e8ecff;
      --muted:#a9b3da;
      --line:rgba(255,255,255,.08);
      --ok:#22c55e;
      --warn:#f59e0b;
      --bad:#ef4444;
      --info:#60a5fa;
      --chip:#121c3e;
      --shadow: 0 20px 70px rgba(0,0,0,.35);
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace;
      --sans: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
    }
    body{ margin:0; background: radial-gradient(1200px 700px at 20% 0%, rgba(96,165,250,.12), transparent 60%),
                           radial-gradient(900px 600px at 90% 10%, rgba(34,197,94,.10), transparent 55%),
                           var(--bg);
          color:var(--text); font-family:var(--sans); }
    td { word-break: break-word; }
.v, .mono { white-space: normal; }
    .wrap{
  max-width: min(1600px, calc(100vw - 32px));
  margin: 28px auto;
  padding: 0 16px;
}
    header{ display:flex; gap:16px; align-items:flex-start; justify-content:space-between; margin-bottom:18px; }
    h1{ margin:0; font-size:22px; letter-spacing:.2px; }
    .sub{ margin-top:6px; color:var(--muted); font-size:13px; }
    .actions{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
    button{ border:1px solid var(--line); background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
            color:var(--text); padding:10px 12px; border-radius:12px; cursor:pointer; box-shadow:0 10px 30px rgba(0,0,0,.25);
            font-size:13px; }
    button:hover{ border-color:rgba(255,255,255,.18); }
    .pill{ display:inline-flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--line);
           background:rgba(255,255,255,.03); border-radius:999px; font-size:12px; color:var(--muted); }
    .dot{ width:8px; height:8px; border-radius:999px; background:var(--muted); }
    .dot.ok{ background:var(--ok); }
    .dot.warn{ background:var(--warn); }
    .dot.bad{ background:var(--bad); }
    .dot.info{ background:var(--info); }

    .grid{ display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
    @media (max-width: 900px){ .grid{ grid-template-columns:1fr; } }

    .card{ background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
           border:1px solid var(--line); border-radius:18px; box-shadow:var(--shadow); overflow:hidden; }
    .card h2{ margin:0; padding:14px 14px 0 14px; font-size:14px; color:var(--muted); font-weight:600; letter-spacing:.3px; text-transform:uppercase; }
    .card .body{ padding:14px; }

    table{ width:100%; border-collapse:collapse; font-size:13px; }
    td, th{ padding:10px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
    th{ color:var(--muted); font-weight:600; text-align:left; background:rgba(0,0,0,.12); }
    tr:last-child td{ border-bottom:none; }
    .k{ color:var(--muted); width:44%; }
    .v{ font-family:var(--mono); }
    .badge{ display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; font-size:12px; font-weight:600;
            border:1px solid var(--line); background:rgba(255,255,255,.03); }
    .badge.ok{ color:var(--ok); border-color:rgba(34,197,94,.35); background:rgba(34,197,94,.08); }
    .badge.bad{ color:var(--bad); border-color:rgba(239,68,68,.35); background:rgba(239,68,68,.08); }
    .badge.warn{ color:var(--warn); border-color:rgba(245,158,11,.35); background:rgba(245,158,11,.08); }
    .badge.info{ color:var(--info); border-color:rgba(96,165,250,.35); background:rgba(96,165,250,.08); }

    .muted{ color:var(--muted); }
    .mono{ font-family:var(--mono); }
    pre{
  margin:0;
  padding:12px;
  border-radius:14px;
  border:1px solid var(--line);
  background:rgba(0,0,0,.20);
  color:var(--text);
  overflow:auto;
  font-size:12px;
  line-height:1.5;
  max-height: 520px;
}
    .footer{ margin-top:14px; color:var(--muted); font-size:12px; }
    .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; margin-top:8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <h1>UPMEME Diagnostics</h1>
        <div class="sub">Readable health view for Aiven (social) and future integrations. Token is required via <span class="mono">?token=</span>.</div>
        <div class="row">
          <span id="overall" class="pill"><span class="dot info"></span><span>Loading…</span></span>
          <span class="pill"><span class="dot info"></span><span class="mono" id="ts">—</span></span>
          <span class="pill"><span class="dot info"></span><span class="mono" id="nodeEnv">—</span></span>
        </div>
      </div>
      <div class="actions">
        <button id="refreshBtn">Refresh</button>
        <button id="copyBtn">Copy JSON</button>
      </div>
    </header>

    <div class="grid">
    <div class="card" style="grid-column: 1 / -1;">
  <h2>Readiness</h2>
  <div class="body">
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
      <span id="corePill" class="pill"><span class="dot info"></span><span>Core: —</span></span>
      <span id="goLivePill" class="pill"><span class="dot info"></span><span>Go-live: —</span></span>
    </div>

    <div class="grid" style="grid-template-columns: 1fr 1fr;">
      <div class="card" style="box-shadow:none;">
        <h2 style="padding-top:0;">Core gates</h2>
        <div class="body" style="padding:0;">
          <table>
            <thead><tr><th>Gate</th><th>Status</th></tr></thead>
            <tbody id="coreGateRows"></tbody>
          </table>
        </div>
      </div>

      <div class="card" style="box-shadow:none;">
        <h2 style="padding-top:0;">Go-live gates</h2>
        <div class="body" style="padding:0;">
          <table>
            <thead><tr><th>Gate</th><th>Status</th></tr></thead>
            <tbody id="goLiveGateRows"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>
      <div class="card">
  <h2>Vercel Runtime</h2>
  <div class="body">
    <table>
      <thead><tr><th>Item</th><th>Status</th><th>Details</th></tr></thead>
      <tbody id="vercelRows"></tbody>
    </table>
  </div>
</div>

<div class="card">
  <h2>Aiven (Social DB)</h2>
  <div class="body">
    <table>
      <thead><tr><th>Check</th><th>Status</th><th>Details</th></tr></thead>
      <tbody id="aivenRows"></tbody>
    </table>
  </div>
</div>

<div class="card">
  <h2>Supabase (Token Data)</h2>
  <div class="body">
    <table>
      <thead><tr><th>Check</th><th>Status</th><th>Details</th></tr></thead>
      <tbody id="supabaseRows"></tbody>
    </table>
  </div>
</div>

<div class="card">
  <h2>Railway (Indexer)</h2>
  <div class="body">
    <table>
      <thead><tr><th>Check</th><th>Status</th><th>Details</th></tr></thead>
      <tbody id="railwayRows"></tbody>
    </table>
  </div>
</div>

<div class="card">
  <h2>Ably (Realtime)</h2>
  <div class="body">
    <table>
      <thead><tr><th>Check</th><th>Status</th><th>Details</th></tr></thead>
      <tbody id="ablyRows"></tbody>
    </table>
  </div>
</div>

      <div class="card">
        <h2>Recommendations</h2>
        <div class="body">
          <div id="recs" class="muted">Loading…</div>
        </div>
      </div>

      <div class="card" style="grid-column: 1 / -1;">
        <h2>Environment summary</h2>
        <div class="body">
          <table>
            <thead><tr><th>Key</th><th>Present</th><th>Extra</th></tr></thead>
            <tbody id="envRows"></tbody>
          </table>
        </div>
      </div>

      <div class="card" style="grid-column: 1 / -1;">
        <h2>Raw JSON</h2>
        <div class="body">
          <pre id="raw">Loading…</pre>
          <div class="footer">This page intentionally never displays secrets. If you add more checks, keep them redacted.</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const TOKEN = ${JSON.stringify(token)};
    let lastJson = null;

    function setReadiness(j) {
  const status = j?.status || {};
  const coreReady = !!status.coreReady;
  const goLiveReady = !!status.goLiveReady;

  const corePill = document.getElementById("corePill");
  const goLivePill = document.getElementById("goLivePill");

  if (corePill) corePill.innerHTML = coreReady
    ? '<span class="dot ok"></span><span>Core: READY</span>'
    : '<span class="dot bad"></span><span>Core: NOT READY</span>';

  if (goLivePill) goLivePill.innerHTML = goLiveReady
    ? '<span class="dot ok"></span><span>Go-live: READY</span>'
    : '<span class="dot warn"></span><span>Go-live: NOT READY</span>';

  const coreRows = document.getElementById("coreGateRows");
  const goRows = document.getElementById("goLiveGateRows");

  const core = status.gates?.core || [];
  const go = status.gates?.goLive || [];

  if (coreRows) coreRows.innerHTML = core.map(g =>
    '<tr><td class="k">' + g.name + '</td><td>' + (g.ok ? badge("ok","PASS") : badge("bad","FAIL")) + '</td></tr>'
  ).join("");

  if (goRows) goRows.innerHTML = go.map(g =>
    '<tr><td class="k">' + g.name + '</td><td>' + (g.ok ? badge("ok","PASS") : badge("warn","FAIL")) + '</td></tr>'
  ).join("");
}

    function badge(status, label) {
      const cls = status === "ok" ? "ok" : status === "bad" ? "bad" : status === "warn" ? "warn" : "info";
      return '<span class="badge ' + cls + '"><span class="dot ' + cls + '"></span>' + label + '</span>';
    }

    function fmtBool(b){ return b ? badge("ok","Yes") : badge("bad","No"); }

    function setOverall(ok) {
      const el = document.getElementById("overall");
      if (!el) return;
      el.innerHTML = ok
        ? '<span class="dot ok"></span><span>Overall: OK</span>'
        : '<span class="dot bad"></span><span>Overall: Issues detected</span>';
    }

    function setVercelRows(j) {
  const tbody = document.getElementById("vercelRows");
  const env = j?.env_presence || {};
  const host = j?.redacted?.DATABASE_URL_host || "—";

  const rows = [
    ["NODE_ENV", badge("info", j?.runtime?.nodeEnv || "—"), "<span class='mono'>runtime</span>"],
    ["DATABASE_URL", env.DATABASE_URL ? badge("ok", "Present") : badge("bad", "Missing"), "host: <span class='mono'>" + host + "</span>"],
    ["Aiven CA file", env.repo_aiven_ca_pem?.exists ? badge("ok","Present") : badge("bad","Missing"),
      env.repo_aiven_ca_pem?.exists ? ("bytes: <span class='mono'>" + env.repo_aiven_ca_pem.bytes + "</span>") : "—"
    ],
    ["RAILWAY_INDEXER_URL", env.RAILWAY_INDEXER_URL ? badge("ok","Present") : badge("warn","Missing"),
      env.RAILWAY_INDEXER_URL ? "used for /health checks" : "optional until you wire it"
    ],
  ];

  tbody.innerHTML = rows.map(([k,s,d]) =>
    "<tr><td class='k'>" + k + "</td><td>" + s + "</td><td class='muted'>" + d + "</td></tr>"
  ).join("");
}

function setAivenRows(j) {
  const tbody = document.getElementById("aivenRows");
  const a = j?.checks?.aiven_postgres;
  const env = j?.env_presence || {};
  const host = j?.redacted?.DATABASE_URL_host || "—";

  const rows = [];

  // --- Section: Configuration ---
  rows.push([
    "<span class='mono'>Configuration</span>",
    badge("info", "Section"),
    "Validates DB env presence and CA source selection used for TLS verification."
  ]);

  rows.push([
    "DATABASE_URL",
    env.DATABASE_URL ? badge("ok", "Present") : badge("bad", "Missing"),
    env.DATABASE_URL ? ("host: <span class='mono'>" + host + "</span>") : "Add DATABASE_URL on Vercel (Production)."
  ]);

  // CA sources: prefer env CA; fallback to repo CA file
  const hasEnvCa = !!env.PG_CA_CERT_B64 || !!env.PG_CA_CERT;
  const repoCa = env.repo_aiven_ca_pem?.exists;

  rows.push([
    "CA source",
    (hasEnvCa || repoCa) ? badge("ok", "Available") : badge("bad", "Missing"),
    hasEnvCa
      ? "Using CA from env (<span class='mono'>PG_CA_CERT_B64</span> / <span class='mono'>PG_CA_CERT</span>)."
      : repoCa
      ? ("Using repo CA file (<span class='mono'>aiven-ca.pem</span>, bytes: <span class='mono'>" + (env.repo_aiven_ca_pem?.bytes ?? "—") + "</span>).")
      : "No CA available. Add PG_CA_CERT_B64 or include repo CA file."
  ]);

  // spacer
  rows.push(["", "", ""]);

  // --- Section: Connectivity ---
  rows.push([
    "<span class='mono'>Connectivity</span>",
    badge("info", "Section"),
    "Attempts <span class='mono'>select 1</span> with current SSL settings."
  ]);

  if (!a) {
    rows.push(["DB check", badge("bad", "No data"), "No diagnostics data for Aiven connectivity."]);
  } else if (!a.ok) {
    const code = a.error?.code ? ("<span class='mono'>" + a.error.code + "</span> ") : "";
    const msg = a.error?.message || "Unknown error";
    rows.push(["DB check", badge("bad", "FAIL"), code + msg]);

    // If you ever add these fields later, they will appear automatically
    if (a.ssl?.hasCa !== undefined) {
      rows.push(["SSL", badge("info", "Info"), "hasCa: <span class='mono'>" + String(!!a.ssl.hasCa) + "</span>"]);
    }
  } else {
    rows.push([
      "DB check",
      badge("ok", "OK"),
      "Latency: <span class='mono'>" + (a.latencyMs ?? "—") + "ms</span>"
    ]);

    rows.push([
      "SSL verification",
      a.ssl?.rejectUnauthorized ? badge("ok", "Verified") : badge("warn", "Unverified"),
      "hasCa: <span class='mono'>" + String(!!a.ssl?.hasCa) + "</span>"
    ]);
  }

  // spacer
  rows.push(["", "", ""]);

  // --- Section: Schema ---
  rows.push([
    "<span class='mono'>Schema</span>",
    badge("info", "Section"),
    "Checks required tables/columns for profiles, comments, and nonces."
  ]);

  const c = a?.checks || {};

  // If no schema data (because connectivity failed or older diagnostics), show guidance
  if (!a?.ok) {
    rows.push([
      "Schema checks",
      badge("warn", "Skipped"),
      "Schema checks run only when DB connectivity is OK."
    ]);
  } else {
    rows.push(["Table: user_profiles", c.user_profiles ? badge("ok", "Present") : badge("bad", "Missing"), "Profiles (displayName/avatar/bio)."]);
    rows.push(["Table: token_comments", c.token_comments ? badge("ok", "Present") : badge("bad", "Missing"), "Comments feed on token pages."]);
    rows.push(["Table: auth_nonces", c.auth_nonces ? badge("ok", "Present") : badge("bad", "Missing"), "Wallet signature nonces."]);

    // Columns (only meaningful if auth_nonces exists)
    if (c.auth_nonces) {
      rows.push(["Column: auth_nonces.nonce", c.auth_nonces_nonce ? badge("ok", "Present") : badge("warn", "Missing"), "Nonce value."]);
      rows.push(["Column: auth_nonces.expires_at", c.auth_nonces_expires_at ? badge("ok", "Present") : badge("warn", "Missing"), "Expiration timestamp."]);
      rows.push(["Column: auth_nonces.used_at", c.auth_nonces_used_at ? badge("ok", "Present") : badge("warn", "Missing"), "Replay protection (used marker)."]);
    } else {
      rows.push(["auth_nonces columns", badge("warn", "Skipped"), "auth_nonces table missing."]);
    }
  }

  tbody.innerHTML = rows
    .map(([k, st, d]) => "<tr><td class='k'>" + k + "</td><td>" + st + "</td><td class='muted'>" + d + "</td></tr>")
    .join("");
}


function setSupabaseRows(j) {
  const tbody = document.getElementById("supabaseRows");
  const s = j?.checks?.supabase;                 // reachability-only
  const sr = j?.checks?.supabase_service_role;   // service-role storage check

  const rows = [];

  // --- Section: Reachability (public) ---
  rows.push([
    "<span class='mono'>Reachability (public)</span>",
    badge("info", "Section"),
    "Checks if Supabase is reachable from Vercel runtime (no secrets)."
  ]);

  if (!s) {
    rows.push(["Reachability", badge("bad", "No data"), "No response from diagnostics."]);
  } else if (!s.ok) {
    rows.push(["Reachability", badge("bad", "FAIL"), (s.error?.message || "Unknown error")]);
  } else {
    rows.push([
      "Reachability",
      badge("ok", "OK"),
      "Latency: <span class='mono'>" + (s.latencyMs ?? "—") + "ms</span>, HTTP: <span class='mono'>" + (s.httpStatus ?? "—") + "</span>"
    ]);
    rows.push(["Host", badge("info", s.urlHost || "—"), "<span class='mono'>" + (s.pingUrl || "—") + "</span>"]);
    rows.push(["Note", badge("info", "Info"), s.note || "—"]);
  }

  // spacer row
  rows.push(["", "", ""]);

  // --- Section: Service Role / Storage (server-side) ---
  rows.push([
    "<span class='mono'>Service role / Storage</span>",
    badge("info", "Section"),
    "Validates SUPABASE_SERVICE_ROLE_KEY and checks bucket access (used by /api/upload)."
  ]);

  if (!sr) {
    rows.push(["Service role", badge("warn", "Not checked"), "supabase_service_role check not present in /api/diagnostics yet."]);
  } else if (!sr.ok) {
    const msg =
      sr.error?.message ||
      sr.error?.detail?.message ||
      sr.note ||
      "Missing or invalid SUPABASE_SERVICE_ROLE_KEY.";

    // If diagnostics marks it skipped, show WARN instead of FAIL
    const level = sr.skipped ? "warn" : "bad";
    rows.push(["Service role", badge(level, sr.skipped ? "Missing" : "FAIL"), msg]);

    if (sr.bucket) {
      rows.push(["Bucket", badge("info", "Info"), "Expected bucket: <span class='mono'>" + sr.bucket + "</span>"]);
    }
  } else {
    rows.push([
      "Service role",
      badge("ok", "OK"),
      "Latency: <span class='mono'>" + (sr.latencyMs ?? "—") + "ms</span>"
    ]);

    if (sr.bucket) {
      rows.push([
        "Bucket",
        sr.bucket.exists ? badge("ok", "Exists") : badge("warn", "Missing"),
        "Name: <span class='mono'>" + sr.bucket.name + "</span>, buckets: <span class='mono'>" + (sr.bucket.total ?? "—") + "</span>"
      ]);
    }
  }

  tbody.innerHTML = rows
    .map(([k, st, d]) => "<tr><td class='k'>" + k + "</td><td>" + st + "</td><td class='muted'>" + d + "</td></tr>")
    .join("");
}

function setRailwayRows(j) {
  const tbody = document.getElementById("railwayRows");
  const r = j?.checks?.railway;
  const env = j?.env_presence || {};

  const rows = [];

  // --- Section: Configuration ---
  rows.push([
    "<span class='mono'>Configuration</span>",
    badge("info", "Section"),
    "Checks Vercel env + URL normalization for the Railway indexer."
  ]);

  rows.push([
    "RAILWAY_INDEXER_URL",
    env.RAILWAY_INDEXER_URL ? badge("ok", "Present") : badge("warn", "Missing"),
    env.RAILWAY_INDEXER_URL
      ? "Configured. Diagnostics will call <span class='mono'>/health</span>."
      : "Add <span class='mono'>RAILWAY_INDEXER_URL</span> in Vercel (prefer full <span class='mono'>https://…</span>)."
  ]);

  // spacer
  rows.push(["", "", ""]);

  // --- Section: Health (/health) ---
  rows.push([
    "<span class='mono'>Health check</span>",
    badge("info", "Section"),
    "Calls <span class='mono'>GET /health</span> on the Railway service and validates response body."
  ]);

  if (!r) {
    rows.push(["/health", badge("warn", "Not checked"), "No diagnostics data for Railway."]);
  } else if (!r.ok) {
    const bodyStr =
      typeof r.body === "string"
        ? r.body
        : r.body
        ? JSON.stringify(r.body)
        : "";

    const errStr =
      r.error?.message
        ? r.error.message
        : bodyStr
        ? bodyStr
        : "Unreachable or unhealthy.";

    rows.push([
      "/health",
      badge("bad", "FAIL"),
      "HTTP: <span class='mono'>" + (r.httpStatus ?? "—") + "</span> " +
      (errStr ? ("<span class='mono'>" + errStr + "</span>") : "")
    ]);

    if (r.url) {
      rows.push(["URL", badge("info", "Info"), "<span class='mono'>" + r.url + "</span>"]);
    }
    if (r.note) {
      rows.push(["Note", badge("info", "Info"), r.note]);
    }
  } else {
    rows.push([
      "/health",
      badge("ok", "OK"),
      "Latency: <span class='mono'>" + (r.latencyMs ?? "—") + "ms</span>, HTTP: <span class='mono'>" + (r.httpStatus ?? "—") + "</span>"
    ]);

    rows.push(["URL", badge("info", "Info"), "<span class='mono'>" + (r.url || "—") + "</span>"]);

    // Show the Railway payload (your /health returns {ok:false,error:"..."} etc.)
    if (r.body) {
      rows.push([
        "Body",
        badge("info", "Info"),
        "<span class='mono'>" + (typeof r.body === "string" ? r.body : JSON.stringify(r.body)) + "</span>"
      ]);
    }

    if (r.note) {
      rows.push(["Note", badge("info", "Info"), r.note]);
    }
  }

  tbody.innerHTML = rows
    .map(([k, st, d]) => "<tr><td class='k'>" + k + "</td><td>" + st + "</td><td class='muted'>" + d + "</td></tr>")
    .join("");
}


function setAblyRows(j) {
  const tbody = document.getElementById("ablyRows");
  const a = j?.checks?.ably; // server-side check
  const env = j?.env_presence || {};
  const preview = j?.redacted?.ABLY_API_KEY_preview || a?.preview || "";

  const rows = [];

  // --- Section: Server-side (Vercel) ---
  rows.push([
    "<span class='mono'>Server-side key</span>",
    badge("info", "Section"),
    "ABLY_API_KEY is required server-side. Never expose this key to the browser."
  ]);

  if (!a) {
    rows.push(["ABLY_API_KEY", badge("warn", "Not checked"), "No diagnostics data for Ably server key."]);
  } else if (!a.ok) {
    rows.push([
      "ABLY_API_KEY",
      badge("bad", "Missing/Invalid"),
      a.error?.message || a.note || "Server key missing or invalid."
    ]);
  } else {
    rows.push([
      "ABLY_API_KEY",
      badge("ok", "OK"),
      "Preview: <span class='mono'>" + (preview || "—") + "</span>"
    ]);
    rows.push(["Note", badge("info", "Info"), a.note || "—"]);
  }

  // spacer
  rows.push(["", "", ""]);

  // --- Section: Client-side (Browser) ---
  rows.push([
    "<span class='mono'>Client-side config</span>",
    badge("info", "Section"),
    "Browser should ideally use <span class='mono'>authUrl</span> (token auth), not a raw key. Wrong key causes <span class='mono'>invalid key parameter</span>."
  ]);

  rows.push([
    "VITE_ABLY_CLIENT_KEY",
    env.VITE_ABLY_CLIENT_KEY_on_server ? badge("warn", "Present") : badge("info", "Unknown"),
    env.VITE_ABLY_CLIENT_KEY_on_server
      ? "Client key appears to be set at build time. Ensure it is a valid Ably key, or remove it and rely on <span class='mono'>authUrl</span> only."
      : "Not visible server-side (can still be set client-side at build time)."
  ]);

  rows.push([
    "Recommendation",
    badge("info", "Info"),
    "For production: use <span class='mono'>authUrl: /api/ably/auth</span> and remove <span class='mono'>key</span> from the browser client constructor. This prevents key-format errors and avoids exposing secrets."
  ]);

  tbody.innerHTML = rows
    .map(([k, st, d]) => "<tr><td class='k'>" + k + "</td><td>" + st + "</td><td class='muted'>" + d + "</td></tr>")
    .join("");
}


    function setEnvRows(j) {
      const tbody = document.getElementById("envRows");
      const e = j?.env_presence || {};
      const rows = [
        ["DATABASE_URL", !!e.DATABASE_URL, j?.redacted?.DATABASE_URL_host ? ("host: " + j.redacted.DATABASE_URL_host) : ""],
        ["PG_CA_CERT_B64", !!e.PG_CA_CERT_B64, ""],
        ["PG_CA_CERT", !!e.PG_CA_CERT, ""],
        ["repo aiven-ca.pem", !!e.repo_aiven_ca_pem?.exists, e.repo_aiven_ca_pem?.exists ? ("bytes: " + e.repo_aiven_ca_pem.bytes) : ""],
        ["SUPABASE_URL", !!e.SUPABASE_URL, ""],
        ["SUPABASE_SERVICE_ROLE_KEY", !!e.SUPABASE_SERVICE_ROLE_KEY, ""],
        ["ABLY_API_KEY", !!e.ABLY_API_KEY, ""],
        ["VITE_ABLY_CLIENT_KEY (server presence)", !!e.VITE_ABLY_CLIENT_KEY_on_server, "build-time var (client)"],
      ];

      tbody.innerHTML = rows.map(([k,p,extra]) => (
        '<tr>'
        + '<td class="k">' + k + '</td>'
        + '<td>' + (p ? badge("ok","Present") : badge("bad","Missing")) + '</td>'
        + '<td class="muted">' + (extra || "—") + '</td>'
        + '</tr>'
      )).join("");
    }

    function setRecommendations(j) {
      const el = document.getElementById("recs");
      const recs = Array.isArray(j?.recommendations) ? j.recommendations : [];
      if (recs.length === 0) {
        el.innerHTML = badge("ok","No recommendations");
        return;
      }
      el.innerHTML = '<ol style="margin:0; padding-left:18px;">'
        + recs.map(r => '<li style="margin:8px 0;">' + r + '</li>').join("")
        + '</ol>';
    }

    function setHeaderMeta(j) {
      document.getElementById("ts").textContent = new Date().toISOString();
      document.getElementById("nodeEnv").textContent = "NODE_ENV=" + (j?.runtime?.nodeEnv || "—");
    }

    async function load() {
    
      setOverall(false);
      const rawEl = document.getElementById("raw");
      rawEl.textContent = "Loading…";

      const r = await fetch('/api/diagnostics?token=' + encodeURIComponent(TOKEN), { cache: 'no-store' });
      const j = await r.json();
      lastJson = j;

      setHeaderMeta(j);
      setReadiness(j);
      setVercelRows(j);
setAivenRows(j);
setSupabaseRows(j);
setRailwayRows(j);
setAblyRows(j);
setEnvRows(j); // keep the global env table too (optional)
      setRecommendations(j);

      rawEl.textContent = JSON.stringify(j, null, 2);
    }

    document.getElementById("refreshBtn").addEventListener("click", load);
    document.getElementById("copyBtn").addEventListener("click", async () => {
      try {
        const text = lastJson ? JSON.stringify(lastJson, null, 2) : "";
        await navigator.clipboard.writeText(text);
      } catch {}
    });

    load();
  </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (e) {
    // Do not leak internal error details here
    res.status(500).send("Server error");
  }
}
