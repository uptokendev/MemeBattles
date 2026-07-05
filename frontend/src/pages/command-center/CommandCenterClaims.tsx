import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatEther } from "ethers";
import { Gift, Trophy, Users, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { RecruiterNativePayoutsPanel } from "@/components/command-center/RecruiterNativePayoutsPanel";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { fetchRewardClaims, fetchRewardHistory, prepareRewardClaim, type ClaimableReward } from "@/lib/rewardProgramsApi";

type RewardCardState = "claimable" | "pending" | "ineligible" | "locked" | "empty";

type RewardCardConfig = {
  title: string;
  description: string;
  icon: LucideIcon;
  buttonLabel: string;
  amountLabel: string;
  state: RewardCardState;
  action?: () => void;
  details?: ReactNode;
};

const NO_SQUAD_STATES = new Set(["", "none", "solo", "not_in_squad", "inactive", "unlinked", "missing"]);
const LAMPORTS_PER_SOL = 1_000_000_000;

function hasActiveSquad(value?: string | null) {
  return !NO_SQUAD_STATES.has(String(value || "").trim().toLowerCase());
}

function isSolana(chainId?: number | null) {
  return chainId === SOLANA_CHAIN_ID;
}

function formatNativeAmount(raw: string, chainId?: number | null) {
  try {
    if (isSolana(chainId)) {
      const value = Number(BigInt(raw || "0")) / LAMPORTS_PER_SOL;
      return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 });
    }
    const value = Number(formatEther(BigInt(raw || "0")));
    return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 });
  } catch {
    return "0";
  }
}

function addRaw(a: string, b: string) {
  try {
    return (BigInt(a || "0") + BigInt(b || "0")).toString();
  } catch {
    return String(Number(a || 0) + Number(b || 0));
  }
}

function shortenAddress(address: string) {
  if (!address) return "Unknown wallet";
  return address.length > 14 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function rewardRole(reward: ClaimableReward) {
  if (reward.role === "creator" || reward.program === "airdrop_creator") return "Creator";
  return "Trader";
}

function getAirdropState(claims: ClaimableReward[], loading: boolean): RewardCardState {
  if (loading) return "pending";
  if (claims.some((claim) => claim.status === "claimable" || claim.status === "failed")) return "claimable";
  return "empty";
}

function buildRewardCards({
  squadState,
  airdropClaims,
  loadingAirdrops,
  onPrepareAirdrop,
}: {
  squadState?: string | null;
  airdropClaims: ClaimableReward[];
  loadingAirdrops: boolean;
  onPrepareAirdrop: () => void;
}): RewardCardConfig[] {
  const airdropTotalRaw = airdropClaims.reduce((sum, item) => addRaw(sum, item.amountRaw), "0");
  const firstAirdrop = airdropClaims[0];
  const airdropSymbol = firstAirdrop?.tokenSymbol || (isSolana(firstAirdrop?.chainId) ? "SOL" : "BNB");
  const cards: RewardCardConfig[] = [
    {
      title: "League Rewards",
      description: "Rewards earned from weekly or monthly league placements will appear here.",
      icon: Trophy,
      buttonLabel: "Claim League Rewards",
      amountLabel: "0",
      state: "empty",
    },
    {
      title: "Airdrop Rewards",
      description: "Weekly airdrops for smaller active creators and traders connected to this wallet.",
      icon: Gift,
      buttonLabel: firstAirdrop?.claimExecutionEnabled ? "Prepare Claim" : "View Claim Details",
      amountLabel: airdropClaims.length ? `${formatNativeAmount(airdropTotalRaw, firstAirdrop?.chainId)} ${airdropSymbol}` : "0",
      state: getAirdropState(airdropClaims, loadingAirdrops),
      action: airdropClaims.length ? onPrepareAirdrop : undefined,
      details: airdropClaims.length ? (
        <div className="mt-4 space-y-2">
          {airdropClaims.slice(0, 3).map((reward) => (
            <div key={reward.rewardId} className="rounded-xl border border-border/50 bg-background/30 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-muted-foreground">{reward.epochLabel} - {rewardRole(reward)} - {shortenAddress(reward.walletAddress)}</span>
                <span className="shrink-0 font-retro text-foreground">{formatNativeAmount(reward.amountRaw, reward.chainId)} {reward.tokenSymbol}</span>
              </div>
              {reward.claimDisabledReason ? <p className="mt-1 text-[11px] text-muted-foreground">{reward.claimDisabledReason}</p> : null}
            </div>
          ))}
        </div>
      ) : null,
    },
  ];

  if (hasActiveSquad(squadState)) {
    cards.push({
      title: "Squad Rewards",
      description: "Squad rewards earned through your recruiter squad will appear here.",
      icon: Users,
      buttonLabel: "Claim Squad Rewards",
      amountLabel: "0",
      state: "empty",
    });
  }

  return cards;
}

function getRewardStateCopy(state: RewardCardState) {
  switch (state) {
    case "claimable":
      return {
        label: "Ready",
        amountCaption: "Available to claim",
        disabled: false,
      };
    case "pending":
      return {
        label: "Loading",
        amountCaption: "Checking rewards",
        disabled: true,
      };
    case "ineligible":
      return {
        label: "Not eligible",
        amountCaption: "Nothing available",
        disabled: true,
      };
    case "locked":
      return {
        label: "Locked",
        amountCaption: "Unlock required",
        disabled: true,
      };
    case "empty":
    default:
      return {
        label: "No rewards yet",
        amountCaption: "Available to claim",
        disabled: true,
      };
  }
}

export default function CommandCenterClaims() {
  const { attribution, walletAddress, chainId } = useCommandCenterData();
  const [airdropClaims, setAirdropClaims] = useState<ClaimableReward[]>([]);
  const [airdropHistory, setAirdropHistory] = useState<ClaimableReward[]>([]);
  const [loadingAirdrops, setLoadingAirdrops] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingAirdrops(true);
    setClaimMessage(null);

    Promise.all([
      fetchRewardClaims({ address: walletAddress, chainId, limit: 20 }),
      fetchRewardHistory({ address: walletAddress, chainId, limit: 20 }),
    ])
      .then(([claims, history]) => {
        if (cancelled) return;
        setAirdropClaims(claims.filter((item) => item.type === "airdrop"));
        setAirdropHistory(history.filter((item) => item.type === "airdrop"));
      })
      .catch((err: any) => {
        if (!cancelled) setClaimMessage(String(err?.message || err || "Unable to load airdrop rewards"));
      })
      .finally(() => {
        if (!cancelled) setLoadingAirdrops(false);
      });

    return () => {
      cancelled = true;
    };
  }, [walletAddress, chainId]);

  const handlePrepareAirdrop = () => {
    const reward = airdropClaims.find((item) => item.claimExecutionEnabled) || airdropClaims[0];
    if (!reward) return;
    setClaimMessage(null);
    void prepareRewardClaim({ rewardId: reward.rewardId, id: reward.id, address: walletAddress, chainId })
      .then((payload) => {
        const fn = payload?.transaction?.functionName || "claim";
        setClaimMessage(`Claim data ready for ${fn}. Submit the wallet transaction from the connected BNB wallet.`);
      })
      .catch((err: any) => setClaimMessage(String(err?.message || err || "Claim is not ready yet")));
  };

  const rewardCards = useMemo(() => buildRewardCards({
    squadState: attribution?.squadState,
    airdropClaims,
    loadingAirdrops,
    onPrepareAirdrop: handlePrepareAirdrop,
  }), [attribution?.squadState, airdropClaims, loadingAirdrops]);

  return (
    <div className="space-y-4">
      <CommandCenterCard title="Your Rewards">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {rewardCards.map((card) => {
            const Icon = card.icon;
            const stateCopy = getRewardStateCopy(card.state);
            return (
              <div key={card.title} className="rounded-2xl border border-border/50 bg-background/25 p-4">
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
                    <div className="font-retro text-2xl text-foreground">{card.amountLabel}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{stateCopy.amountCaption}</div>
                  </div>
                  <Button disabled={stateCopy.disabled} onClick={card.action} className="font-retro">
                    {card.buttonLabel}
                  </Button>
                </div>
                {card.details}
              </div>
            );
          })}
        </div>
        {claimMessage ? (
          <div className="mt-4 rounded-2xl border border-border/60 bg-background/30 p-3 text-sm text-muted-foreground">
            {claimMessage}
          </div>
        ) : null}
      </CommandCenterCard>

      {airdropHistory.length ? (
        <CommandCenterCard title="Airdrop History">
          <div className="space-y-2">
            {airdropHistory.map((reward) => (
              <div key={`${reward.rewardId}:${reward.txHash || reward.claimedAt || "history"}`} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/25 px-3 py-2 text-sm">
                <span className="truncate text-muted-foreground">{reward.epochLabel} - {reward.status}</span>
                <span className="shrink-0 font-retro text-foreground">{formatNativeAmount(reward.amountRaw, reward.chainId)} {reward.tokenSymbol}</span>
              </div>
            ))}
          </div>
        </CommandCenterCard>
      ) : null}

      <RecruiterNativePayoutsPanel />
    </div>
  );
}
