import fs from "fs";
import path from "path";

const roots = ["frontend/src", "frontend/api", "frontend/server"];
const exts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

/** @type {Array<[RegExp, string]>} */
const replacements = [
  // Custom events + storage keys (product code)
  [/memebattles:/g, "memewarzone:"],
  [/memebattles_status_token/g, "memewarzone_status_token"],
  [/__memebattles_pool/g, "__memewarzone_pool"],
  // Auth message brands
  [/MemeBattles Comment/g, "MemeWarzone Comment"],
  [/MemeBattles Profile/g, "MemeWarzone Profile"],
  [/MemeBattles League/g, "MemeWarzone League"],
  [/MemeBattles Diagnostics/g, "MemeWarzone Diagnostics"],
  // UI / demo
  [/MemeBattles sponsorship/g, "MemeWarzone sponsorship"],
  [/Apply for a MemeBattles/g, "Apply for a MemeWarzone"],
  [/docs\.memebattles\.gg/g, "docs.memewar.zone"],
  [/x\.com\/_MemeBattles/g, "x.com/memewarzone"],
  // Package/env comment headers (not live Railway hosts — leave those for dual-host cutover)
  [/# MemeBattles Frontend Environment/g, "# MemeWarzone Frontend Environment"],
  [/MemeBattles Frontend Environment/g, "MemeWarzone Frontend Environment"],
];

// Intentionally NOT replacing Railway hostnames (memebattles-*.railway.app) here —
// those need dual-host cutover. Comments that only mention the old name in prose get a light pass.

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (exts.has(path.extname(ent.name))) out.push(p);
  }
  return out;
}

let changed = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    let text = fs.readFileSync(file, "utf8");
    const original = text;
    for (const [re, to] of replacements) text = text.replace(re, to);
    // Type declaration for openWalletModal custom event
    text = text.replace(/"memewarzone:openWalletModal": CustomEvent/g, '"memewarzone:openWalletModal": CustomEvent');
    if (text !== original) {
      fs.writeFileSync(file, text);
      changed += 1;
      console.log("updated", file);
    }
  }
}

// Root package name
const pkgPath = "package.json";
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.name === "launchit-bonding-curve-tests") {
    pkg.name = "memewarzone";
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log("updated package.json name -> memewarzone");
    changed += 1;
  }
}

// Status.tsx dual-read for old localStorage key
const statusPath = "frontend/src/pages/Status.tsx";
if (fs.existsSync(statusPath)) {
  let s = fs.readFileSync(statusPath, "utf8");
  if (s.includes('localStorage.getItem("memewarzone_status_token")') && !s.includes("memebattles_status_token")) {
    s = s.replace(
      'localStorage.getItem("memewarzone_status_token") || ""',
      'localStorage.getItem("memewarzone_status_token") || localStorage.getItem("memebattles_status_token") || ""',
    );
    fs.writeFileSync(statusPath, s);
    console.log("status dual-read old key");
  }
}

console.log("files changed:", changed);
