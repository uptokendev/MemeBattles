import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  return source.slice(0, first) + to + source.slice(first + from.length);
}

const clientPath = "frontend/src/lib/launchpadClient.ts";
let client = fs.readFileSync(clientPath, "utf8");

client = replaceOnce(
  client,
  "function isDecodeResultError(error: unknown): boolean {",
  `const CAMPAIGN_IDENTITY_ABI = ["function token() view returns (address)"] as const;

export async function resolveCanonicalCampaignAddress(
  submittedAddress: string,
  chainId: number,
  provider: ethers.AbstractProvider,
): Promise<string> {
  const normalized = normalizeAddress(submittedAddress);
  if (!normalized) throw new Error("Invalid campaign or token address");

  try {
    const candidate = new Contract(normalized, CAMPAIGN_IDENTITY_ABI, provider) as any;
    const tokenAddress = normalizeAddress(await candidate.token());
    if (tokenAddress) return normalized;
  } catch {
    // Public token URLs intentionally arrive here. Resolve them through the
    // canonical campaign mirror before any safety check, signature, or write.
  }

  const campaigns = await fetchDbCampaigns(chainId, 500);
  const match = campaigns.find((campaign) =>
    normalizeAddress(campaign.campaign) === normalized ||
    normalizeAddress(campaign.token) === normalized
  );
  const canonicalCampaign = normalizeAddress(match?.campaign);
  if (!canonicalCampaign) {
    throw new Error("Could not resolve the canonical LaunchCampaign contract for this token.");
  }
  return canonicalCampaign;
}

function isDecodeResultError(error: unknown): boolean {`,
  "canonical resolver insertion",
);

client = replaceOnce(
  client,
  `  const buyTokens = useCallback(async (campaignAddress: string, amountWei: bigint, maxCostWei: bigint) => {
    const normalizedCampaign = normalizeAddress(campaignAddress);
    if (!normalizedCampaign) throw new Error("Invalid campaign address");
    if (!signer) throw new Error("Wallet not connected");
    if (!wallet.account) throw new Error("Wallet not connected");

    const campaign = new Contract(normalizedCampaign, CAMPAIGN_ABI, signer) as any;`,
  `  const buyTokens = useCallback(async (campaignAddress: string, amountWei: bigint, maxCostWei: bigint) => {
    const submittedAddress = normalizeAddress(campaignAddress);
    if (!submittedAddress) throw new Error("Invalid campaign or token address");
    if (!signer) throw new Error("Wallet not connected");
    if (!wallet.account) throw new Error("Wallet not connected");

    const normalizedCampaign = await resolveCanonicalCampaignAddress(
      submittedAddress,
      Number(activeChainId),
      readProvider,
    );
    const campaign = new Contract(normalizedCampaign, CAMPAIGN_ABI, signer) as any;`,
  "buy canonical resolution",
);

client = replaceOnce(
  client,
  `  const sellTokens = useCallback(async (campaignAddress: string, amountWei: bigint, minAmountWei: bigint) => {
    const normalizedCampaign = normalizeAddress(campaignAddress);
    if (!normalizedCampaign) throw new Error("Invalid campaign address");
    if (!signer) throw new Error("Wallet not connected");
    if (!wallet.account) throw new Error("Wallet not connected");

    const campaign = new Contract(normalizedCampaign, CAMPAIGN_ABI, signer) as any;`,
  `  const sellTokens = useCallback(async (campaignAddress: string, amountWei: bigint, minAmountWei: bigint) => {
    const submittedAddress = normalizeAddress(campaignAddress);
    if (!submittedAddress) throw new Error("Invalid campaign or token address");
    if (!signer) throw new Error("Wallet not connected");
    if (!wallet.account) throw new Error("Wallet not connected");

    const normalizedCampaign = await resolveCanonicalCampaignAddress(
      submittedAddress,
      Number(activeChainId),
      readProvider,
    );
    const campaign = new Contract(normalizedCampaign, CAMPAIGN_ABI, signer) as any;`,
  "sell canonical resolution",
);

fs.writeFileSync(clientPath, client);

const pagePath = "frontend/src/pages/TokenDetails.tsx";
let page = fs.readFileSync(pagePath, "utf8");
page = replaceOnce(
  page,
  `let displayMatch = match;
displayMatch = await hydrateCampaignCreatorFromContract(displayMatch, readProvider);`,
  `const lifecycleCampaignAddress = String(
  lifecycleDraft?.campaignAddress || (lifecycleDraft as any)?.campaign_address || "",
).trim().toLowerCase();
const lifecycleTokenAddress = String(
  lifecycleDraft?.tokenAddress || (lifecycleDraft as any)?.token_address || "",
).trim().toLowerCase();

if (ethers.isAddress(lifecycleCampaignAddress)) {
  match = {
    ...match,
    campaign: lifecycleCampaignAddress,
    token: ethers.isAddress(lifecycleTokenAddress) ? lifecycleTokenAddress : match.token,
  };
}

let displayMatch = match;
displayMatch = await hydrateCampaignCreatorFromContract(displayMatch, readProvider);`,
  "token page lifecycle canonicalization",
);
fs.writeFileSync(pagePath, page);

const testPath = "frontend/api/dev-fix/creator-cluster-protection.test.mjs";
let tests = fs.readFileSync(testPath, "utf8");
const regression = `test("token-based routes resolve to canonical campaign contracts before trading", async () => {
  const [clientSource, pageSource] = await Promise.all([
    read("../../src/lib/launchpadClient.ts"),
    read("../../src/pages/TokenDetails.tsx"),
  ]);

  assert.match(clientSource, /export async function resolveCanonicalCampaignAddress/);
  assert.match(clientSource, /await candidate\\.token\\(\\)/);
  assert.match(clientSource, /fetchDbCampaigns\\(chainId, 500\\)/);

  for (const operation of ["buyTokens", "sellTokens"]) {
    const start = clientSource.indexOf("const " + operation + " = useCallback");
    const end = clientSource.indexOf("const ", start + 20);
    const source = clientSource.slice(start, end > start ? end : undefined);
    const resolveIndex = source.indexOf("await resolveCanonicalCampaignAddress(");
    const contractIndex = source.indexOf("new Contract(normalizedCampaign");
    const preflightIndex = source.indexOf(operation === "buyTokens" ? "fetchLaunchpadBuyPreflight" : "fetchLaunchpadSellPreflight");

    assert.ok(resolveIndex >= 0, operation + " must resolve token URLs to the campaign contract");
    assert.ok(contractIndex > resolveIndex, operation + " must resolve before constructing the write contract");
    assert.ok(preflightIndex > resolveIndex, operation + " must resolve before protection preflight");
  }

  assert.match(pageSource, /lifecycleCampaignAddress/);
  assert.match(pageSource, /campaign:\\s*lifecycleCampaignAddress/);
});

`;
tests = replaceOnce(
  tests,
  `test("custom contract reverts cannot be classified as missing methods", async () => {`,
  regression + `test("custom contract reverts cannot be classified as missing methods", async () => {`,
  "token route regression test",
);
fs.writeFileSync(testPath, tests);
