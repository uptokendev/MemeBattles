import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function replaceRegex(source, pattern, replacement, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`Expected one ${label} match, found ${matches.length}`);
  return source.replace(pattern, replacement);
}

const clientPath = "frontend/src/lib/launchpadClient.ts";
let client = fs.readFileSync(clientPath, "utf8");
client = replaceRegex(
  client,
  /const CAMPAIGN_IDENTITY_ABI = \["function token\(\) view returns \(address\)"\] as const;[\s\S]*?\n}\n\nfunction isDecodeResultError/,
  `const CAMPAIGN_IDENTITY_ABI = [
  "function token() view returns (address)",
  "function creator() view returns (address)",
] as const;

export async function resolveCanonicalCampaignAddress(
  submittedAddress: string,
  chainId: number,
  provider: ethers.AbstractProvider,
): Promise<string> {
  const normalized = normalizeAddress(submittedAddress);
  if (!normalized) throw new Error("Invalid campaign or token address");

  // Resolve through the canonical database mirror first. Public token URLs are
  // expected here, and the database row carries the authoritative campaign/token pair.
  const campaigns = await fetchDbCampaigns(chainId, 500);
  const match = campaigns.find((campaign) =>
    normalizeAddress(campaign.campaign) === normalized ||
    normalizeAddress(campaign.token) === normalized
  );
  const canonicalCampaign = normalizeAddress(match?.campaign);
  if (canonicalCampaign) return canonicalCampaign;

  // A direct LaunchCampaign address may not be mirrored yet. Verify both token()
  // and creator() so a non-campaign contract cannot be accepted by one weak probe.
  try {
    const candidate = new Contract(normalized, CAMPAIGN_IDENTITY_ABI, provider) as any;
    const [tokenRaw, creatorRaw] = await Promise.all([candidate.token(), candidate.creator()]);
    const tokenAddress = normalizeAddress(tokenRaw);
    const creatorAddress = normalizeAddress(creatorRaw);
    if (tokenAddress && creatorAddress) return normalized;
  } catch {
    // Fall through to a deterministic resolution error.
  }

  throw new Error("Could not resolve the canonical LaunchCampaign contract for this token.");
}

function isDecodeResultError`,
  "frontend canonical campaign resolver",
);
fs.writeFileSync(clientPath, client);

const securityPath = "frontend/api/dev-fix/security-current-time.js";
let security = fs.readFileSync(securityPath, "utf8");
security = replaceOnce(
  security,
  `const CAMPAIGN_PROTECTION_ABI = [
  "function creator() view returns (address)",`,
  `const CAMPAIGN_PROTECTION_ABI = [
  "function token() view returns (address)",
  "function creator() view returns (address)",`,
  "campaign protection token getter",
);

security = replaceOnce(
  security,
  `export function isCreatorBuyAction(action) {`,
  `async function verifyCampaignIdentity({ provider, campaignAddress, expectedTokenAddress = "" }) {
  const campaign = new ethers.Contract(campaignAddress, CAMPAIGN_PROTECTION_ABI, provider);
  const [tokenRaw, creatorRaw] = await Promise.all([campaign.token(), campaign.creator()]);
  const tokenAddress = normalizeAddress(tokenRaw);
  const creatorAddress = normalizeAddress(creatorRaw);
  if (!tokenAddress || !creatorAddress) {
    throw new Error("Resolved campaign returned invalid token or creator data.");
  }
  const expectedToken = normalizeAddress(expectedTokenAddress);
  if (expectedToken && tokenAddress.toLowerCase() !== expectedToken.toLowerCase()) {
    throw new Error("Resolved campaign token does not match the submitted token address.");
  }
  return { campaignAddress: normalizeAddress(campaignAddress), tokenAddress, creatorAddress };
}

export async function resolveCanonicalTradeCampaignAddress({ chainId, campaignAddress }) {
  const numericChainId = Number(chainId);
  const submittedAddress = normalizeAddress(campaignAddress);
  if (!submittedAddress || ![56, 97].includes(numericChainId)) {
    throw new Error("Invalid campaign or token address for trade authorization.");
  }

  const rpcUrl = getRpcUrl(numericChainId);
  if (!rpcUrl) throw new Error("RPC URL is not configured for campaign resolution.");
  const provider = new ethers.JsonRpcProvider(rpcUrl, numericChainId, { staticNetwork: true });

  try {
    const direct = await verifyCampaignIdentity({ provider, campaignAddress: submittedAddress });
    return { ...direct, submittedAddress, source: "campaign_contract" };
  } catch {
    // Token-based routes and stale callers intentionally fall through to DB resolution.
  }

  const result = await pool.query(
    \`with candidates as (
       select 0 as priority, campaign_address, token_address
         from public.campaigns
        where chain_id = $1
          and (lower(campaign_address) = lower($2) or lower(token_address) = lower($2))
       union all
       select 1 as priority, campaign_address, token_address
         from public.campaign_drafts
        where chain_id = $1
          and archived_at is null
          and campaign_address is not null
          and (lower(campaign_address) = lower($2) or lower(token_address) = lower($2))
     )
     select campaign_address, token_address
       from candidates
      order by priority asc
      limit 1\`,
    [numericChainId, submittedAddress],
  );

  const row = result.rows[0] || null;
  const canonicalCampaign = normalizeAddress(row?.campaign_address);
  const expectedToken = normalizeAddress(row?.token_address);
  if (!canonicalCampaign) {
    throw new Error("No canonical LaunchCampaign mapping exists for the submitted token address.");
  }

  const verified = await verifyCampaignIdentity({
    provider,
    campaignAddress: canonicalCampaign,
    expectedTokenAddress: expectedToken || (submittedAddress.toLowerCase() === canonicalCampaign.toLowerCase() ? "" : submittedAddress),
  });
  return { ...verified, submittedAddress, source: "database_mapping" };
}

export function isCreatorBuyAction(action) {`,
  "server canonical campaign resolver",
);

security = replaceOnce(
  security,
  `export async function evaluateTradePreflight({ walletAddress, campaignAddress, chainId = 97, action = BUY_EXACT_TOKENS_ACTION }) {
  const base = await legacySecurity.evaluateTradePreflight({ walletAddress, campaignAddress, chainId });
  const wallet = normalizeAddress(walletAddress);
  const campaign = normalizeAddress(campaignAddress);

  if (!isCreatorBuyAction(action)) return base;
  if (!wallet || !campaign || ![56, 97].includes(Number(chainId))) return base;

  try {`,
  `export async function evaluateTradePreflight({ walletAddress, campaignAddress, chainId = 97, action = BUY_EXACT_TOKENS_ACTION }) {
  const wallet = normalizeAddress(walletAddress);
  const submittedCampaign = normalizeAddress(campaignAddress);
  const numericChainId = Number(chainId);

  if (!wallet || !submittedCampaign || ![56, 97].includes(numericChainId)) {
    return legacySecurity.evaluateTradePreflight({ walletAddress, campaignAddress, chainId });
  }

  let resolution;
  try {
    resolution = await resolveCanonicalTradeCampaignAddress({
      chainId: numericChainId,
      campaignAddress: submittedCampaign,
    });
  } catch (error) {
    const base = await legacySecurity.evaluateTradePreflight({
      walletAddress,
      campaignAddress: submittedCampaign,
      chainId: numericChainId,
    });
    return {
      ...base,
      allowed: false,
      code: "TRADE_CAMPAIGN_RESOLUTION_UNAVAILABLE",
      reasons: ["The canonical LaunchCampaign contract could not be verified. Trading authorization was not issued."],
      canonicalCampaignAddress: null,
      submittedCampaignAddress: submittedCampaign,
      campaignResolutionError: String(error?.shortMessage || error?.message || error),
    };
  }

  const campaign = resolution.campaignAddress;
  const legacyBase = await legacySecurity.evaluateTradePreflight({
    walletAddress,
    campaignAddress: campaign,
    chainId: numericChainId,
  });
  const base = {
    ...legacyBase,
    canonicalCampaignAddress: campaign,
    submittedCampaignAddress: submittedCampaign,
    campaignResolutionSource: resolution.source,
  };

  if (!isCreatorBuyAction(action)) return base;

  try {`,
  "trade preflight canonicalization",
);
fs.writeFileSync(securityPath, security);

const routePath = "frontend/api/dev-fix/route-auth.js";
let route = fs.readFileSync(routePath, "utf8");
const routeStart = route.indexOf("export async function routingTradeAuthorization");
if (routeStart < 0) throw new Error("Missing routingTradeAuthorization");
let beforeRoute = route.slice(0, routeStart);
let tradeRoute = route.slice(routeStart);
tradeRoute = replaceOnce(
  tradeRoute,
  `  const { routeProfileId, decision } = await getRouteDecision(walletAddress);`,
  `  const canonicalCampaignAddress = normalizeAddress(tradePreflight.canonicalCampaignAddress) || campaignAddress;
  const { routeProfileId, decision } = await getRouteDecision(walletAddress);`,
  "canonical route address declaration",
);
tradeRoute = replaceOnce(
  tradeRoute,
  `    campaignAddress,
    walletAddress,
    action,`,
  `    campaignAddress: canonicalCampaignAddress,
    walletAddress,
    action,`,
  "canonical reservation address",
);
tradeRoute = replaceOnce(
  tradeRoute,
  `    campaignAddress,
    actor: walletAddress,`,
  `    campaignAddress: canonicalCampaignAddress,
    actor: walletAddress,`,
  "canonical signature address",
);
tradeRoute = replaceOnce(
  tradeRoute,
  `    campaignAddress,
    decision,`,
  `    campaignAddress: canonicalCampaignAddress,
    decision,`,
  "canonical authorization log address",
);
tradeRoute = replaceOnce(
  tradeRoute,
  `    routeAuthority: signer.address,
    decision,
    preflight: authorizedPreflight,`,
  `    routeAuthority: signer.address,
    canonicalCampaignAddress,
    decision,
    preflight: authorizedPreflight,`,
  "canonical authorization response",
);
route = beforeRoute + tradeRoute;
fs.writeFileSync(routePath, route);

const testPath = "frontend/api/dev-fix/creator-cluster-protection.test.mjs";
let tests = fs.readFileSync(testPath, "utf8");
const newTest = `test("server canonicalizes token routes before preflight, cap reservation, and signing", async () => {
  const [securitySource, routeSource, clientSource] = await Promise.all([
    read("./security-current-time.js"),
    read("./route-auth.js"),
    read("../../src/lib/launchpadClient.ts"),
  ]);

  assert.match(securitySource, /export async function resolveCanonicalTradeCampaignAddress/);
  assert.match(securitySource, /public\\.campaigns/);
  assert.match(securitySource, /public\\.campaign_drafts/);
  assert.match(securitySource, /verifyCampaignIdentity/);
  assert.match(securitySource, /canonicalCampaignAddress:\\s*campaign/);
  assert.match(securitySource, /campaignResolutionSource:\\s*resolution\\.source/);

  const evaluateStart = securitySource.indexOf("export async function evaluateTradePreflight");
  const evaluateEnd = securitySource.indexOf("export async function reserveCreatorClusterBuyAuthorization", evaluateStart);
  const evaluateSource = securitySource.slice(evaluateStart, evaluateEnd);
  assert.ok(
    evaluateSource.indexOf("await resolveCanonicalTradeCampaignAddress") < evaluateSource.indexOf("legacySecurity.evaluateTradePreflight"),
    "canonical campaign resolution must happen before the trade preflight reads campaign state",
  );

  const tradeStart = routeSource.indexOf("export async function routingTradeAuthorization");
  const tradeSource = routeSource.slice(tradeStart);
  assert.match(tradeSource, /const canonicalCampaignAddress = normalizeAddress\\(tradePreflight\\.canonicalCampaignAddress\\)/);
  assert.match(tradeSource, /reserveCreatorClusterBuyAuthorization\\(\\{[\\s\\S]*campaignAddress: canonicalCampaignAddress/);
  assert.match(tradeSource, /signTradeAuthorization\\(\\{[\\s\\S]*campaignAddress: canonicalCampaignAddress/);

  const resolverStart = clientSource.indexOf("export async function resolveCanonicalCampaignAddress");
  const resolverEnd = clientSource.indexOf("function isDecodeResultError", resolverStart);
  const resolverSource = clientSource.slice(resolverStart, resolverEnd);
  assert.ok(
    resolverSource.indexOf("fetchDbCampaigns(chainId, 500)") < resolverSource.indexOf("candidate.token()"),
    "frontend must prefer the canonical DB mapping before probing an arbitrary contract",
  );
  assert.match(resolverSource, /candidate\\.creator\\(\\)/);
});

`;
tests = replaceOnce(
  tests,
  `test("custom contract reverts cannot be classified as missing methods", async () => {`,
  newTest + `test("custom contract reverts cannot be classified as missing methods", async () => {`,
  "server canonical campaign regression test",
);
fs.writeFileSync(testPath, tests);
