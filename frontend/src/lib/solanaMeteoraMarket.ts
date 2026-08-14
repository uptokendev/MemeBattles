import { Connection, PublicKey } from "@solana/web3.js";
import { AccountLayout } from "@solana/spl-token";

import { getPublicRpcUrl, SOLANA_CHAIN_ID } from "@/lib/chainConfig";

function shortAddr(address: string): string {
  return address && address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function accountAddress(value: PublicKey | string): string {
  return typeof value === "string" ? value : value.toBase58();
}

function decodeTokenOwner(data: Buffer | Uint8Array | undefined, fallback: string): string {
  if (!data || data.length < 64) return fallback;
  try {
    return new PublicKey(AccountLayout.decode(data as Buffer).owner).toBase58();
  } catch {
    try {
      return new PublicKey(data.subarray(32, 64)).toBase58();
    } catch {
      return fallback;
    }
  }
}

export type SolanaOnChainHolder = {
  address: string;
  label: string;
  pct: number;
  isLp: boolean;
};

export type SolanaOnChainHolderDistribution = {
  top: SolanaOnChainHolder[];
  othersPct: number;
  totalHolders: number;
  hasLp: boolean;
};

/**
 * Top SPL token accounts for a graduated mint. Pool vault is labeled as LP;
 * leftover campaign vault (if any) is called out separately.
 */
export async function fetchSolanaOnChainHolders(input: {
  mint: string;
  poolTokenVault?: string | null;
  campaignTokenVault?: string | null;
}): Promise<SolanaOnChainHolderDistribution> {
  const connection = new Connection(getPublicRpcUrl(SOLANA_CHAIN_ID), "confirmed");
  const mint = new PublicKey(input.mint);
  const [supplyRes, largest] = await Promise.all([
    connection.getTokenSupply(mint),
    connection.getTokenLargestAccounts(mint),
  ]);
  const totalRaw = BigInt(supplyRes.value.amount || "0");
  const accounts = (largest.value || []).filter((row) => {
    try {
      return BigInt(row.amount || "0") > 0n;
    } catch {
      return false;
    }
  });
  const infos = await connection.getMultipleAccountsInfo(
    accounts.map((row) => (typeof row.address === "string" ? new PublicKey(row.address) : row.address)),
  );
  const poolVault = String(input.poolTokenVault || "").trim();
  const curveVault = String(input.campaignTokenVault || "").trim();

  const rows: Array<{ address: string; amount: bigint; isLp: boolean; label: string }> = [];
  for (let i = 0; i < accounts.length; i += 1) {
    const acc = accounts[i];
    const amount = BigInt(acc.amount || "0");
    const accAddr = accountAddress(acc.address);
    const owner = decodeTokenOwner(infos[i]?.data, accAddr);
    const isLp = Boolean(poolVault && (accAddr === poolVault || owner === poolVault));
    const isCurve = Boolean(!isLp && curveVault && (accAddr === curveVault || owner === curveVault));
    rows.push({
      address: isLp ? "liquidity-pool" : owner,
      amount,
      isLp,
      label: isLp ? "Liquidity pool" : isCurve ? "Bonding vault" : shortAddr(owner),
    });
  }

  const pct = (bal: bigint) => (totalRaw > 0n ? Number((bal * 10000n) / totalRaw) / 100 : 0);
  const lp = rows.filter((row) => row.isLp);
  const users = rows
    .filter((row) => !row.isLp)
    .sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));
  const topUsers = users.slice(0, 6);
  const othersBal = users.slice(6).reduce((acc, row) => acc + row.amount, 0n);

  return {
    top: [
      ...lp.map((row) => ({
        address: row.address,
        label: row.label,
        pct: pct(row.amount),
        isLp: true as const,
      })),
      ...topUsers.map((row) => ({
        address: row.address,
        label: row.label,
        pct: pct(row.amount),
        isLp: false as const,
      })),
    ],
    othersPct: pct(othersBal),
    totalHolders: users.length,
    hasLp: lp.length > 0,
  };
}
