import fs from "fs";

const p = "realtime-indexer/src/lpFeesRoutes.ts";
let c = fs.readFileSync(p, "utf8");

const re =
  /const chainId = Number\(req\.body\?\.chainId \?\? req\.query\.chainId \?\? 97\);\r?\n[\s\S]*?return \{ ok: false, status: 401, error: "Ops key required for harvest on this chain\." \};/;

const replacement = `const chainId = Number(req.body?.chainId ?? req.query.chainId ?? 97);
  // Never allow server-key harvest without ops key. Open only on testnet when no harvest signer is configured.
  const harvestKey = String(
    process.env.HARVEST_OPS_PRIVATE_KEY || process.env.LP_FEE_HARVEST_PRIVATE_KEY || process.env.DEPLOYER_PK || "",
  ).trim();
  if (harvestKey) {
    return { ok: false, status: 401, error: "Ops key required when harvest signer key is configured." };
  }
  if (chainId === 97) return { ok: true };
  return { ok: false, status: 401, error: "Ops key required for harvest on this chain." };`;

if (!re.test(c)) {
  console.error("lpFees pattern not found");
  process.exit(1);
}
c = c.replace(re, replacement);
fs.writeFileSync(p, c);
console.log("lpFees harvest auth hardened");
