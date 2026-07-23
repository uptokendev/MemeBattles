import { useCallback, useMemo } from "react";
import { Contract, ethers } from "ethers";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { BNB_CHAIN_ID, getActiveChainId, isSolanaChainId, SOLANA_CHAIN_ID, type SupportedChainId } from "@/lib/chainConfig";
import { bnbContractAbis, getBnbContractAddresses, getBnbContractReadiness } from "@/lib/bnbContracts";
import {
  fetchLaunchpadBuyPreflight,
  fetchLaunchpadCreatePreflight,
  fetchLaunchpadSellPreflight,
} from "@/lib/recruiterApi";
import { getReadProvider } from "@/lib/readProvider";
import { apiFetch } from "@/lib/apiBase";
import { resolveImageUri } from "@/lib/media";
import { getBnbLaunchpadSafetyStatus } from "@/lib/launchpad/adapters/bnbLaunchpadAdapter";
import { createSolanaLaunchpadAdapter } from "@/lib/launchpad/adapters/solanaLaunchpadAdapter";
import type {
  CampaignActivity,
  CampaignCardStats,
  CampaignInfo,
  CampaignMetrics,
  CampaignSummary,
  CreateCampaignParams,
  FetchCampaignPageOptions,
  LaunchpadAdapter,
} from "@/lib/launchpad/adapters/types";

export type {
  CampaignActivity,
  CampaignCardStats,
  CampaignInfo,
  CampaignMetrics,
  CampaignSummary,
  CreateCampaignParams,
  FetchCampaignPageOptions,
  LaunchpadAdapter,
  LaunchpadProtocolStatus,
  LaunchpadSafetyCheck,
  LaunchpadSafetyStatus,
} from "@/lib/launchpad/adapters/types";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const TRADE_AUTH_BUY_EXACT_TOKENS = 0;
const TRADE_AUTH_SELL_EXACT_TOKENS = 2;

function envEnabled(value: unknown): boolean {
  return TRUE_VALUES.has(String(value || "").trim().toLowerCase());
}

const ENABLE_ONCHAIN_CAMPAIGN_FALLBACK = envEnabled(import.meta.env.VITE_ENABLE_ONCHAIN_CAMPAIGN_FALLBACK);

const FACTORY_ABI = bnbContractAbis.launchFactory as ethers.InterfaceAbi;
const FACTORY_INTERFACE = new ethers.Interface(FACTORY_ABI);
const CAMPAIGN_ABI = [
  ...((bnbContractAbis.launchCampaign as any[]) ?? []),
  "function buyExactTokensAuthorized(uint256 amountOut,uint256 maxCost,uint8 routeProfile,uint64 routeDeadline,bytes routeSignature) payable returns (uint256 cost)",
  "function sellExactTokensAuthorized(uint256 amountIn,uint256 minPayout,uint8 routeProfile,uint64 routeDeadline,bytes routeSignature) returns (uint256 payout)",
] as ethers.InterfaceAbi;
const TOKEN_ABI = bnbContractAbis.launchToken as ethers.InterfaceAbi;
const GRADUATION_WRITE_ABI = [
  ...((CAMPAIGN_ABI as any[]) ?? []),
  "function graduateIfEligible(uint256 minTokens, uint256 minBnb) returns (uint256 usedTokens, uint256 usedBnb)",
] as ethers.InterfaceAbi;

const LEGACY_FACTORY_ABI = [
  "function campaignsCount() view returns (uint256)",
  "function getCampaignPage(uint256 offset, uint256 limit) view returns ((address campaign,address token,address creator,string name,string symbol,string logoURI,string xAccount,string website,string extraLink,uint64 createdAt)[] page)",
] as const;

type CampaignRequestPayload = {
  name: string;
  symbol: string;
  logoURI: string;
  xAccount: string;
  website: string;
  extraLink: string;
};

type CreatedCampaignReceipt = {
  campaignAddress?: string;
  tokenAddress?: string;
};

async function parseApiJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((json as any)?.error || (json as any)?.message || `Request failed (${res.status})`));
  return json as any;
}

async function postApiJson(path: string, body: any) {
  return parseApiJson(await apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function requestCreateAuthorization(params: {
  walletAddress: string;
  chainId: number;
  factoryAddress: string;
  campaignRequest: CampaignRequestPayload;
}) {
  return postApiJson("/api/routing/create-authorization", {
    walletAddress: params.walletAddress,
    chainId: params.chainId,
    factoryAddress: params.factoryAddress,
    campaignRequest: params.campaignRequest,
  });
}

async function requestTradeAuthorization(params: {
  walletAddress: string;
  campaignAddress: string;
  chainId: number;
  action: number;
  amount: bigint;
  limit: bigint;
}) {
  return postApiJson("/api/routing/trade-authorization", {
    walletAddress: params.walletAddress,
    campaignAddress: params.campaignAddress,
    chainId: params.chainId,
    action: params.action,
    amount: params.amount.toString(),
    limit: params.limit.toString(),
  });
}

function normalizeAddress(value: unknown): string {
  const raw = String(value ?? "").trim();
  return ethers.isAddress(raw) ? raw.toLowerCase() : "";
}

function isSolanaAddress(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  return raw.length >= 32 && raw.length <= 44 && SOLANA_ADDRESS_RE.test(raw);
}

function normalizeChainAddress(value: unknown, chainId: number): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (isSolanaChainId(chainId)) return isSolanaAddress(raw) ? raw : "";
  return ethers.isAddress(raw) ? raw.toLowerCase() : "";
}

function normalizeLogoUri(value: unknown): string {
  const raw = String(value ?? "").trim();
  const resolved = resolveImageUri(raw);
  return resolved || "/placeholder.svg";
}

function toUnixSeconds(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

function buildMetadataURI(chainId: number, tokenOrCampaignAddress?: string): string {
  const raw = String(tokenOrCampaignAddress || "").trim();
  if (!raw) return "";
  const address = normalizeChainAddress(raw, chainId);
  return address ? `/api/token-metadata/${chainId}/${address}` : "";
}

function formatBnbFromWei(wei: bigint): string {
  try {
    const n = Number(ethers.formatEther(wei));
    if (!Number.isFinite(n)) return `${wei.toString()} wei`;
    const abs = Math.abs(n);
    const pretty = abs >= 1 ? n.toFixed(2) : abs >= 0.01 ? n.toFixed(4) : abs >= 0.0001 ? n.toFixed(6) : n.toFixed(8);
    return `${pretty} BNB`;
  } catch {
    return `${wei.toString()} wei`;
  }
}

function extractCreatedCampaign(receipt: any): CreatedCampaignReceipt {
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = FACTORY_INTERFACE.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name !== "CampaignCreated") continue;
      return {
        campaignAddress: normalizeAddress(parsed.args?.campaign),
        tokenAddress: normalizeAddress(parsed.args?.token),
      };
    } catch {
      // Ignore logs from other contracts in the same transaction.
    }
  }
  return {};
}

function mapDbCampaign(item: any, idx: number, chainId: number): CampaignInfo | null {
  const campaign = normalizeChainAddress(item?.campaignAddress ?? item?.campaign_address ?? item?.campaign, chainId);
  if (!campaign) return null;

  const token = normalizeChainAddress(item?.tokenAddress ?? item?.token_address ?? item?.token, chainId);
  const creator = normalizeChainAddress(item?.creatorAddress ?? item?.creator_address ?? item?.creator, chainId);

  return {
    id: 100000 + idx,
    campaign,
    token,
    creator,
    name: String(item?.name ?? "Unknown"),
    symbol: String(item?.symbol ?? ""),
    logoURI: normalizeLogoUri(item?.logoUri ?? item?.logoURI ?? item?.logoUrl ?? item?.logo_url ?? item?.logo_uri),
    metadataURI: buildMetadataURI(chainId, token || campaign),
    xAccount: String(item?.xAccount ?? item?.xUrl ?? item?.x_url ?? ""),
    website: String(item?.website ?? item?.websiteUrl ?? item?.website_url ?? ""),
    extraLink: String(item?.extraLink ?? item?.extraUrl ?? item?.otherUrl ?? item?.other_url ?? ""),
    createdAt: toUnixSeconds(item?.createdAtChain ?? item?.created_at_chain ?? item?.createdAt ?? item?.created_at),
    dexPairAddress: item?.dexPairAddress ?? item?.dex_pair_address ?? undefined,
    dexScreenerUrl: item?.dexScreenerUrl ?? item?.dex_screener_url ?? undefined,
  };
}

async function fetchDbCampaigns(chainId: number, limit = 500): Promise<CampaignInfo[]> {
  try {
    const res = await apiFetch(
      `/api/campaigns?chainId=${encodeURIComponent(String(chainId))}&limit=${encodeURIComponent(String(limit))}&tab=trending&sort=default&status=all`,
      { cache: "no-store" as RequestCache },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(String(json?.error || `HTTP ${res.status}`));
    const items = Array.isArray(json?.items) ? json.items : [];
    return items.map((item: any, idx: number) => mapDbCampaign(item, idx, chainId)).filter(Boolean) as CampaignInfo[];
  } catch (error) {
    console.warn("[launchpadClient] DB campaign fetch failed", error);
    return [];
  }
}

function isDecodeResultError(error: unknown): boolean {
  const anyError = error as any;
  return anyError?.code === "BAD_DATA" || String(anyError?.message ?? "").toLowerCase().includes("could not decode result data");
}

function mapOnChainCampaign(c: any, idx: number, offset: number, chainId: number): CampaignInfo {
  return {
    id: offset + idx,
    campaign: c.campaign,
    token: c.token,
    creator: c.creator,
    name: c.name,
    symbol: c.symbol,
    logoURI: c.logoURI,
    metadataURI: c.metadataURI ?? buildMetadataURI(chainId, c.token || c.campaign),
    xAccount: c.xAccount,
    website: c.website,
    extraLink: c.extraLink,
    createdAt: c.createdAt ? Number(c.createdAt) : undefined,
  };
}

function mergeCampaigns(onChain: CampaignInfo[], db: CampaignInfo[]): CampaignInfo[] {
  const seen = new Set<string>();
  const merged: CampaignInfo[] = [];
  for (const item of [...db, ...onChain]) {
    const key = normalizeAddress(item?.campaign);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

async function legacyGasOverrides(signer: any, readProvider: ethers.AbstractProvider, extra: any = {}) {
  try {
    const p: any = signer?.provider ?? readProvider;
    if (!p || typeof p.send !== "function") return extra;
    const gpHex = await p.send("eth_gasPrice", []);
    const gasPrice = gpHex ? BigInt(gpHex) : 0n;
    return gasPrice > 0n ? { ...extra, gasPrice, type: 0 } : extra;
  } catch {
    return extra;
  }
}

function emitTxConfirmed(detail: any) {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("memebattles:txConfirmed", { detail }));
    }
  } catch {
    // non-fatal
  }
}

export function useLaunchpad(): LaunchpadAdapter {
  const wallet = useWallet() as any;
  const solanaWallet = useSolanaWallet();
  const { provider: walletProvider, signer, chainId: walletChainId } = wallet;
  const { solanaAccount, solanaWalletName, isSolanaConnected } = solanaWallet;

  const preferSolanaLaunchpad = Boolean(isSolanaConnected && solanaAccount && !wallet.isConnected);
  const activeChainId = useMemo<SupportedChainId>(
    () => (preferSolanaLaunchpad ? SOLANA_CHAIN_ID : getActiveChainId(walletChainId)),
    [preferSolanaLaunchpad, walletChainId],
  );
  const evmFallbackChainId = useMemo<SupportedChainId>(() => {
    const fallback = getActiveChainId(walletChainId);
    return isSolanaChainId(fallback) ? BNB_CHAIN_ID : fallback;
  }, [walletChainId]);
  const evmReadChainId = isSolanaChainId(activeChainId) ? evmFallbackChainId : activeChainId;
  const bnbAddresses = useMemo(() => getBnbContractAddresses(evmReadChainId), [evmReadChainId]);
  const bnbReadiness = useMemo(() => getBnbContractReadiness(evmReadChainId), [evmReadChainId]);
  const factoryAddress = bnbAddresses.launchFactory;
  const readProvider = useMemo(() => getReadProvider(evmReadChainId), [evmReadChainId]);

  const getFactoryRead = useCallback(() => {
    if (!factoryAddress) return null;
    return new Contract(factoryAddress, FACTORY_ABI, readProvider) as any;
  }, [factoryAddress, readProvider]);

  const getFactoryWrite = useCallback(() => {
    if (!factoryAddress || !signer) return null;
    return new Contract(factoryAddress, FACTORY_ABI, signer) as any;
  }, [factoryAddress, signer]);

  const getCampaignRead = useCallback((address: string) => {
    const campaignAddress = normalizeAddress(address);
    if (!campaignAddress) return null;
    return new Contract(campaignAddress, CAMPAIGN_ABI, readProvider) as any;
  }, [readProvider]);

  const fetchCampaignsCount = useCallback(async (): Promise<number> => {
    const factory = getFactoryRead();
    if (!factory) return 0;
    try {
      const total: bigint = await factory.campaignsCount();
      return Number(total ?? 0n);
    } catch (error) {
      if (isDecodeResultError(error)) {
        console.warn("[launchpadClient] campaignsCount unavailable for configured factory; using DB campaign feed", error);
        return 0;
      }
      throw error;
    }
  }, [getFactoryRead]);

  const fetchCampaignPage = useCallback(async (offset: number, limit: number, opts?: FetchCampaignPageOptions): Promise<CampaignInfo[]> => {
    const factory = getFactoryRead();
    if (!factory || !factoryAddress) return [];

    const total = await fetchCampaignsCount();
    if (total <= 0) return [];

    const safeLimit = Math.max(1, Math.min(50, Number(limit ?? 24)));
    const safeOffset = Math.max(0, Math.min(total, Number(offset ?? 0)));
    let page: any[] = [];

    try {
      page = await factory.getCampaignPage(safeOffset, safeLimit);
    } catch (error) {
      if (!isDecodeResultError(error)) throw error;
      const legacyFactory = new Contract(factoryAddress, LEGACY_FACTORY_ABI, readProvider) as any;
      page = await legacyFactory.getCampaignPage(safeOffset, safeLimit);
    }

    const mapped = (page ?? []).map((c: any, idx: number) => mapOnChainCampaign(c, idx, safeOffset, Number(activeChainId)));
    return opts?.newestFirst ?? true ? mapped.slice().reverse() : mapped;
  }, [getFactoryRead, fetchCampaignsCount, factoryAddress, readProvider, activeChainId]);

  const fetchCampaignLogoURI = useCallback(async (campaignAddress: string): Promise<string | null> => {
    const campaign = getCampaignRead(campaignAddress);
    if (!campaign) return null;
    try {
      const uri = await campaign.logoURI();
      const s = uri != null ? String(uri).trim() : "";
      return s || null;
    } catch {
      return null;
    }
  }, [getCampaignRead]);

  const fetchCampaigns = useCallback(async (): Promise<CampaignInfo[]> => {
    const chainId = Number(activeChainId || 56);
    const db = await fetchDbCampaigns(chainId);
    if (isSolanaChainId(activeChainId) || !ENABLE_ONCHAIN_CAMPAIGN_FALLBACK) return db;

    try {
      const total = await fetchCampaignsCount();
      const limit = Math.min(total, 25);
      const offset = Math.max(0, total - limit);
      const onChain = limit > 0 ? await fetchCampaignPage(offset, limit, { newestFirst: true }) : [];
      return mergeCampaigns(onChain, db);
    } catch (error) {
      console.warn("[launchpadClient] on-chain campaign page failed; using DB campaigns", error);
      return db;
    }
  }, [activeChainId, fetchCampaignsCount, fetchCampaignPage]);

  const fetchCampaignMetrics = useCallback(async (campaignAddress: string): Promise<CampaignMetrics | null> => {
    const campaign = getCampaignRead(campaignAddress);
    if (!campaign) return null;

    const [
      sold,
      curveSupply,
      liquiditySupply,
      creatorReserve,
      basePrice,
      priceSlope,
      graduationTarget,
      liquidityBps,
      protocolFeeBps,
      currentPrice,
    ] = await Promise.all([
      campaign.sold(),
      campaign.curveSupply(),
      campaign.liquiditySupply(),
      campaign.creatorReserve(),
      campaign.basePrice(),
      campaign.priceSlope(),
      campaign.graduationTarget(),
      campaign.liquidityBps(),
      campaign.protocolFeeBps(),
      campaign.currentPrice(),
    ]);

    const [launched, finalizedAt] = await Promise.all([
      campaign.launched().catch(() => false),
      campaign.finalizedAt().catch(() => 0n),
    ]);

    return { sold, curveSupply, liquiditySupply, creatorReserve, basePrice, priceSlope, graduationTarget, liquidityBps, protocolFeeBps, currentPrice, launched, finalizedAt };
  }, [getCampaignRead]);

  const fetchCampaignActivity = useCallback(async (campaignAddress: string): Promise<CampaignActivity | null> => {
    const campaign = getCampaignRead(campaignAddress);
    if (!campaign) return null;
    const latest = await readProvider.getBlockNumber().catch(() => 0);

    try {
      const [buyersCount, totalBuyVolumeWei, totalSellVolumeWei] = await Promise.all([
        campaign.buyersCount(),
        campaign.totalBuyVolumeWei(),
        campaign.totalSellVolumeWei(),
      ]);
      return { buyers: Number(buyersCount), sellers: 0, buyVolumeWei: totalBuyVolumeWei as bigint, sellVolumeWei: totalSellVolumeWei as bigint, fromBlock: latest, toBlock: latest };
    } catch (error) {
      console.warn("[fetchCampaignActivity] counters unavailable", error);
      return null;
    }
  }, [getCampaignRead, readProvider]);

  const fetchCampaignSummary = useCallback(async (campaign: CampaignInfo): Promise<CampaignSummary> => {
    let metrics: CampaignMetrics | null = null;
    try {
      metrics = await fetchCampaignMetrics(campaign.campaign);
    } catch (error) {
      console.warn("[fetchCampaignSummary] metrics fetch failed", error);
    }

    let holders = "-";
    let volume = "-";
    let marketCap = "-";
    let marketCapBnb: number | undefined;

    try {
      const activity = await fetchCampaignActivity(campaign.campaign);
      if (activity) {
        holders = String(activity.buyers);
        volume = formatBnbFromWei(activity.buyVolumeWei + activity.sellVolumeWei);
      }
    } catch {
      // best effort
    }

    try {
      if (metrics && campaign.token) {
        const tokenAddress = normalizeAddress(campaign.token);
        if (tokenAddress) {
          const token = new Contract(tokenAddress, TOKEN_ABI, readProvider) as any;
          const totalSupply: bigint = await token.totalSupply();
          const circulating = metrics.launched ? totalSupply : metrics.sold;
          const mcWei = (metrics.currentPrice * circulating) / 10n ** 18n;
          marketCap = formatBnbFromWei(mcWei);
          const raw = Number(ethers.formatEther(mcWei));
          if (Number.isFinite(raw) && raw > 0) marketCapBnb = raw;
        }
      }
    } catch (error) {
      console.warn("[fetchCampaignSummary] market cap calc failed", error);
    }

    return { campaign, metrics, stats: { holders, volume, marketCap, marketCapBnb } };
  }, [fetchCampaignActivity, fetchCampaignMetrics, readProvider]);

  const fetchCampaignCardStats = useCallback(async (campaign: CampaignInfo): Promise<CampaignCardStats> => {
    const summary = await fetchCampaignSummary(campaign);
    return summary.stats;
  }, [fetchCampaignSummary]);

  const createCampaign = useCallback(async (params: CreateCampaignParams) => {
    const writer = getFactoryWrite();
    if (!writer) throw new Error("Wallet not connected");
    if (!wallet.account) throw new Error("Wallet not connected");
    if (!factoryAddress) throw new Error(`Factory address missing for chain ${evmReadChainId}`);

    const campaignRequest: CampaignRequestPayload = {
      name: params.name,
      symbol: params.symbol,
      logoURI: params.logoURI,
      xAccount: params.xAccount,
      website: params.website,
      extraLink: params.extraLink,
    };

    await fetchLaunchpadCreatePreflight(wallet.account, activeChainId);
    const authResponse = await requestCreateAuthorization({
      walletAddress: wallet.account,
      chainId: Number(activeChainId),
      factoryAddress,
      campaignRequest,
    });
    const auth = authResponse.authorization;

    const tx = await writer.createCampaignAuthorized(
      campaignRequest,
      {
        tradeRouteProfile: auth.tradeRouteProfileId,
        finalizeRouteProfile: auth.finalizeRouteProfileId,
        deadline: Math.floor(new Date(auth.validUntil).getTime() / 1000),
        signature: auth.signature,
      },
      await legacyGasOverrides(signer, readProvider),
    );

    const receipt = await tx.wait();
    const created = extractCreatedCampaign(receipt);
    emitTxConfirmed({ kind: "create", chainId: activeChainId, txHash: receipt?.hash ?? tx?.hash, ...created });
    return Object.assign(receipt ?? {}, created);
  }, [getFactoryWrite, wallet.account, activeChainId, evmReadChainId, factoryAddress, signer, readProvider]);

  const buyTokens = useCallback(async (campaignAddress: string, amountWei: bigint, maxCostWei: bigint) => {
    const normalizedCampaign = normalizeAddress(campaignAddress);
    if (!normalizedCampaign) throw new Error("Invalid campaign address");
    if (!signer) throw new Error("Wallet not connected");
    if (!wallet.account) throw new Error("Wallet not connected");

    const campaign = new Contract(normalizedCampaign, CAMPAIGN_ABI, signer) as any;
    await fetchLaunchpadBuyPreflight(wallet.account, normalizedCampaign, activeChainId);
    const authResponse = await requestTradeAuthorization({
      walletAddress: wallet.account,
      campaignAddress: normalizedCampaign,
      chainId: Number(activeChainId),
      action: TRADE_AUTH_BUY_EXACT_TOKENS,
      amount: amountWei,
      limit: maxCostWei,
    });
    const auth = authResponse.authorization;

    const tx = await campaign.buyExactTokensAuthorized(
      amountWei,
      maxCostWei,
      auth.routeProfileId,
      Math.floor(new Date(auth.validUntil).getTime() / 1000),
      auth.signature,
      await legacyGasOverrides(signer, readProvider, { value: maxCostWei }),
    );
    const receipt = await tx.wait();
    emitTxConfirmed({ kind: "buy", chainId: activeChainId, campaignAddress: normalizedCampaign, txHash: receipt?.hash ?? tx?.hash });
    return receipt;
  }, [signer, wallet.account, activeChainId, readProvider]);

  const sellTokens = useCallback(async (campaignAddress: string, amountWei: bigint, minAmountWei: bigint) => {
    const normalizedCampaign = normalizeAddress(campaignAddress);
    if (!normalizedCampaign) throw new Error("Invalid campaign address");
    if (!signer) throw new Error("Wallet not connected");
    if (!wallet.account) throw new Error("Wallet not connected");

    const campaign = new Contract(normalizedCampaign, CAMPAIGN_ABI, signer) as any;
    await fetchLaunchpadSellPreflight(wallet.account, normalizedCampaign, activeChainId);
    const authResponse = await requestTradeAuthorization({
      walletAddress: wallet.account,
      campaignAddress: normalizedCampaign,
      chainId: Number(activeChainId),
      action: TRADE_AUTH_SELL_EXACT_TOKENS,
      amount: amountWei,
      limit: minAmountWei,
    });
    const auth = authResponse.authorization;

    const tx = await campaign.sellExactTokensAuthorized(
      amountWei,
      minAmountWei,
      auth.routeProfileId,
      Math.floor(new Date(auth.validUntil).getTime() / 1000),
      auth.signature,
      await legacyGasOverrides(signer, readProvider),
    );
    const receipt = await tx.wait();
    emitTxConfirmed({ kind: "sell", chainId: activeChainId, campaignAddress: normalizedCampaign, txHash: receipt?.hash ?? tx?.hash });
    return receipt;
  }, [signer, wallet.account, activeChainId, readProvider]);

  const finalizeCampaign = useCallback(async (campaignAddress: string, minTokens: bigint, minBnb: bigint) => {
    const normalizedCampaign = normalizeAddress(campaignAddress);
    if (!normalizedCampaign) throw new Error("Invalid campaign address");
    if (!signer) throw new Error("Wallet not connected");
    const campaign = new Contract(normalizedCampaign, GRADUATION_WRITE_ABI, signer) as any;
    const tx = await campaign.graduateIfEligible(minTokens, minBnb, await legacyGasOverrides(signer, readProvider));
    const receipt = await tx.wait();
    emitTxConfirmed({ kind: "finalize", chainId: activeChainId, campaignAddress: normalizedCampaign, txHash: receipt?.hash ?? tx?.hash });
    return receipt;
  }, [signer, activeChainId, readProvider]);

  const getSafetyStatus = useCallback(() => getBnbLaunchpadSafetyStatus({
    chainId: activeChainId,
    factoryAddress,
    hasSigner: Boolean(signer),
    hasAccount: Boolean(wallet.account),
    walletChainId,
    contractReadiness: bnbReadiness,
  }), [activeChainId, factoryAddress, signer, wallet.account, walletChainId, bnbReadiness]);

  const bnbAdapter = useMemo<LaunchpadAdapter>(() => ({
    adapterId: "bnb",
    protocolStatus: factoryAddress && bnbReadiness.ready ? "ready" : "unavailable",
    fetchCampaignsCount,
    fetchCampaignPage,
    fetchCampaigns,
    fetchCampaignLogoURI,
    fetchCampaignMetrics,
    fetchCampaignCardStats,
    fetchCampaignActivity,
    fetchCampaignSummary,
    createCampaign,
    buyTokens,
    sellTokens,
    finalizeCampaign,
    getSafetyStatus,
    walletProvider,
    activeChainId,
    factoryAddress,
  }), [
    factoryAddress,
    bnbReadiness.ready,
    fetchCampaignsCount,
    fetchCampaignPage,
    fetchCampaigns,
    fetchCampaignLogoURI,
    fetchCampaignMetrics,
    fetchCampaignCardStats,
    fetchCampaignActivity,
    fetchCampaignSummary,
    createCampaign,
    buyTokens,
    sellTokens,
    finalizeCampaign,
    getSafetyStatus,
    walletProvider,
    activeChainId,
  ]);

  const solanaAdapter = useMemo<LaunchpadAdapter>(() => createSolanaLaunchpadAdapter({
    fetchCampaigns,
    walletProvider,
    hasSolanaWallet: Boolean(solanaAccount),
    solanaWalletName,
    solanaAccount,
  }), [fetchCampaigns, walletProvider, solanaAccount, solanaWalletName]);

  return isSolanaChainId(activeChainId) ? solanaAdapter : bnbAdapter;
}
