import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { requestNonce } from "@/lib/profileApi";
import {
  buildLeagueClaimMessage,
  fetchClaimableRewards,
  fetchMonthlyClaim,
  monthIdFromEpochStart,
  recordLeagueClaimTx,
  submitLeagueClaim,
  type RewardItem,
} from "@/lib/rewardsApi";

interface UseProfileRewardsArgs {
  activeTab: string;
  chainId?: number;
  account: string | null;
  isOwnProfile: boolean;
  wallet: any;
}

function rewardKey(reward: RewardItem) {
  return `${reward.period}:${reward.epochStart}:${reward.category}:${reward.rank}`;
}

export function useProfileRewards({
  activeTab,
  chainId,
  account,
  isOwnProfile,
  wallet,
}: UseProfileRewardsArgs) {
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [rewardsError, setRewardsError] = useState<string | null>(null);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);

  const loadRewards = useCallback(async () => {
    if (activeTab !== "rewards" || !chainId || !account || !isOwnProfile) {
      if (!isOwnProfile) setRewards([]);
      return;
    }

    setLoadingRewards(true);
    setRewardsError(null);
    try {
      const raw = await fetchClaimableRewards(chainId, account);
      const filtered: RewardItem[] = [];

      for (const reward of raw) {
        if (reward.period !== "monthly") {
          filtered.push(reward);
          continue;
        }

        try {
          const month = await fetchMonthlyClaim(
            chainId,
            monthIdFromEpochStart(reward.epochStart),
            account
          );
          const match = month.rewards.find(
            (item) =>
              item.category === reward.category && Number(item.rank) === Number(reward.rank)
          );

          if (!match?.claimed) {
            filtered.push({
              ...reward,
              payload: {
                ...(reward.payload ?? {}),
                monthlyTreasury: {
                  status: month.status,
                  isSealed: month.isSealed,
                  readyForClaims: month.reconciliation?.readyForClaims === true,
                  claimable: match?.claimable === true,
                },
              },
            });
          }
        } catch {
          // Keep the reward visible when reconciliation is temporarily unavailable.
          filtered.push(reward);
        }
      }

      setRewards(filtered);
    } catch (error: any) {
      setRewards([]);
      setRewardsError(error?.message || "Failed to load rewards.");
    } finally {
      setLoadingRewards(false);
    }
  }, [activeTab, chainId, account, isOwnProfile]);

  useEffect(() => {
    void loadRewards();
  }, [loadRewards]);

  const handleClaimPrize = useCallback(
    async (reward: RewardItem) => {
      if (!chainId || !account || !isOwnProfile) {
        toast.error("Connect the winning wallet to claim this prize.");
        return;
      }
      if (!wallet?.signer) {
        toast.error("Wallet signer is unavailable. Reconnect and try again.");
        return;
      }

      const key = rewardKey(reward);
      setClaimingKey(key);

      try {
        if (reward.period === "monthly") {
          const monthId = monthIdFromEpochStart(reward.epochStart);
          const monthly = await fetchMonthlyClaim(chainId, monthId, account);
          const claim = monthly.rewards.find(
            (item) =>
              item.category === reward.category && Number(item.rank) === Number(reward.rank)
          );

          if (claim?.claimed) {
            setRewards((current) => current.filter((item) => rewardKey(item) !== key));
            toast.success("This monthly prize was already claimed.");
            return;
          }
          if (!monthly.isSealed || !monthly.reconciliation?.readyForClaims) {
            throw new Error("This monthly league is not finalized for claims yet.");
          }
          if (!claim?.claimable) throw new Error("This monthly prize is not claimable.");

          const tx = await wallet.signer.sendTransaction({
            to: claim.transaction.to,
            data: claim.transaction.data,
            value: BigInt(claim.transaction.value || "0"),
          });
          await tx.wait();

          setRewards((current) => current.filter((item) => rewardKey(item) !== key));
          window.dispatchEvent(new CustomEvent("memebattles:league-claim-recorded"));
          toast.success("Monthly league prize claimed.");
          return;
        }

        const nonce = await requestNonce(chainId, account.toLowerCase());
        const message = buildLeagueClaimMessage({
          chainId,
          recipient: account,
          period: reward.period,
          epochStart: reward.epochStart,
          category: reward.category,
          rank: reward.rank,
          nonce,
        });
        const signature = await wallet.signer.signMessage(message);
        const prepared = await submitLeagueClaim({
          chainId,
          period: reward.period,
          epochStart: reward.epochStart,
          category: reward.category,
          rank: reward.rank,
          recipient: account,
          nonce,
          signature,
        });

        if ("mode" in prepared && prepared.mode === "merkle") {
          const treasury = new (await import("ethers")).ethers.Contract(
            prepared.vaultAddress,
            [
              "function claim(uint256 epochId, bytes32 categoryHash, uint8 rank, address recipient, uint256 amount, bytes32[] proof)",
            ],
            wallet.signer
          );
          const tx = await treasury.claim(
            prepared.epochId,
            prepared.categoryHash,
            prepared.rank,
            prepared.recipient,
            prepared.amountRaw,
            prepared.proof
          );
          await tx.wait();
          await recordLeagueClaimTx({
            chainId,
            period: reward.period,
            epochStart: reward.epochStart,
            category: reward.category,
            rank: reward.rank,
            recipient: account,
            nonce,
            signature,
            txHash: tx.hash,
          });
        }

        setRewards((current) => current.filter((item) => rewardKey(item) !== key));
        window.dispatchEvent(new CustomEvent("memebattles:league-claim-recorded"));
        toast.success("League prize claimed.");
      } catch (error: any) {
        toast.error(error?.shortMessage || error?.message || "Claim failed.");
      } finally {
        setClaimingKey(null);
      }
    },
    [chainId, account, isOwnProfile, wallet]
  );

  return {
    rewards,
    loadingRewards,
    rewardsError,
    claimingKey,
    handleClaimPrize,
    reloadRewards: loadRewards,
  };
}
