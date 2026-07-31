import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing test anchor: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Test anchor is not unique: ${label}`);
  }
  return source.slice(0, first) + to + source.slice(first + from.length);
}

const testPath = "frontend/api/dev-fix/creator-cluster-protection.test.mjs";
let tests = fs.readFileSync(testPath, "utf8");

tests = replaceOnce(
  tests,
  "  assert.match(clientSource, /await candidate\\.token\\(\\)/);",
  "  assert.match(clientSource, /candidate\\.token\\(\\)/);\n  assert.match(clientSource, /candidate\\.creator\\(\\)/);",
  "campaign identity assertions",
);

tests = replaceOnce(
  tests,
  `  assert.ok(
    evaluateSource.indexOf("await resolveCanonicalTradeCampaignAddress") < evaluateSource.indexOf("legacySecurity.evaluateTradePreflight"),
    "canonical campaign resolution must happen before the trade preflight reads campaign state",
  );`,
  `  const canonicalCampaignIndex = evaluateSource.indexOf("const campaign = resolution.campaignAddress;");
  const canonicalPreflightIndex = evaluateSource.indexOf(
    "const legacyBase = await legacySecurity.evaluateTradePreflight",
    canonicalCampaignIndex,
  );
  assert.ok(
    canonicalCampaignIndex >= 0 && canonicalPreflightIndex > canonicalCampaignIndex,
    "the valid trade path must use the resolved campaign before reading campaign state",
  );`,
  "valid canonical preflight ordering",
);

fs.writeFileSync(testPath, tests);
