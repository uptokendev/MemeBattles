import { useEffect, useMemo, useState } from "react";
import { Contract, formatEther } from "ethers";
import { Gift, Trophy, Users, Swords, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { useWallet } from "@/contexts/WalletContext";
import { SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { fetchRewardClaims, type RewardLedgerItem } from "@/lib/rewardProgramsApi";
import {
  REWARD_DISTRIBUTOR_ABI,
  createRewardClaimIntent,
  recordRewardClaimFailure,
  recordRewardClaimTx,
} from "@/lib/rewardDistributor";

type RewardCardState = "claimable" | "pending" | "failed" | "expired" | "empty";

type RewardCardConfig = {
  rewardType: string;
  title: string;
  description: string;
  icon: LucideIcon;
  buttonLabel: string;
  amountLabel: string;
  state: RewardCardState;
  items: RewardLedgerItem[];
};

const NO_SQUAD_STATES = new Set(["", "none", "solo", "not_in_squad", "inactive", "unlinked", "missing"]);
const LAMPORTS_PER_SOL = 1_000_000_000;

const REWARD_COPY: Record<string, { title: string; description: string; icon: LucideIcon }> = {
  league: {
    title: "League Rewards",
    description: "Rewards earned from weekly or monthly league placements.",
    icon: Trophy,
  },
  airdrop: {
    title: "Airdrop Rewards",
    description: "Airdrop rewards connected to this wallet.",
    icon: Gift,
  },
  recruiter: {
    title: "Recruiter Rewards",
    description: "Rewards earned through recruiter activity.",
    icon: Users,
  },
  squad: {
    title: "Squad Rewards",
    description: "Squad rewards earned through your recruiter squad.",
    icon: Users,
  },
  battle: {
    title: "Battle Rewards",
    description: "Rewards earned from battle participation.",
    icon: Swords,
  },
  tournament: {
    title: "Tournament Rewards",
    description: "Tournament rewards connected to this wallet.",
    icon: Trophy,
  },
  campaign: {
    title: "Campaign Rewards",
    description: "Campaign rewards connected to this wallet.",
    icon: Gift,
  },
  manual: {
    title: "Manual Rewards",
    description: "Manual rewards assigned by the MemeWarzone team.",
    icon: Gift,
  },
  future: {
    title: "Future Rewards",
    description: "Future reward programs will appear here.",
    icon: Gift,
  },
};

function hasActiveSquad(value?: string | null) {
  const state = String(value || "").trim().toLowerCase();
  if (state.includes("self_recruiter")) return false;
  return !NO_SQUAD_STATES.has(state);
}

function isSolana(chainId?: number | null) {
  return chainId === SOLANA_CHAIN_ID;
}

function formatNativeAmount(raw: string, chainId?: number | null, symbol?: string | null) {
  try {
    if (isSolana(chainId)) {
      const value = Number(BigInt(raw || "0")) / LAMPORTS_PER_SOL;
      return `${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 })} ${symbol || "SOL"}`;
    }
    const value = Number(formatEther(BigInt(raw || "0")));
    return `${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 })} ${symbol || "BNB"}`;
  } catch {
    return `0 ${symbol || (isSolana(chainId) ? "SOL" : "BNB")}`;
  }
}

function amountSum(items: RewardLedgerItem[]) {
  return items.reduce((sum, item) => {
    try {
      return sum + BigInt(item.amount || "0");
    } catch {
      return sum;
    }
  }, 0n);
}

function rewardState(items: RewardLedgerItem[]): RewardCardState {
  if (items.some((item) => item.status === "claimable")) return "claimable";
  if (items.some((item) => item.status === "claim_pending")) return "pending";
  if (items.some((item) => item.status === "failed")) return "failed";
  if (items.some((item) => item.status === "expired")) return "expired";
  return "empty";
}

function getRewardStateCopy(state: RewardCardState, solanaDisabled: boolean) {
  if (solanaDisabled && state === "claimable") {
    return { label: "Tracked", amountCaption: "Solana claiming disabled", disabled: true };
  }
  switch (state) {
    case "claimable":
      return { label: "Ready", amountCaption: "Available to claim", disabled: false };
    case "pending":
      return { label: "Pending", amountCaption: "Claim in progress", disabled: true };
    case "failed":
      return { label: "Failed", amountCaption: "Retry available", disabled: false };
    case "expired":
      return { label: "Expired", amountCaption: "Claim window closed", disabled: true };
    case "empty":
    default:
      return { label: "No rewards yet", amountCaption: "Available to claim", disabled: true };
  }
}

function hasRecruiterAccess(recruiterLinkState?: string | null) {
  const state = String(recruiterLinkState || "").trim().toLowerCase();
  return state.includes("self_recruiter") || state.includes("recruiter_wallet") || state.includes("recruiter_owner");
}

function buildRewardCards(items: RewardLedgerItem[], squadState?: string | null, recruiterLinkState?: string | null): RewardCardConfig[] {
  const grouped = new Map<string, RewardLedgerItem[]>();
  for (const item of items) {
    const type = String(item.rewardType || "future").toLowerCase();
    if (type === "squad" && !hasActiveSquad(squadState)) continue;
    if (type === "recruiter" && !hasRecruiterAccess(recruiterLinkState)) continue;
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type)!.push(item);
  }

  const baseline = ["league", "airdrop"];
  if (hasRecruiterAccess(recruiterLinkState)) baseline.push("recruiter");
  if (hasActiveSquad(squadState)) baseline.push("squad");

  const orderedTypes = Array.from(new Set([...baseline, ...grouped.keys()]));
  return orderedTypes.map((rewardType) => {
    const copy = REWARD_COPY[rewardType] || REWARD_COPY.future;
    const groupItems = grouped.get(rewardType) || [];
    const first = groupItems[0];
    const state = rewardState(groupItems);
    return {
      rewardType,
      title: copy.title,
      description: copy.description,
      icon: copy.icon,
      buttonLabel: state === "failed" ? "Retry Claim" : `Claim ${copy.title}`,
      amountLabel: formatNativeAmount(String(amountSum(groupItems)), first?.chainId, first?.tokenSymbol),
      state,
      items: groupItems,
    };
  });
}

export default function CommandCenterClaims() {
  const { attribution, chainId, walletAddress } = useCommandCenterData();
  const wallet = useWallet();
  const [items, setItems] = useState<RewardLedgerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingType, setClaimingType] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadClaims = () => {
    setLoading(true);
    setMessage(null);
    void fetchRewardClaims({ walletAddress, chainId, limit: 100 })
      .then((next) => setItems(Array.isArray(next) ? next : []))
      .catch((err: any) => setMessage(String(err?.message || err || "Failed to load rewards")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadClaims();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, chainId]);

  const rewardCards = useMemo(
    () => buildRewardCards(items, attribution?.squadState, attribution?.recruiterLinkState),
    [items, attribution?.recruiterLinkState, attribution?.squadState],
  );

  async function claimRewards(card: RewardCardConfig) {
    const claimable = card.items.filter((item) => item.status === "claimable" || item.status === "failed");
    if (!claimable.length) return;

    if (claimable.some((item) => item.chainId === SOLANA_CHAIN_ID)) {
      setMessage("Solana rewards are tracked, but Solana claiming is not enabled yet.");
      return;
    }

    const signer = wallet?.signer;
    if (!signer) {
      setMessage("Connect your BNB wallet before claiming rewards.");
      try {
        window.dispatchEvent(new CustomEvent("memebattles:openWalletModal"));
      } catch {}
      return;
    }

    const activeAccount = String(wallet.account || "").toLowerCase();
    if (!activeAccount || activeAccount !== String(walletAddress || "").toLowerCase()) {
      setMessage("Connect the same wallet that owns these rewards before claiming.");
      return;
    }

    setClaimingType(card.rewardType);
    setMessage(null);
    const rewardLedgerIds = claimable.map((item) => item.id);
    let claimIntentId: string | null = null;
    const completed: string[] = [];

    try {
      const intent = await createRewardClaimIntent({ walletAddress, chainId, rewardLedgerIds });
      claimIntentId = intent.id;

      for (const call of intent.calls) {
        const contract = new Contract(call.contractAddress, REWARD_DISTRIBUTOR_ABI, signer);
        const toastId = toast.loading(`Confirm ${formatNativeAmount(call.amount, call.chainId, call.tokenSymbol)} claim in your wallet...`);
        try {
          const tx = await contract.claim(call.batchId, call.amount, call.proof);
          toast.dismiss(toastId);
          const waitToast = toast.loading("Waiting for claim confirmation...");
          try {
            await tx.wait();
          } finally {
            toast.dismiss(waitToast);
          }

          const txHash = String(tx.hash || "");
          await recordRewardClaimTx({ walletAddress, chainId, rewardLedgerIds: [call.rewardLedgerId], claimIntentId, txHash });
          completed.push(call.rewardLedgerId);
        } catch (err: any) {
          toast.dismiss(toastId);
          const reason = String(err?.shortMessage || err?.message || "Wallet claim transaction failed");
          await recordRewardClaimFailure({ rewardLedgerIds: [call.rewardLedgerId], claimIntentId, error: reason }).catch(() => {});
          throw err;
        }
      }

      const count = completed.length;
      setMessage(count === 1 ? `${card.title} claimed on-chain.` : `${count} ${card.title} claims completed on-chain.`);
      toast.success(count === 1 ? "Reward claimed." : `${count} rewards claimed.`);
      loadClaims();
    } catch (err: any) {
      setMessage(String(err?.shortMessage || err?.message || err || "Claim request failed"));
    } finally {
      setClaimingType(null);
    }
  }

  return (
    <div className="space-y-4">
      <CommandCenterCard title="Your Rewards">
        {message ? <div className="mb-3 rounded-xl border border-border/60 bg-background/30 p-3 text-sm text-muted-foreground">{message}</div> : null}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {rewardCards.map((card) => {
            const Icon = card.icon;
            const solanaDisabled = card.items.some((item) => item.chainId === SOLANA_CHAIN_ID);
            const stateCopy = getRewardStateCopy(card.state, solanaDisabled);
            return (
              <div key={card.rewardType} className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-retro text-sm text-foreground">
                      <Icon className="h-4 w-4 text-accent" />
                      {card.title}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{card.description}</p>
                  </div>
                  <span className="rounded-full border border-border/40 bg-card/25 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {stateCopy.label}
                  </span>
                </div>

                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <div className="font-retro text-2xl text-foreground">{loading ? "..." : card.amountLabel}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{stateCopy.amountCaption}</div>
                  </div>
                  <Button
                    disabled={stateCopy.disabled || claimingType === card.rewardType}
                    className="font-retro"
                    onClick={() => void claimRewards(card)}
                  >
                    {claimingType === card.rewardType ? "Claiming..." : card.buttonLabel}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CommandCenterCard>
    </div>
  );
}
