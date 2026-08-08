import { Contract, type Signer } from "ethers";
import PermanentLpLockerArtifact from "@/abi/PermanentLpLocker.json";
import { getBnbContractAddresses } from "@/lib/bnbContracts";
import type { SupportedChainId } from "@/lib/chainConfig";
import { isEvmChainId } from "@/lib/chainConfig";

const LOCKER_ABI = PermanentLpLockerArtifact.abi as any;

export type LpFeePoolRow = {
  chainId: number;
  campaignAddress: string;
  tokenAddress?: string | null;
  creatorAddress?: string | null;
  name?: string | null;
  symbol?: string | null;
  pairAddress?: string | null;
  marketStage?: string | null;
  fees?: {
    registered?: boolean;
    pairLabel?: string;
    token0Meta?: { symbol?: string };
    token1Meta?: { symbol?: string };
    unharvested?: {
      token0?: number;
      token1?: number;
      token0Display?: string;
      token1Display?: string;
      token0Symbol?: string;
      token1Symbol?: string;
      creatorShareToken0Display?: string;
      creatorShareToken1Display?: string;
      protocolShareToken0Display?: string;
      protocolShareToken1Display?: string;
    };
  } | null;
};

function normalizeApiBase(raw: string): string {
  let base = String(raw || "").trim().replace(/^['"]|['"]$/g, "").trim();
  if (!base) return "";
  if (base.startsWith("//")) base = `https:${base}`;
  if (!/^https?:\/\//i.test(base)) base = `https://${base.replace(/^\/+/, "")}`;
  try {
    const u = new URL(base);
    return `${u.protocol}//${u.host}`;
  } catch {
    return base.replace(/\/+$/, "").replace(/\/api$/i, "");
  }
}

/** Indexer base for market/fee APIs. */
export function getTokenIndexerBase(): string {
  return normalizeApiBase(
    String(
      import.meta.env.VITE_TOKEN_API_BASE ||
        import.meta.env.VITE_REALTIME_API_BASE ||
        import.meta.env.VITE_SECURITY_API_BASE ||
        import.meta.env.VITE_RAILWAY_TOKEN_API_BASE ||
        "",
    ),
  );
}

export function resolvePermanentLpLockerAddress(chainId: number): string {
  if (!isEvmChainId(chainId)) return "";
  const fromEnv = getBnbContractAddresses(chainId as SupportedChainId).permanentLpLocker;
  if (fromEnv) return fromEnv;
  // Clean-slate BSC testnet locker
  if (Number(chainId) === 97) return "0xb083929D2bbabdE7fc580090D5B18bbD918Fda9a";
  return "";
}

export async function fetchLpFeePools(input: {
  chainId: number;
  creatorAddress?: string | null;
  campaignAddress?: string | null;
  limit?: number;
}): Promise<{ lockerAddress: string | null; items: LpFeePoolRow[] }> {
  const chainId = Number(input.chainId || 97);
  // LP locker is BNB-only. Solana (101/102) and other chains have no EVM fee dashboard.
  if (chainId === 101 || chainId === 102 || !Number.isFinite(chainId) || chainId <= 0) {
    return { lockerAddress: null, items: [] };
  }
  const creator = String(input.creatorAddress || "").trim();
  if (creator && !/^0x[a-fA-F0-9]{40}$/.test(creator)) {
    return { lockerAddress: null, items: [] };
  }

  const base = getTokenIndexerBase();
  if (!base) throw new Error("Token indexer URL is not configured (VITE_TOKEN_API_BASE / VITE_REALTIME_API_BASE).");

  const qs = new URLSearchParams({
    chainId: String(chainId),
    limit: String(input.limit ?? 50),
  });
  if (input.campaignAddress) qs.set("campaign", String(input.campaignAddress).toLowerCase());
  if (creator) qs.set("creator", creator.toLowerCase());

  const res = await fetch(`${base}/api/dashboard/lp-fees?${qs.toString()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(String(json?.error || `LP fee fetch failed (${res.status})`));

  let items = Array.isArray(json?.items) ? (json.items as LpFeePoolRow[]) : [];
  // Server already filters by creator when provided; keep a client guard for mixed responses.
  const creator = String(input.creatorAddress || "").trim().toLowerCase();
  if (creator) {
    items = items.filter((it) => String(it.creatorAddress || "").toLowerCase() === creator);
  }
  return {
    lockerAddress: json?.lockerAddress ? String(json.lockerAddress).toLowerCase() : null,
    items,
  };
}

export function hasUnharvestedFees(row: LpFeePoolRow): boolean {
  const u = row.fees?.unharvested;
  if (!u) return false;
  return Number(u.token0 || 0) > 0 || Number(u.token1 || 0) > 0;
}

/**
 * Creator / user harvest path: connected wallet pays gas, fees push to creator (80%) + treasury (20%).
 * Anyone may call harvest(); only the fee recipient receives the creator share.
 */
export async function harvestLpFeesWithWallet(input: {
  chainId: number;
  pairAddress: string;
  signer: Signer;
  lockerAddress?: string | null;
}): Promise<{ txHash: string; lockerAddress: string; pairAddress: string }> {
  const pair = String(input.pairAddress || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(pair)) throw new Error("Invalid Topaz pair address.");

  const lockerAddress =
    String(input.lockerAddress || "").trim() || resolvePermanentLpLockerAddress(input.chainId);
  if (!/^0x[a-fA-F0-9]{40}$/.test(lockerAddress)) {
    throw new Error("Permanent LP locker address is not configured for this chain.");
  }

  const locker = new Contract(lockerAddress, LOCKER_ABI, input.signer);
  const tx = await locker.harvest(pair);
  const receipt = await tx.wait();
  return {
    txHash: String(receipt?.hash || tx.hash),
    lockerAddress: lockerAddress.toLowerCase(),
    pairAddress: pair,
  };
}
