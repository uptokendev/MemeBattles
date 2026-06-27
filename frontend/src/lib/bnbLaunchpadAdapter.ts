import type { CampaignInfo, CampaignMetrics } from "@/lib/launchpadClient";
import type { CreateTokenInput, EligibilityResult, LaunchpadAdapter, QuoteInput, QuoteResult, TokenState, TradeEligibilityInput, TradeInput, TxResult } from "@/lib/launchpadAdapter";
import { fetchLaunchpadCreatePreflight } from "@/lib/recruiterApi";
import { apiFetch } from "@/lib/apiBase";

export type BnbLaunchpadClient = {
  activeChainId: number;
  createCampaign(input: CreateTokenInput): Promise<unknown>;
  buyTokens(campaignAddress: string, amountWei: bigint, maxCostWei: bigint): Promise<unknown>;
  sellTokens(campaignAddress: string, amountWei: bigint, minAmountWei: bigint): Promise<unknown>;
  finalizeCampaign(campaignAddress: string, minTokens: bigint, minBnb: bigint): Promise<unknown>;
  fetchCampaigns(): Promise<CampaignInfo[]>;
  fetchCampaignMetrics(campaignAddress: string): Promise<CampaignMetrics | null>;
};

function normalizeReceipt(receipt: unknown): TxResult {
  const anyReceipt = receipt as any;
  return {
    hash: anyReceipt?.hash || anyReceipt?.transactionHash,
    transactionHash: anyReceipt?.transactionHash || anyReceipt?.hash,
    receipt,
    raw: receipt,
  };
}

async function fetchCreatorProfile(wallet: string) {
  const res = await apiFetch(`/api/security/creator/${encodeURIComponent(wallet)}/profile`, { cache: "no-store" as RequestCache });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(String(json?.error || `Request failed (${res.status})`));
  return json?.profile ?? null;
}

async function fetchTradeEligibility(input: TradeEligibilityInput, chainId: number): Promise<EligibilityResult> {
  const path = input.side === "buy" ? "/api/launchpad/preflight-buy" : "/api/launchpad/preflight-sell";
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress: input.wallet,
      campaignAddress: input.tokenId,
      chainId,
    }),
  });
  const json = await res.json().catch(() => ({}));
  const preflight = json?.preflight ?? json;
  if (preflight && typeof preflight.allowed === "boolean") return preflight as EligibilityResult;
  throw new Error(String(json?.error || json?.message || `Request failed (${res.status})`));
}

export function createBnbLaunchpadAdapter(client: BnbLaunchpadClient): LaunchpadAdapter {
  return {
    chain: "bnb",

    async createToken(input: CreateTokenInput) {
      const receipt = await client.createCampaign(input);
      return normalizeReceipt(receipt);
    },

    async buy(input: TradeInput) {
      if (input.maxCostWei == null) throw new Error("BNB buy requires maxCostWei.");
      const receipt = await client.buyTokens(input.tokenId, input.amountWei, input.maxCostWei);
      return normalizeReceipt(receipt);
    },

    async sell(input: TradeInput) {
      if (input.minAmountWei == null) throw new Error("BNB sell requires minAmountWei.");
      const receipt = await client.sellTokens(input.tokenId, input.amountWei, input.minAmountWei);
      return normalizeReceipt(receipt);
    },

    async getTokenState(tokenId: string): Promise<TokenState> {
      const campaigns = await client.fetchCampaigns();
      const normalizedTokenId = tokenId.toLowerCase();
      const campaign = campaigns.find((item: CampaignInfo) => item.campaign.toLowerCase() === normalizedTokenId || item.token.toLowerCase() === normalizedTokenId) || null;
      const metrics: CampaignMetrics | null = campaign ? await client.fetchCampaignMetrics(campaign.campaign) : await client.fetchCampaignMetrics(tokenId);
      return { campaign, metrics };
    },

    getCreatorProfile: fetchCreatorProfile,

    async getLaunchEligibility(wallet: string) {
      return fetchLaunchpadCreatePreflight(wallet, client.activeChainId);
    },

    async getTradeEligibility(input: TradeEligibilityInput) {
      return fetchTradeEligibility(input, client.activeChainId);
    },

    async getQuote(input: QuoteInput): Promise<QuoteResult> {
      const metrics = await client.fetchCampaignMetrics(input.tokenId);
      if (!metrics) return { amountWei: input.amountWei, warnings: ["Quote unavailable until campaign metrics load."] };
      const valueWei = (metrics.currentPrice * input.amountWei) / 10n ** 18n;
      return input.side === "buy"
        ? { amountWei: input.amountWei, estimatedCostWei: valueWei, warnings: [] }
        : { amountWei: input.amountWei, estimatedReturnWei: valueWei, warnings: [] };
    },

    async graduate(tokenId: string) {
      const receipt = await client.finalizeCampaign(tokenId, 0n, 0n);
      return normalizeReceipt(receipt);
    },
  };
}
