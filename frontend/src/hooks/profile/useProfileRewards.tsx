import { useEffect, useState } from "react";
import { Contract } from "ethers";
import { toast } from "sonner";
import type { ProfileTab } from "@/types/profile";
import { getExplorerTxBase } from "@/lib/chainConfig";
import { requestNonce } from "@/lib/profileApi";
import {
  buildLeagueClaimMessage,
  fetchClaimableRewards,
  submitLeagueClaim,
  type RewardItem,
} from "@/lib/rewardsApi";

interface UseProfileRewardsArgs {
  activeTab: ProfileTab;
  chainId?: number;
  account: string | null;
  isOwnProfile: boolean;
  wallet: any;
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

  useEffect(() => {
    let cancelled = false;

    const loadRewards = async () => {
      if (activeTab !== "rewards") return;

      if (!chainId || !account || !isOwnProfile) {
        setRewards([]);
        return;
      }

      setLoadingRewards(true);
      setRewardsError(null);

      try {
        const items = await fetchClaimableRewards(chainId, account);
        if (!cancelled) setRewards(items);
      } catch (e: any) {
        const msg = String(e?.message ?? "Failed to load rewards");
        console.warn("Failed to load rewards", e);

        if (!cancelled) {
          setRewardsError(msg);
          setRewards([]);
        }
      } finally {
        if (!cancelled) setLoadingRewards(false);
      }
    };

    loadRewards();

    return () => {
      cancelled = true;
    };
  }, [activeTab, chainId, account, isOwnProfile]);

  const handleConnect = async () => {
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("memewarzone:openWalletModal"));
        return;
      }
    } catch {}

    if (typeof wallet?.connect === "function") return wallet.connect();
    if (typeof wallet?.openConnectModal === "function") return wallet.openConnectModal();

    toast.message("Use the Connect Wallet button in the header to connect.");
  };

  const handleClaimPrize = async (item: RewardItem) => {
    if (!account) {
      toast.error("Connect your wallet to claim.");
      handleConnect();
      return;
    }

    if (!chainId) {
      toast.error("ChainId is not available. Reconnect your wallet and try again.");
      return;
    }

    if (!wallet.signer) {
      toast.error("Wallet signer is not available. Reconnect your wallet and try again.");
      return;
    }

    if (!isOwnProfile) {
      toast.error("You can only claim from your own profile.");
      return;
    }

    const key = `${item.period}:${item.epochStart}:${item.category}:${item.rank}`;
    setClaimingKey(key);

    const toastId = toast.loading("Preparing claim…");

    try {
      const recipient = account.toLowerCase();
      const nonce = await requestNonce(chainId, recipient);

      toast.dismiss(toastId);

      const toastId2 = toast.loading("Confirm the signature in your wallet…");
      let signature = "";

      try {
        const msg = buildLeagueClaimMessage({
          chainId,
          recipient,
          period: item.period,
          epochStart: item.epochStart,
          category: item.category,
          rank: item.rank,
          nonce,
        });

        signature = await wallet.signer.signMessage(msg);
      } finally {
        toast.dismiss(toastId2);
      }

      const toastId3 = toast.loading("Submitting claim…");

      try {
        const r = await submitLeagueClaim({
          chainId,
          period: item.period,
          epochStart: item.epochStart,
          category: item.category,
          rank: item.rank,
          recipient,
          nonce,
          signature,
        });

        const alreadyTxHash = (r as any)?.txHash;

        if (
          alreadyTxHash &&
          typeof alreadyTxHash === "string" &&
          alreadyTxHash.startsWith("0x")
        ) {
          const href = `${getExplorerTxBase(chainId as any)}${alreadyTxHash}`;

          toast.success(
            <span>
              Paid!{" "}
              <a className="underline" href={href} target="_blank" rel="noreferrer">
                View tx
              </a>
            </span>
          );
        } else if ((r as any)?.mode === "merkle") {
          const payload = r as any;
          const vaultAddress = String(payload.vaultAddress);
          const epochId = payload.epochId;
          const categoryHash = String(payload.categoryHash);
          const amountRaw = payload.amountRaw;
          const proof = Array.isArray(payload.proof) ? payload.proof : [];

          const abi = [
            "function claim(uint256 epochId, bytes32 category, uint8 rank, address recipient, uint256 amount, bytes32[] proof) external",
          ];

          const vault = new Contract(vaultAddress, abi, wallet.signer);

          const toastIdTx = toast.loading("Confirm on-chain claim (gas fee) in your wallet…");
          let tx: any;

          try {
            tx = await vault.claim(epochId, categoryHash, item.rank, recipient, amountRaw, proof);
          } finally {
            toast.dismiss(toastIdTx);
          }

          const toastIdWait = toast.loading("Waiting for confirmation…");

          try {
            await tx.wait();
          } finally {
            toast.dismiss(toastIdWait);
          }

          const txHash = String(tx.hash || "");

          if (txHash && txHash.startsWith("0x")) {
            const href = `${getExplorerTxBase(chainId as any)}${txHash}`;

            toast.success(
              <span>
                Claimed!{" "}
                <a className="underline" href={href} target="_blank" rel="noreferrer">
                  View tx
                </a>
              </span>
            );
          } else {
            toast.success("Claimed on-chain.");
          }
        } else {
          toast.success("Claim prepared.");
        }
      } finally {
        toast.dismiss(toastId3);
      }

      setRewards((prev) =>
        prev.filter((r) => `${r.period}:${r.epochStart}:${r.category}:${r.rank}` !== key)
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Claim failed.");
    } finally {
      setClaimingKey(null);
      toast.dismiss(toastId);
    }
  };

  return {
    rewards,
    loadingRewards,
    rewardsError,
    claimingKey,
    handleClaimPrize,
  };
}