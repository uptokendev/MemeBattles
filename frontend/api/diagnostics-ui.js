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
    .wrap{ max-width:1100px; margin:40px auto; padding:0 16px; }
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

    .grid{ display:grid; grid-template-columns: 1.2fr .8fr; gap:14px; }
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
    pre{ margin:0; padding:12px; border-radius:14px; border:1px solid var(--line); background:rgba(0,0,0,.20);
         color:var(--text); overflow:auto; font-size:12px; line-height:1.4; }
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

  const rows = [];

  if (!a) {
    rows.push(["Connectivity", badge("bad","No data"), "—"]);
  } else if (!a.ok) {
    rows.push(["Connectivity", badge("bad","FAIL"), "<span class='mono'>" + (a.error?.code || "") + "</span> " + (a.error?.message || "Unknown")]);
  } else {
    rows.push(["Connectivity", badge("ok","OK"), "Latency: <span class='mono'>" + (a.latencyMs ?? "—") + "ms</span>"]);
    rows.push(["SSL verification", badge("ok", a.ssl?.rejectUnauthorized ? "verified" : "unverified"), "hasCa: <span class='mono'>" + String(!!a.ssl?.hasCa) + "</span>"]);
    const c = a.checks || {};
    rows.push(["Table: user_profiles", c.user_profiles ? badge("ok","Present") : badge("bad","Missing"), "—"]);
    rows.push(["Table: token_comments", c.token_comments ? badge("ok","Present") : badge("bad","Missing"), "—"]);
    rows.push(["Table: auth_nonces", c.auth_nonces ? badge("ok","Present") : badge("bad","Missing"), "—"]);
    rows.push(["Column: auth_nonces.used_at", c.auth_nonces_used_at ? badge("ok","Present") : badge("warn","Missing"), "—"]);
    rows.push(["Column: auth_nonces.expires_at", c.auth_nonces_expires_at ? badge("ok","Present") : badge("warn","Missing"), "—"]);
  }

  tbody.innerHTML = rows.map(([k,s,d]) =>
    "<tr><td class='k'>" + k + "</td><td>" + s + "</td><td class='muted'>" + d + "</td></tr>"
  ).join("");
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

  if (!r) {
    tbody.innerHTML = "<tr><td class='k'>/health</td><td>" + badge("warn","Not configured") + "</td><td class='muted'>Set RAILWAY_INDEXER_URL</td></tr>";
    return;
  }

  const rows = [];
  if (!r.ok) {
    rows.push(["/health", badge("bad","FAIL"), "HTTP: <span class='mono'>" + (r.httpStatus ?? "—") + "</span> " + (typeof r.body === "string" ? r.body : JSON.stringify(r.body))]);
  } else {
    rows.push(["/health", badge("ok","OK"), "Latency: <span class='mono'>" + (r.latencyMs ?? "—") + "ms</span>, HTTP: <span class='mono'>" + (r.httpStatus ?? "—") + "</span>"]);
    rows.push(["URL", badge("info","Info"), "<span class='mono'>" + (r.url || "—") + "</span>"]);
  }

  tbody.innerHTML = rows.map(([k,st,d]) =>
    "<tr><td class='k'>" + k + "</td><td>" + st + "</td><td class='muted'>" + d + "</td></tr>"
  ).join("");
}

function setAblyRows(j) {
  const tbody = document.getElementById("ablyRows");
  const a = j?.checks?.ably;
  const env = j?.env_presence || {};

  const rows = [];
  if (!a) {
    rows.push(["Server key", badge("warn","No data"), "—"]);
  } else if (!a.ok) {
    rows.push(["Server key", badge("bad","Missing/Invalid"), a.error?.message || a.note || "—"]);
  } else {
    rows.push(["Server key", badge("ok","OK"), "Preview: <span class='mono'>" + (a.preview || "—") + "</span>"]);
    rows.push(["Note", badge("info","Info"), a.note || "—"]);
  }

  // Client build-time key presence check (helps debug your “invalid key parameter” issue)
  rows.push([
    "Client key present (server visibility)",
    env.VITE_ABLY_CLIENT_KEY_on_server ? badge("warn","Present") : badge("info","Unknown"),
    "Client key is a Vite build-time var; ensure it is a valid Ably key or switch to authUrl-only."
  ]);

  tbody.innerHTML = rows.map(([k,st,d]) =>
    "<tr><td class='k'>" + k + "</td><td>" + st + "</td><td class='muted'>" + d + "</td></tr>"
  ).join("");
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
