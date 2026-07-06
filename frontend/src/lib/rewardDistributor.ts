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

export async function fetchRewardClaimConfig(chainId: number): Promise<RewardClaimConfig> {
  const qs = new URLSearchParams({ chainId: String(chainId) });
  const response = await fetch(`/api/rewards/claim-config?${qs.toString()}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Could not load reward claim config");
  return payload.config as RewardClaimConfig;
}

export async function createRewardClaimIntent(params: {
  walletAddress: string;
  chainId?: number;
  rewardLedgerIds: string[];
}): Promise<RewardClaimIntent> {
  const response = await fetch("/api/rewards/me/claim-intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || payload?.code || "Could not create reward claim intent");
  return payload.claimIntent as RewardClaimIntent;
}
