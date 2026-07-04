import { useCallback, useMemo } from "react";
import { Contract, ethers } from "ethers";
import LaunchFactoryArtifact from "@/abi/LaunchFactory.json";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { BNB_CHAIN_ID, getActiveChainId, getFactoryAddress, isSolanaChainId, SOLANA_CHAIN_ID, type SupportedChainId } from "@/lib/chainConfig";
import {
  fetchCampaignCreateAuthorization,
  fetchCampaignTradeAuthorization,
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

function envEnabled(value: unknown): boolean {
  return TRUE_VALUES.has(String(value || "").trim().toLowerCase());
}

const ENABLE_ONCHAIN_CAMPAIGN_FALLBACK = envEnabled(import.meta.env.VITE_ENABLE_ONCHAIN_CAMPAIGN_FALLBACK);

const toAbi = (x: any) => (x?.abi ?? x) as ethers.InterfaceAbi;
const FACTORY_ABI = toAbi(LaunchFactoryArtifact);
const CAMPAIGN_ABI = toAbi(LaunchCampaignArtifact);
const TOKEN_ABI = toAbi(LaunchTokenArtifact);

const LEGACY_FACTORY_ABI = [
  "function campaignsCount() view returns (uint256)",
  "function getCampaignPage(uint256 offset, uint256 limit) view returns ((address campaign,address token,address creator,string name,string symbol,string logoURI,string xAccount,string website,string extraLink,uint64 createdAt)[] page)",
] as const;

function normalizeAddress(value: unknown): string {
  const raw = String(value ?? "").trim();
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
  const address = String(tokenOrCampaignAddress || "").trim().toLowerCase();
  if (address && ethers.isAddress(address)) return `/api/token-metadata/${chainId}/${address}`;
  return "";
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

function mapDbCampaign(item: any, idx: number, chainId: number): CampaignInfo | null {
  const campaign = normalizeAddress(item?.campaignAddress ?? item?.campaign_address ?? item?.campaign);
  if (!campaign) return null;

  const token = normalizeAddress(item?.tokenAddress ?? item?.token_address ?? item?.token);
  const creator = normalizeAddress(item?.creatorAddress ?? item?.creator_address ?? item?.creator);

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
  const factoryAddress = useMemo(() => getFactoryAddress(evmReadChainId), [evmReadChainId]);
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
    if (!address) return null;
    return new Contract(address, CAMPAIGN_ABI, readProvider) as any;
  }, [readProvider]);

  const fetchCampaignsCount = useCallback(async (): Promise<number> => {
    const factory = getFactoryRead();
    if (!factory) return 0;
    const total: bigint = await factory.campaignsCount();
    return Number(total ?? 0n);
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
    const latest = await readProvider.getBlockNumber().catch(() => 0);
    const campaign = getCampaignRead(campaignAddress);
    if (!campaign) return null;

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
        const token = new Contract(campaign.token, TOKEN_ABI, readProvider) as any;
        const totalSupply: bigint = await token.totalSupply();
        const circulating = metrics.launched ? totalSupply : metrics.sold;
        const mcWei = (metrics.currentPrice * circulating) / 10n ** 18n;
        marketCap = formatBnbFromWei(mcWei);
        const raw = Number(ethers.formatEther(mcWei));
        if (Number.isFinite(raw) && raw > 0) marketCapBnb = raw;
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

    await fetchLaunchpadCreatePreflight(wallet.account, activeChainId);
    const authResponse = await fetchCampaignCreateAuthorization(wallet.account, activeChainId);
    const auth = authResponse.authorization;

    const tx = await writer.createCampaignAuthorized(
      {
        name: params.name,
        symbol: params.symbol,
        logoURI: params.logoURI,
        xAccount: params.xAccount,
        website: params.website,
        extraLink: params.extraLink,
        basePrice: params.basePriceWei ?? 0n,
        priceSlope: params.priceSlopeWei ?? 0n,
        graduationTarget: params.graduationTargetWei ?? 0n,
        lpReceiver: params.lpReceiver || ethers.ZeroAddress,
      },
      {
        tradeRouteProfile: auth.tradeRouteProfileId,
        finalizeRouteProfile: auth.finalizeRouteProfileId,
        deadline: Math.floor(new Date(auth.validUntil).getTime() / 1000),
        signature: auth.signature,
      },
      await legacyGasOverrides(signer, readProvider),
    );

    const receipt = await tx.wait();
    emitTxConfirmed({ kind: "create", chainId: activeChainId, txHash: receipt?.hash ?? tx?.hash });
    return receipt;
  }, [getFactoryWrite, wallet.account, activeChainId, signer, readProvider]);

  const buyTokens = useCallback(async (campaignAddress: string, amountWei: bigint, maxCostWei: bigint) => {
    if (!signer) throw new Error("Wallet not connected");
    if (!wallet.account) throw new Error("Wallet not connected");

    const campaign = new Contract(campaignAddress, CAMPAIGN_ABI, signer) as any;
    await fetchLaunchpadBuyPreflight(wallet.account, campaignAddress, activeChainId);
    const authResponse = await fetchCampaignTradeAuthorization(wallet.account, campaignAddress, activeChainId);
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
    emitTxConfirmed({ kind: "buy", chainId: activeChainId, campaignAddress: campaignAddress.toLowerCase(), txHash: receipt?.hash ?? tx?.hash });
    return receipt;
  }, [signer, wallet.account, activeChainId, readProvider]);

  const sellTokens = useCallback(async (campaignAddress: string, amountWei: bigint, minAmountWei: bigint) => {
    if (!signer) throw new Error("Wallet not connected");
    if (!wallet.account) throw new Error("Wallet not connected");

    const campaign = new Contract(campaignAddress, CAMPAIGN_ABI, signer) as any;
    await fetchLaunchpadSellPreflight(wallet.account, campaignAddress, activeChainId);
    const authResponse = await fetchCampaignTradeAuthorization(wallet.account, campaignAddress, activeChainId);
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
    emitTxConfirmed({ kind: "sell", chainId: activeChainId, campaignAddress: campaignAddress.toLowerCase(), txHash: receipt?.hash ?? tx?.hash });
    return receipt;
  }, [signer, wallet.account, activeChainId, readProvider]);

  const finalizeCampaign = useCallback(async (campaignAddress: string, minTokens: bigint, minBnb: bigint) => {
    if (!signer) throw new Error("Wallet not connected");
    const campaign = new Contract(campaignAddress, CAMPAIGN_ABI, signer) as any;
    const tx = await campaign.finalize(minTokens, minBnb, await legacyGasOverrides(signer, readProvider));
    const receipt = await tx.wait();
    emitTxConfirmed({ kind: "finalize", chainId: activeChainId, campaignAddress: campaignAddress.toLowerCase(), txHash: receipt?.hash ?? tx?.hash });
    return receipt;
  }, [signer, activeChainId, readProvider]);

  const getSafetyStatus = useCallback(() => getBnbLaunchpadSafetyStatus({
    chainId: activeChainId,
    factoryAddress,
    hasSigner: Boolean(signer),
    hasAccount: Boolean(wallet.account),
  }), [activeChainId, factoryAddress, signer, wallet.account]);

  const bnbAdapter = useMemo<LaunchpadAdapter>(() => ({
    adapterId: "bnb",
    protocolStatus: factoryAddress ? "ready" : "unavailable",
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
  }), [fetchCampaigns, walletProvider, solanaAccount, solanaWalletName]);

  return isSolanaChainId(activeChainId) ? solanaAdapter : bnbAdapter;
}
