import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/contexts/WalletContext";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { getActiveChainId, getVoteTreasuryAddress } from "@/lib/chainConfig";

// Client-side minimum guardrails (in addition to any on-chain minAmount)
// Requirement: minimum is 0.005 BNB OR ~$2 worth of BNB (whichever is higher).
const ABS_MIN_BNB = 0.005;
const USD_MIN = 2;

const UPVOTE_ABI = [
  "function voteWithBNB(address campaign, bytes32 meta) payable",
  "function assetConfig(address asset) view returns (bool enabled, uint256 minAmount)",
];

function safeLowerHex(s?: string | null): string {
  const v = String(s ?? "").trim();
  return v ? v.toLowerCase() : "";
}

type Props = {
  campaignAddress: string;
  className?: string;
  buttonVariant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  buttonSize?: "default" | "sm" | "lg" | "icon";
};

/**
 * Upvote Dialog (BNB-only for v1)
 * - Reads minAmount for native (address(0)) from the UPVoteTreasury contract
 * - Enforces a client-side minimum: max(0.005 BNB, ~$2 in BNB, on-chain minAmount)
 * - Sends one payable tx => one vote
 */
export function UpvoteDialog({
  campaignAddress,
  className,
  buttonVariant = "secondary",
  buttonSize = "sm",
}: Props) {
  const { toast } = useToast();
  const wallet = useWallet();
  const { price: priceUsd } = useBnbUsdPrice();

  const chainId = getActiveChainId(wallet.chainId);
  const treasuryAddress = useMemo(() => {
    return safeLowerHex(getVoteTreasuryAddress(chainId));
  }, [chainId]);

  const [open, setOpen] = useState(false);
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [minAmountWei, setMinAmountWei] = useState<bigint | null>(null);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [hasContractCode, setHasContractCode] = useState<boolean | null>(null);
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [estTotalWei, setEstTotalWei] = useState<bigint | null>(null);
  const [insufficient, setInsufficient] = useState<boolean>(false);
  const [amountBnb, setAmountBnb] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [touched, setTouched] = useState(false);

  // Prevent the dialog from closing while the wallet prompt / tx is in-flight.
  const lockDialog = submitting;

  const absMinWei = useMemo(() => {
    try {
      return ethers.parseEther(String(ABS_MIN_BNB));
    } catch {
      return 0n;
    }
  }, []);

  const usdMinWei = useMemo(() => {
    const p = Number(priceUsd ?? 0);
    if (!Number.isFinite(p) || p <= 0) return 0n;
    const bnb = USD_MIN / p;
    if (!Number.isFinite(bnb) || bnb <= 0) return 0n;
    try {
      // Use a string round-trip to avoid BigInt overflow/precision issues.
      return ethers.parseEther(bnb.toFixed(18));
    } catch {
      return 0n;
    }
  }, [priceUsd]);

  const effectiveMinWei = useMemo(() => {
    let m = minAmountWei ?? 0n;
    if (absMinWei > m) m = absMinWei;
    if (usdMinWei > m) m = usdMinWei;
    return m;
  }, [minAmountWei, absMinWei, usdMinWei]);

  const humanEffectiveMin = useMemo(() => {
    try {
      return ethers.formatEther(effectiveMinWei);
    } catch {
      return "—";
    }
  }, [effectiveMinWei]);

  const minUsdLabel = useMemo(() => {
    const p = Number(priceUsd ?? 0);
    if (!Number.isFinite(p) || p <= 0) return null;
    try {
      const minBnb = Number(ethers.formatEther(effectiveMinWei));
      if (!Number.isFinite(minBnb) || minBnb <= 0) return null;
      const usd = minBnb * p;
      if (!Number.isFinite(usd) || usd <= 0) return null;
      return `$${usd.toFixed(2)}`;
    } catch {
      return null;
    }
  }, [priceUsd, effectiveMinWei]);


// Load wallet BNB balance when dialog opens / account changes
useEffect(() => {
  if (!open) return;
  if (!wallet.provider) return;
  if (!wallet.account) {
    setBalanceWei(null);
    return;
  }
  let cancelled = false;
  (async () => {
    try {
      const bal = await wallet.provider.getBalance(wallet.account);
      if (cancelled) return;
      setBalanceWei(BigInt(bal));
    } catch {
      if (cancelled) return;
      setBalanceWei(null);
    }
  })();
  return () => {
    cancelled = true;
  };
}, [open, wallet.provider, wallet.account, chainId]);

  const amountWei = useMemo(() => {
    try {
      return ethers.parseEther(String(amountBnb || "0"));
    } catch {
      return null;
    }
  }, [amountBnb]);

  const tooLow = useMemo(() => {
    if (amountWei == null) return false;
    if (amountWei <= 0n) return false;
    return amountWei < effectiveMinWei;
  }, [amountWei, effectiveMinWei]);

  // When the dialog opens, allow a one-time prefill to the effective minimum.
  useEffect(() => {
    if (!open) return;
    setPrefilled(false);
    setTouched(false);
  }, [open]);

  // Load minAmount + enabled whenever dialog opens (or chain changes)
  useEffect(() => {
    if (!open) return;
    if (!treasuryAddress) {
      setMinAmountWei(null);
      setEnabled(false);
      setHasContractCode(null);
      return;
    }
    if (!wallet.provider) return;

    let cancelled = false;
    setLoadingCfg(true);
    (async () => {
      try {
        // Guardrail: if the address has no bytecode, the contract is not deployed on this chain.
        const code = await wallet.provider.getCode(treasuryAddress);
        const hasCode = code != null && code !== "0x";
        if (cancelled) return;
        setHasContractCode(hasCode);
        if (!hasCode) {
          setEnabled(false);
          setMinAmountWei(null);
          return;
        }

        const c = new ethers.Contract(treasuryAddress, UPVOTE_ABI, wallet.provider);
        const res = await c.assetConfig(ethers.ZeroAddress);
        // ethers v6 returns a Result: [enabled, minAmount] + named props
        const isEnabled = Boolean(res?.enabled ?? res?.[0]);
        const min = BigInt(res?.minAmount ?? res?.[1] ?? 0);
        if (cancelled) return;
        setEnabled(isEnabled);
        setMinAmountWei(min);
      } catch (e: any) {
        if (cancelled) return;
        setEnabled(false);
        setMinAmountWei(null);
        setHasContractCode(false);
      } finally {
        if (!cancelled) setLoadingCfg(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, treasuryAddress, wallet.provider]);

  // One-time prefill: set the input to the effective minimum when the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (touched) return;
    if (lockDialog) return;
    // If we haven't touched the input, keep it aligned with the effective minimum.
    if (amountWei != null && amountWei > 0n && amountWei < effectiveMinWei) {
      try {
        const v = Number(ethers.formatEther(effectiveMinWei));
        if (Number.isFinite(v) && v > 0) {
          setAmountBnb(v.toFixed(6));
          setPrefilled(true);
        }
      } catch {
        // ignore
      }
      return;
    }
    if (prefilled) return;
    if (amountBnb.trim() !== "") return;
    if (effectiveMinWei <= 0n) return;
    try {
      const v = Number(ethers.formatEther(effectiveMinWei));
      if (!Number.isFinite(v) || v <= 0) return;
      setAmountBnb(v.toFixed(6));
      setPrefilled(true);
    } catch {
      // ignore
    }
  }, [open, prefilled, touched, lockDialog, amountBnb, amountWei, effectiveMinWei]);

// Estimate total cost (value + gas) and mark insufficient balance.
useEffect(() => {
  if (!open) return;
  if (!wallet.provider) return;
  if (!wallet.account) return;
  if (!treasuryAddress) return;
  if (hasContractCode === false) return;
  if (!enabled) return;

  let cancelled = false;
  (async () => {
    try {
      // Parse value
      let valueWei: bigint = 0n;
      try {
        valueWei = ethers.parseEther(String(amountBnb || "0"));
      } catch {
        setEstTotalWei(null);
        setInsufficient(false);
        return;
      }
      if (valueWei <= 0n) {
        setEstTotalWei(null);
        setInsufficient(false);
        return;
      }
      if (valueWei < effectiveMinWei) {
        // Too low amount is handled elsewhere; don't flag as insufficient.
        setEstTotalWei(null);
        setInsufficient(false);
        return;
      }

      const provider = wallet.provider;
      const fee = await provider.getFeeData();
      const gasPrice = BigInt(fee.gasPrice ?? 0n);

      // If gas price is missing, fall back to just value comparison.
      if (gasPrice === 0n) {
        setEstTotalWei(valueWei);
        if (balanceWei != null) setInsufficient(balanceWei < valueWei);
        return;
      }

      const c = new ethers.Contract(treasuryAddress, UPVOTE_ABI, provider);
      const meta = ethers.keccak256(ethers.toUtf8Bytes("user"));
      let gasLimit: bigint;
      try {
        gasLimit = BigInt(await c.voteWithBNB.estimateGas(campaignAddress, meta, { value: valueWei }));
      } catch {
        // If estimation fails for any reason, use a conservative fallback.
        gasLimit = 150000n;
      }

      // Add a buffer (20%) to avoid borderline failures
      const bufferedGas = (gasLimit * 120n) / 100n;
      const total = valueWei + bufferedGas * gasPrice;

      if (cancelled) return;
      setEstTotalWei(total);
      if (balanceWei != null) setInsufficient(balanceWei < total);
    } catch {
      if (cancelled) return;
      setEstTotalWei(null);
      setInsufficient(false);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [open, wallet.provider, wallet.account, treasuryAddress, hasContractCode, enabled, amountBnb, effectiveMinWei, campaignAddress, balanceWei]);

  const canUpvote = Boolean(
    treasuryAddress &&
      hasContractCode !== false &&
      enabled &&
      campaignAddress &&
      wallet.provider &&
      amountWei != null &&
      amountWei > 0n &&
      !tooLow &&
      !insufficient
  );

  const handleUpvote = async () => {
    try {
      const ABORT = "__UPVOTE_ABORT__";
      const fail = (title: string, description: string) => {
        toast({ title, description });
        throw new Error(ABORT);
      };

      // Lock dialog from the moment the user confirms, including wallet confirmation time.
      setSubmitting(true);

      if (!treasuryAddress) {
        fail("UP Vote is not configured", "Missing vote treasury address for this chain.");
      }
      if (hasContractCode === false) {
        fail(
          "UP Vote contract not deployed",
          "The configured vote treasury address has no contract code on this network. Switch networks or update the contract address."
        );
      }
      if (!wallet.signer) {
        await wallet.connect();
      }
      if (!wallet.signer) {
        fail("Wallet not connected", "Please connect your wallet to upvote.");
      }

      // Validate amount
      let valueWei: bigint;
      try {
        valueWei = ethers.parseEther(String(amountBnb));
      } catch {
        fail("Invalid amount", "Enter a valid BNB amount.");
      }
      if (valueWei < effectiveMinWei) {
        fail(
          "Amount too low",
          `Minimum is ${humanEffectiveMin} BNB${minUsdLabel ? ` (~${minUsdLabel})` : ""} for 1 vote.`
        );
      }


// Check balance (value + estimated gas)
if (balanceWei != null) {
  // If we computed estTotalWei, use it; else at least ensure value fits.
  const needed = estTotalWei ?? valueWei;
  if (balanceWei < needed) {
      fail(
        "Insufficient BNB",
        "You don't have enough BNB to cover the vote fee (and gas)."
      );
  }
}

      const c = new ethers.Contract(treasuryAddress, UPVOTE_ABI, wallet.signer);
      const meta = ethers.keccak256(ethers.toUtf8Bytes("user"));
      // BSC (56/97) is legacy gas (no EIP-1559). Some RPCs (and MetaMask) log
      // noisy errors for `eth_maxPriorityFeePerGas`. Force a legacy tx by
      // supplying gasPrice and type=0 when available.
      let gasPrice: bigint | undefined;
      try {
        const gpHex = await wallet.provider!.send("eth_gasPrice", []);
        gasPrice = gpHex ? BigInt(gpHex) : undefined;
      } catch {
        try {
          const fee = await wallet.provider!.getFeeData();
          gasPrice = fee.gasPrice != null ? BigInt(fee.gasPrice) : undefined;
        } catch {
          gasPrice = undefined;
        }
      }

      const overrides: any = { value: valueWei };
      if (gasPrice && gasPrice > 0n) {
        overrides.gasPrice = gasPrice;
        overrides.type = 0;
      }

      const tx = await c.voteWithBNB(campaignAddress, meta, overrides);

      toast({ title: "Upvote sent", description: "Waiting for confirmation…" });
      await tx.wait();
      toast({ title: "Upvoted", description: "Your vote has been recorded." });
      setOpen(false);

      // Nudge any UI surfaces that render vote-sorted leaderboards to refresh immediately.
      try {
        window.dispatchEvent(
          new CustomEvent("upmeme:upvoteConfirmed", {
            detail: { chainId, campaignAddress: safeLowerHex(campaignAddress) },
          })
        );
        window.dispatchEvent(
          new CustomEvent("upmeme:txConfirmed", {
            detail: { kind: "upvote", chainId, campaignAddress: safeLowerHex(campaignAddress), txHash: tx?.hash },
          })
        );
      } catch {}
    } catch (e: any) {
      // Errors thrown via `fail(...)` already displayed a toast.
      const msg = String(e?.shortMessage || e?.message || "Transaction failed");
      if (!msg.includes("__UPVOTE_ABORT__")) {
        toast({ title: "Upvote failed", description: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Do not allow closing while awaiting wallet confirmation / tx confirmation.
        if (!next && lockDialog) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={buttonVariant}
          size={buttonSize}
          className={className}
          disabled={!treasuryAddress}
          title={!treasuryAddress ? "UP Vote treasury not configured" : "Upvote"}
        >
          UP Vote
        </Button>
      </DialogTrigger>
      <DialogContent
        onPointerDownOutside={(e) => {
          if (lockDialog) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (lockDialog) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (lockDialog) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>UP Vote</DialogTitle>
          <DialogDescription>
            Pay a small BNB fee to upvote this campaign. 1 transaction = 1 vote.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {loadingCfg ? (
              "Loading fee…"
            ) : enabled ? (
              <>
                Minimum fee:{" "}
                <span className="text-foreground">{humanEffectiveMin} BNB</span>
                {minUsdLabel ? (
                  <>
                    {" "}• <span className="text-foreground">{minUsdLabel}</span>
                  </>
                ) : null}
                <span className="ml-2">(min: max(0.005 BNB, ~$2))</span>
              </>
            ) : (
              "UP Vote is currently disabled on this chain."
            )}
          </div>


<div className="text-xs text-muted-foreground">
  Balance:{" "}
  <span className="text-foreground">
    {balanceWei != null ? `${Number(ethers.formatEther(balanceWei)).toFixed(6)} BNB` : "—"}
  </span>
  {insufficient ? (
    <span className="ml-2 text-destructive">Insufficient for this vote.</span>
  ) : null}
</div>

          <div className="flex items-center gap-2">
            <Input
              value={amountBnb}
              onChange={(e) => {
                setTouched(true);
                setAmountBnb(e.target.value);
              }}
              placeholder="0.001"
              inputMode="decimal"
            />
            <div className="text-sm text-muted-foreground">BNB</div>
          </div>

          {amountBnb.trim() !== "" && amountWei == null ? (
            <div className="text-xs text-destructive">
              Enter a valid BNB amount.
            </div>
          ) : null}

          {tooLow ? (
            <div className="text-xs text-destructive">
              Minimum is {humanEffectiveMin} BNB{minUsdLabel ? ` (~${minUsdLabel})` : ""}.
            </div>
          ) : null}

          <div className="text-xs text-muted-foreground">
            Off-chain cooldown & daily caps apply to keep the list fair.
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpvote}
            disabled={!canUpvote || submitting || loadingCfg}
          >
            {submitting ? "Upvoting…" : "Confirm Upvote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
