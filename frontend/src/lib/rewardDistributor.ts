import type { JsonRpcSigner } from "ethers";
import { buildRealtimeApiUrl } from "@/lib/realtimeApi";
import { signWalletAction, type WalletActionAuthPayload } from "@/lib/walletActionAuth";
import type { SolanaAirdropClaimCall } from "@/lib/solanaRewardClaim";

export const REWARD_DISTRIBUTOR_ABI = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "batchId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "hasClaimed",
    stateMutability: "view",
    inputs: [
      { name: "batchId", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "unclaimed",
    stateMutability: "view",
    inputs: [{ name: "batchId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "RewardClaimed",
    inputs: [
      { name: "batchId", type: "bytes32", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

export type RewardClaimConfig = {
  chainId: number;
  tokenSymbol: string;
  enabled: boolean;
  mode: "reward_distributor_merkle" | "solana_treasury" | "disabled";
  reason: string | null;
  distributorAddress: string;
  supportedRewardTypes?: string[];
};

export type EvmRewardClaimCall = {
  rewardLedgerId: string;
  chainId: number;
  tokenSymbol: string;
  mode: "reward_distributor_merkle";
  enabled: boolean;
  reason: string | null;
  distributorAddress: string;
  contractAddress: string;
  contractName: "RewardDistributor";
  functionName: "claim";
  functionSignature: "claim(bytes32,uint256,bytes32[])";
  contractBatchId: string;
  batchId: string;
  amount: string;
  proof: string[];
  args: [string, string, string[]];
  explorerTxBase: string;
};

export type RewardClaimCall = EvmRewardClaimCall | SolanaAirdropClaimCall;

export type RewardClaimIntent = {
  id: string;
  walletAddress: string;
  chainId: number;
  mode: "reward_distributor_merkle" | "solana_treasury";
  requiresWalletTransaction: true;
  calls: RewardClaimCall[];
};

const onchainConfirmedPending = new Set<string>();

async function parseJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || payload?.code || `Request failed (${response.status})`);
  return payload;
}

export async function fetchRewardClaimConfig(chainId: number): Promise<RewardClaimConfig> {
  const qs = new URLSearchParams({ chainId: String(chainId) });
  const response = await fetch(buildRealtimeApiUrl(`/api/rewards/claim-config?${qs.toString()}`));
  const payload = await parseJson(response);
  return payload.config as RewardClaimConfig;
}

type ClaimAuthOpts = {
  signer?: JsonRpcSigner | null;
  signMessage?: (message: string) => Promise<string>;
  auth?: WalletActionAuthPayload | null;
};

async function maybeSignClaimAuth(
  action: "claim_intent" | "claim_record",
  params: { walletAddress?: string; chainId?: number | null },
  opts?: ClaimAuthOpts,
): Promise<WalletActionAuthPayload | null> {
  if (opts?.auth) return opts.auth;
  const wallet = String(params.walletAddress || "").trim();
  const chainId = Number(params.chainId || 56);
  if (!wallet || (!opts?.signer && !opts?.signMessage)) return null;
  try {
    return await signWalletAction({
      action,
      walletAddress: wallet,
      chainId: Number.isFinite(chainId) && chainId > 0 ? chainId : 56,
      signer: opts?.signer,
      signMessage: opts?.signMessage,
    });
  } catch (error) {
    console.warn(`[rewardDistributor] ${action} sign skipped:`, error);
    return null;
  }
}

export async function createRewardClaimIntent(params: {
  walletAddress: string;
  chainId?: number | null;
  rewardLedgerIds: string[];
  signer?: JsonRpcSigner | null;
  signMessage?: (message: string) => Promise<string>;
  auth?: WalletActionAuthPayload | null;
}): Promise<RewardClaimIntent> {
  const auth = await maybeSignClaimAuth("claim_intent", params, params);
  const response = await fetch(buildRealtimeApiUrl("/api/rewards/me/claim-intent"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress: params.walletAddress,
      address: params.walletAddress,
      chainId: params.chainId ?? null,
      rewardLedgerIds: params.rewardLedgerIds,
      ...(auth || {}),
      auth: auth || undefined,
    }),
  });
  const payload = await parseJson(response);
  return payload.claimIntent as RewardClaimIntent;
}

export async function recordRewardClaimTx(params: {
  walletAddress: string;
  chainId?: number | null;
  rewardLedgerIds: string[];
  claimIntentId?: string | null;
  txHash: string;
  signer?: JsonRpcSigner | null;
  signMessage?: (message: string) => Promise<string>;
  auth?: WalletActionAuthPayload | null;
}) {
  const auth = await maybeSignClaimAuth("claim_record", params, params);
  try {
    const response = await fetch(buildRealtimeApiUrl("/api/rewards/me/claim-record"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        walletAddress: params.walletAddress,
        address: params.walletAddress,
        chainId: params.chainId ?? null,
        rewardLedgerIds: params.rewardLedgerIds,
        claimIntentId: params.claimIntentId || null,
        txHash: params.txHash,
        status: "claimed",
        reason: "Wallet claim transaction confirmed",
        ...(auth || {}),
        auth: auth || undefined,
      }),
    });
    const payload = await parseJson(response);
    params.rewardLedgerIds.forEach((id) => onchainConfirmedPending.delete(String(id)));
    return [payload];
  } catch (error) {
    // The wallet transaction is already confirmed before this function is called.
    // Never let the UI downgrade that entitlement to `failed`: doing so could invite
    // a second submission while the chain receipt already prevents/reports a claim.
    params.rewardLedgerIds.forEach((id) => onchainConfirmedPending.add(String(id)));
    const detail = String((error as any)?.message || error || "dashboard write failed");
    throw new Error(`Claim confirmed on-chain, but dashboard reconciliation is pending. Do not submit another claim. ${detail}`);
  }
}

export async function recordRewardClaimFailure(params: {
  walletAddress?: string;
  chainId?: number | null;
  rewardLedgerIds: string[];
  claimIntentId?: string | null;
  error: string;
  signer?: JsonRpcSigner | null;
  signMessage?: (message: string) => Promise<string>;
  auth?: WalletActionAuthPayload | null;
}) {
  const hasConfirmedPending = params.rewardLedgerIds.some((id) => onchainConfirmedPending.has(String(id)));
  if (hasConfirmedPending) {
    return [{
      ok: false,
      reconciliationPending: true,
      reason: "On-chain transaction confirmed; preserving claim_pending until the server reconciles it.",
    }];
  }

  const auth = params.walletAddress
    ? await maybeSignClaimAuth("claim_record", params, params)
    : null;
  const response = await fetch(buildRealtimeApiUrl("/api/rewards/me/claim-record"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress: params.walletAddress || undefined,
      address: params.walletAddress || undefined,
      chainId: params.chainId ?? null,
      rewardLedgerIds: params.rewardLedgerIds,
      claimIntentId: params.claimIntentId || null,
      status: "failed",
      claimError: params.error,
      reason: "Wallet claim transaction failed",
      ...(auth || {}),
      auth: auth || undefined,
    }),
  });
  return [await parseJson(response)];
}
