import fs from "node:fs";

const file = "frontend/src/pages/TokenDetails.tsx";
const source = fs.readFileSync(file, "utf8");

const before = `  const formatBnbFromWei = (wei?: bigint | null): string => {
    if (wei == null) return "—";
    try {
      const raw = ethers.formatEther(wei);
      const n = Number(raw);
      if (!Number.isFinite(n)) return \`${"${raw}"} BNB\`;
      const pretty = n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6);
      return \`${"${pretty}"} BNB\`;
    } catch {
      return "—";
    }
  };`;

const after = `  const formatBnbFromWei = (wei?: bigint | null): string => {
    if (wei == null) return "—";
    try {
      if (wei === 0n) return "0 BNB";
      const raw = ethers.formatEther(wei);
      const n = Number(raw);
      if (!Number.isFinite(n)) return \`${"${raw}"} BNB\`;
      if (n > 0 && n < 1e-12) return "<0.000000000001 BNB";
      if (n >= 1) return \`${"${n.toFixed(2)}"} BNB\`;
      if (n >= 0.01) return \`${"${n.toFixed(4)}"} BNB\`;

      const fraction = raw.split(".")[1] || "";
      const firstNonZero = fraction.search(/[1-9]/);
      const decimals = Math.min(12, Math.max(6, (firstNonZero >= 0 ? firstNonZero : 5) + 4));
      const pretty = n.toFixed(decimals).replace(/0+$/, "").replace(/\\.$/, "");
      return \`${"${pretty}"} BNB\`;
    } catch {
      return "—";
    }
  };`;

if (source.includes(after)) {
  console.log("TokenDetails tiny-BNB formatter is already patched.");
  process.exit(0);
}
if (!source.includes(before)) {
  throw new Error("TokenDetails formatBnbFromWei block no longer matches the expected source.");
}

fs.writeFileSync(file, source.replace(before, after));
console.log("Patched TokenDetails tiny-BNB quote formatting.");
