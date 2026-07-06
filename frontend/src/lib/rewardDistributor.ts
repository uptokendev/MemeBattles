import { buildRealtimeApiUrl } from "@/lib/realtimeApi";

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
  mode: "reward_distributor_merkle" | "disabled";
  reason: string | null;
  distributorAddress: string;
};

export type RewardClaimCall = {
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

export type RewardClaimIntent = {
  id: string;
  walletAddress: string;
  chainId: number;
  mode: "reward_distributor_merkle";
  requiresWalletTransaction: true;
  calls: RewardClaimCall[];
};

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

export async function createRewardClaimIntent(params: {
  walletAddress: string;
  chainId?: number | null;
  rewardLedgerIds: string[];
}): Promise<RewardClaimIntent> {
  const response = await fetch(buildRealtimeApiUrl("/api/rewards/me/claim-intent"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
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
}) {
  // Use the existing internal callback path until the public record endpoint is mounted.
  // It validates Solana-disabled behavior and updates the same reward ledger state.
  const results = [];
  for (const rewardLedgerId of params.rewardLedgerIds) {
    const response = await fetch(buildRealtimeApiUrl("/api/internal/rewards/batches"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "claim_completed",
        rewardLedgerId,
        txHash: params.txHash,
        reason: "Wallet claim transaction confirmed",
        metadata: { claimIntentId: params.claimIntentId || null, walletAddress: params.walletAddress, chainId: params.chainId ?? null },
      }),
    });
    results.push(await parseJson(response));
  }
  return results;
}

export async function recordRewardClaimFailure(params: {
  rewardLedgerIds: string[];
  claimIntentId?: string | null;
  error: string;
}) {
  const results = [];
  for (const rewardLedgerId of params.rewardLedgerIds) {
    const response = await fetch(buildRealtimeApiUrl("/api/internal/rewards/batches"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "claim_failed",
        rewardLedgerId,
        claimError: params.error,
        reason: "Wallet claim transaction failed",
        metadata: { claimIntentId: params.claimIntentId || null },
      }),
    });
    results.push(await parseJson(response));
  }
  return results;
}
