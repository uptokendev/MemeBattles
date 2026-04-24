import { Wallet, getBytes, solidityPackedKeccak256 } from "ethers";
import { ENV } from "../env.js";
import { getWalletAttributionState, type WalletAttributionState } from "./attribution.js";

export const ROUTE_PROFILE_IDS = {
  standard_linked: 0,
  standard_unlinked: 1,
  og_linked: 2,
} as const;

export type RouteProfileName = keyof typeof ROUTE_PROFILE_IDS;

export type WalletRouteSnapshot = {
  walletAddress: string;
  recruiterCode: string | null;
  recruiterStatus: string | null;
  recruiterIsOg: boolean;
  recruiterLinkState: WalletAttributionState["recruiterLinkState"];
  routeProfile: RouteProfileName;
  routeProfileId: number;
};

export type TradeRouteAuthorization = WalletRouteSnapshot & {
  chainId: number;
  campaignAddress: string;
  validUntil: string;
  signature: string;
};

export type CreateRouteAuthorization = {
  walletAddress: string;
  chainId: number;
  factoryAddress: string;
  tradeRouteProfile: RouteProfileName;
  tradeRouteProfileId: number;
  finalizeRouteProfile: RouteProfileName;
  finalizeRouteProfileId: number;
  recruiterCode: string | null;
  recruiterStatus: string | null;
  recruiterIsOg: boolean;
  recruiterLinkState: WalletAttributionState["recruiterLinkState"];
  validUntil: string;
  signature: string;
};

function normalizeAddress(value: unknown, label: string): string {
  const address = String(value ?? "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    throw new Error(`Invalid ${label}`);
  }
  return address;
}

function normalizeChainId(value: unknown): number {
  const chainId = Number(value ?? 0);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error("Invalid chainId");
  }
  return chainId;
}

function getSigner(): Wallet {
  const rawKey = String(ENV.ROUTE_AUTHORITY_PRIVATE_KEY || "").trim();
  if (!rawKey) {
    throw new Error("Route authorization signer is not configured");
  }
  return new Wallet(rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`);
}

function getValidUntil(validForSeconds?: number): Date {
  const ttl = Number.isFinite(validForSeconds) && Number(validForSeconds) > 0
    ? Math.min(Number(validForSeconds), 3600)
    : ENV.ROUTE_AUTH_SIGNATURE_TTL_SECONDS;
  return new Date(Date.now() + ttl * 1000);
}

function resolveRouteProfile(state: WalletAttributionState): RouteProfileName {
  if (state.recruiter && state.recruiter.status === "active") {
    return state.recruiter.isOg ? "og_linked" : "standard_linked";
  }
  return "standard_unlinked";
}

function buildSnapshot(state: WalletAttributionState): WalletRouteSnapshot {
  const routeProfile = resolveRouteProfile(state);
  return {
    walletAddress: state.walletAddress,
    recruiterCode: state.recruiter?.code ?? null,
    recruiterStatus: state.recruiter?.status ?? null,
    recruiterIsOg: Boolean(state.recruiter?.isOg),
    recruiterLinkState: state.recruiterLinkState,
    routeProfile,
    routeProfileId: ROUTE_PROFILE_IDS[routeProfile],
  };
}

export function getRouteAuthorityAddress(): string {
  return getSigner().address.toLowerCase();
}

export async function getWalletRouteSnapshot(walletAddress: string): Promise<WalletRouteSnapshot> {
  const state = await getWalletAttributionState(walletAddress);
  return buildSnapshot(state);
}

export async function createTradeRouteAuthorization(input: {
  walletAddress: string;
  campaignAddress: string;
  chainId: number;
  validForSeconds?: number;
}): Promise<TradeRouteAuthorization> {
  const signer = getSigner();
  const walletAddress = normalizeAddress(input.walletAddress, "walletAddress");
  const campaignAddress = normalizeAddress(input.campaignAddress, "campaignAddress");
  const chainId = normalizeChainId(input.chainId);
  const snapshot = await getWalletRouteSnapshot(walletAddress);
  const validUntil = getValidUntil(input.validForSeconds);
  const deadline = Math.floor(validUntil.getTime() / 1000);
  const digest = solidityPackedKeccak256(
    ["string", "uint256", "address", "address", "uint8", "uint64"],
    ["MWZ_ROUTE_TRADE_AUTH", BigInt(chainId), campaignAddress, walletAddress, snapshot.routeProfileId, BigInt(deadline)]
  );

  return {
    ...snapshot,
    chainId,
    campaignAddress,
    validUntil: validUntil.toISOString(),
    signature: await signer.signMessage(getBytes(digest)),
  };
}

export async function createCampaignRouteAuthorization(input: {
  walletAddress: string;
  factoryAddress: string;
  chainId: number;
  validForSeconds?: number;
}): Promise<CreateRouteAuthorization> {
  const signer = getSigner();
  const walletAddress = normalizeAddress(input.walletAddress, "walletAddress");
  const factoryAddress = normalizeAddress(input.factoryAddress, "factoryAddress");
  const chainId = normalizeChainId(input.chainId);
  const snapshot = await getWalletRouteSnapshot(walletAddress);
  const validUntil = getValidUntil(input.validForSeconds);
  const deadline = Math.floor(validUntil.getTime() / 1000);
  const digest = solidityPackedKeccak256(
    ["string", "uint256", "address", "address", "uint8", "uint8", "uint64"],
    [
      "MWZ_CREATE_ROUTE_AUTH",
      BigInt(chainId),
      factoryAddress,
      walletAddress,
      snapshot.routeProfileId,
      snapshot.routeProfileId,
      BigInt(deadline),
    ]
  );

  return {
    walletAddress,
    chainId,
    factoryAddress,
    tradeRouteProfile: snapshot.routeProfile,
    tradeRouteProfileId: snapshot.routeProfileId,
    finalizeRouteProfile: snapshot.routeProfile,
    finalizeRouteProfileId: snapshot.routeProfileId,
    recruiterCode: snapshot.recruiterCode,
    recruiterStatus: snapshot.recruiterStatus,
    recruiterIsOg: snapshot.recruiterIsOg,
    recruiterLinkState: snapshot.recruiterLinkState,
    validUntil: validUntil.toISOString(),
    signature: await signer.signMessage(getBytes(digest)),
  };
}
