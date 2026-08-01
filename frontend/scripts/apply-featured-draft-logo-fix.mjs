#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, "../src/components/home/SafeFeaturedCampaigns.tsx");
const original = fs.readFileSync(target, "utf8");
const hadCrLf = original.includes("\r\n");
let source = original.replace(/\r\n/g, "\n");

function replaceOnce(before, after, label, marker = after) {
  if (source.includes(marker)) return;
  const matches = source.split(before).length - 1;
  if (matches === 0) {
    console.warn(`[featured-draft-logo] skip ${label}: no match (already fixed or source evolved)`);
    return;
  }
  if (matches !== 1) throw new Error(`${label}: expected exactly one match, found ${matches}`);
  source = source.replace(before, after);
}

replaceOnce(
  'import { apiFetch } from "@/lib/apiBase";\n',
  'import { apiFetch } from "@/lib/apiBase";\nimport { fetchPublicCampaignDrafts } from "@/lib/draftApi";\n',
  "Featured draft API import",
  'import { fetchPublicCampaignDrafts } from "@/lib/draftApi";',
);

replaceOnce(
  `  useEffect(() => {\n    let cancelled = false;\n    setLoading(true);\n    void (async () => {\n      const apiCandidates = await loadApiCandidates(chainId);\n      const candidates = apiCandidates.length ? apiCandidates : await loadOnChainCandidates(chainId);\n      const live = await verifyAndHydrateLive(candidates, chainId);\n      if (cancelled) return;\n      setItems(live);\n      setLoading(false);\n    })();\n    return () => { cancelled = true; };\n  }, [chainId, refresh]);`,
  `  useEffect(() => {\n    let cancelled = false;\n    setLoading(true);\n    void (async () => {\n      try {\n        const [apiCandidates, publicDrafts] = await Promise.all([\n          loadApiCandidates(chainId),\n          fetchPublicCampaignDrafts({ chainId, limit: 100 }).catch(() => []),\n        ]);\n        const draftLogoByCampaign = new Map(\n          publicDrafts\n            .filter((draft) => isAddress(draft.campaignAddress) && usefulImage(draft.logoUrl))\n            .map((draft) => [String(draft.campaignAddress).toLowerCase(), String(draft.logoUrl)]),\n        );\n        const rawCandidates = apiCandidates.length ? apiCandidates : await loadOnChainCandidates(chainId);\n        const candidates = rawCandidates.map((item) => ({\n          ...item,\n          logoUri: draftLogoByCampaign.get(item.campaignAddress.toLowerCase()) || item.logoUri,\n        }));\n        const live = await verifyAndHydrateLive(candidates, chainId);\n        if (cancelled) return;\n        setItems(live);\n      } finally {\n        if (!cancelled) setLoading(false);\n      }\n    })();\n    return () => { cancelled = true; };\n  }, [chainId, refresh]);`,
  "Featured Prepare Mode logo hydration",
  "const draftLogoByCampaign = new Map(",
);

if (source !== original.replace(/\r\n/g, "\n")) {
  fs.writeFileSync(target, hadCrLf ? source.replace(/\n/g, "\r\n") : source);
  console.log(`[featured-draft-logo] patched ${target}`);
}

const finalSource = fs.readFileSync(target, "utf8");
if (!finalSource.includes('import { fetchPublicCampaignDrafts } from "@/lib/draftApi";')) {
  throw new Error("Featured draft logo import was not applied.");
}
if (!finalSource.includes("const draftLogoByCampaign = new Map(")) {
  throw new Error("Featured campaign draft-logo hydration was not applied.");
}

console.log("[featured-draft-logo] Prepare Mode image hydration is present");
