import fs from "fs";

const p = "frontend/api/dev-fix/security.js";
let c = fs.readFileSync(p, "utf8");
const old =
  "const adminEmail = String(req.headers[\"x-admin-email\"] || req.headers[\"x-user-email\"] || \"unknown\").trim() || \"unknown\";";
const neu =
  "const adminEmail = String(req.apiAuth?.admin?.email || req.headers[\"x-admin-email\"] || req.headers[\"x-user-email\"] || \"unknown\").trim() || \"unknown\";";

// try both quote styles
const variants = [
  [
    "const adminEmail = String(req.headers[\"x-admin-email\"] || req.headers[\"x-user-email\"] || \"unknown\").trim() || \"unknown\";",
    "const adminEmail = String(req.apiAuth?.admin?.email || req.headers[\"x-admin-email\"] || req.headers[\"x-user-email\"] || \"unknown\").trim() || \"unknown\";",
  ],
  [
    "const adminEmail = String(req.headers['x-admin-email'] || req.headers['x-user-email'] || 'unknown').trim() || 'unknown';",
    "const adminEmail = String(req.apiAuth?.admin?.email || req.headers['x-admin-email'] || req.headers['x-user-email'] || 'unknown').trim() || 'unknown';",
  ],
];

let done = false;
for (const [a, b] of variants) {
  if (c.includes(a)) {
    c = c.replace(a, b);
    done = true;
    break;
  }
}
if (!done && !c.includes("req.apiAuth?.admin?.email")) {
  // softer match
  c = c.replace(
    /const adminEmail = String\(req\.headers\[["']x-admin-email["']\][\s\S]*?\|\| ["']unknown["']\);/,
    'const adminEmail = String(req.apiAuth?.admin?.email || req.headers["x-admin-email"] || req.headers["x-user-email"] || "unknown").trim() || "unknown";',
  );
  done = c.includes("req.apiAuth?.admin?.email");
}

fs.writeFileSync(p, c);
console.log(done || c.includes("req.apiAuth?.admin?.email") ? "security actor patched" : "security actor unchanged");
