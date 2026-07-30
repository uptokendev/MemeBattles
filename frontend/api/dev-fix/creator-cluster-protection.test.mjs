import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
process.env.PG_DISABLE_SSL ||= "1";

const security = await import("./security-current-time.js");

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("creator protection applies only to buy route actions", () => {
  assert.equal(security.isCreatorBuyAction(0), true);
  assert.equal(security.isCreatorBuyAction(1), true);
  assert.equal(security.isCreatorBuyAction(2), false);
  assert.equal(security.isCreatorBuyAction(3), false);
});

test("creator cap reserves the conservative native amount", () => {
  assert.equal(
    security.requestedCreatorBuyWei({ action: 0, amount: 100n, limit: 250n }),
    250n,
    "buyExactTokens must reserve maxCost",
  );
  assert.equal(
    security.requestedCreatorBuyWei({ action: 1, amount: 300n, limit: 100n }),
    300n,
    "buyExactBnb must reserve msg.value/action amount",
  );
  assert.equal(security.requestedCreatorBuyWei({ action: 2, amount: 300n, limit: 100n }), 0n);
});

test("route authorization reserves before signing", async () => {
  const source = await read("./route-auth.js");
  const preflightIndex = source.indexOf("evaluateTradePreflight({ walletAddress, campaignAddress, chainId, action })");
  const reserveIndex = source.indexOf("reserveCreatorClusterBuyAuthorization({");
  const signIndex = source.indexOf("signTradeAuthorization({");

  assert.ok(preflightIndex >= 0, "route must pass action to creator protection preflight");
  assert.ok(reserveIndex > preflightIndex, "reservation must follow safety preflight");
  assert.ok(signIndex > reserveIndex, "route signature must not be created before cap reservation");
  assert.match(source, /CREATOR_CLUSTER_BUY_CAP_EXCEEDED|capReservation\.code/);
});

test("direct creator funding is detected, persisted, and synchronized", async () => {
  const [securitySource, detectorSource] = await Promise.all([
    read("./security-current-time.js"),
    read("./creator-cluster-detector.js"),
  ]);

  assert.match(securitySource, /detectDirectCreatorFunding/);
  assert.match(securitySource, /relationship = directCreator[\s\S]*direct_creator_funding/);
  assert.match(securitySource, /creatorDatabaseClusterId/);
  assert.match(securitySource, /public\.cluster_members/);
  assert.match(detectorSource, /https:\/\/api\.etherscan\.io\/v2\/api/);
  assert.match(detectorSource, /from !== creatorLower \|\| to !== walletLower/);
  assert.match(detectorSource, /CREATOR_CLUSTER_MIN_FUNDING_WEI/);
  assert.match(detectorSource, /public\.wallet_clusters/);
  assert.match(detectorSource, /public\.cluster_members/);
  assert.match(detectorSource, /public\.wallet_risk_profiles/);
  assert.match(detectorSource, /set-wallet-cluster/);
  assert.match(detectorSource, /set-cluster-risk/);
});

test("legacy campaigns bypass only the new cluster-specific layer", async () => {
  const source = await read("./security-current-time.js");

  assert.match(source, /isLegacyProtectionInterfaceUnavailable/);
  assert.match(source, /legacyCampaign:\s*true/);
  assert.match(source, /source:\s*"legacy_campaign"/);
  assert.match(source, /nestedRevertData\(error\)/);
  assert.match(source, /if \(nestedRevertData\(error\)\) return false/);
});

test("cap accounting fails closed cleanly", async () => {
  const source = await read("./security-current-time.js");
  const connectIndex = source.indexOf("client = await pool.connect()");
  const catchIndex = source.indexOf("CREATOR_CLUSTER_CAP_CHECK_UNAVAILABLE", connectIndex);

  assert.match(source, /const RESERVATION_GRACE_SECONDS = 2 \* 60/);
  assert.ok(connectIndex >= 0, "database connection must be inside the guarded reservation path");
  assert.ok(catchIndex > connectIndex, "database failures must return a structured creator protection denial");
  assert.match(source, /client\?\.release\(\)/);
});

test("custom contract reverts cannot be classified as missing methods", async () => {
  const source = await read("../../src/lib/launchpadClient.ts");
  const start = source.indexOf("export function isUnsupportedContractMethod");
  const end = source.indexOf("function buildMetadataURI", start);
  assert.ok(start >= 0 && end > start, "strict method support classifier must exist");
  const classifier = source.slice(start, end);

  assert.match(classifier, /findNestedRevertData\(error\)/);
  assert.doesNotMatch(classifier, /execution reverted/);
  assert.doesNotMatch(classifier, /missing revert data/);
  assert.doesNotMatch(classifier, /invalid opcode/);
  assert.match(classifier, /function selector was not recognized/);
});

test("centered creator protection dialog is globally wired", async () => {
  const [app, api, apiBase, dialog] = await Promise.all([
    read("../../src/App.tsx"),
    read("../../src/lib/recruiterApi.ts"),
    read("../../src/lib/apiBase.ts"),
    read("../../src/components/token/CreatorProtectionDialog.tsx"),
  ]);

  assert.match(app, /<CreatorProtectionDialog\s*\/>/);
  assert.match(api, /mwz:creatorProtectionBlocked/);
  assert.match(apiBase, /notifyCreatorProtectionResponse/);
  assert.match(apiBase, /mwz:creatorProtectionBlocked/);
  assert.match(dialog, /Creator-Linked Wallet/);
  assert.match(dialog, /Tier \$\{tierNumber\} Creator Buy Protection/);
  assert.doesNotMatch(dialog, /Switch wallet/i);
});
