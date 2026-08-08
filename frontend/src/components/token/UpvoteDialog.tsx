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
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/contexts/WalletContext";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { getActiveChainId, getVoteTreasuryAddress } from "@/lib/chainConfig";
import { getBnbContractAddresses } from "@/lib/bnbContracts";
import { apiFetch } from "@/lib/apiBase";

/** Fixed UP Vote price in USD. On-chain amount = oracle nativeTargetForUsd($3). */
const UPVOTE_USD_TARGET = 3;

const UPVOTE_ABI = [
  "function voteWithBNB(address campaign, bytes32 meta) payable",
  "function assetConfig(address asset) view returns (bool enabled, uint256 minAmount)",
];
const GRADUATION_ORACLE_ABI = [
  "function nativeTargetForUsd(uint256 usdAmount) view returns (uint256)",
];

function safeLowerHex(s?: string | null): string {
  const v = String(s ?? "").trim();
  return v ? v.toLowerCase() : "";
}

/** Full BNB amount for display (trim trailing zeros, keep real precision). */
function formatBnbAmount(wei: bigint): string {
  try {
    const raw = ethers.formatEther(wei);
    if (!raw.includes(".")) return raw;
    const trimmed = raw.replace(/\.?0+$/, "");
    return trimmed || "0";
  } catch {
    return "—";
  }
}

type Props = {
  campaignAddress: string;
  chainId?: number | null;
  className?: string;
  buttonVariant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  buttonSize?: "default" | "sm" | "lg" | "icon";
};

/**
 * UP Vote dialog (BNB-only)
 * - Fixed price: $3 via graduation oracle (fallback: spot BNB/USD)
 * - One payable tx = one vote (no custom amount form)
 */
export function UpvoteDialog({
  campaignAddress,
  chainId: chainIdOverride,
  className,
  buttonVariant = "secondary",
  buttonSize = "sm",
}: Props) {
  const { toast } = useToast();
  const wallet = useWallet();
  const { price: priceUsd } = useBnbUsdPrice();

  const chainId = getActiveChainId(chainIdOverride ?? wallet.chainId);
  const treasuryAddress = useMemo(() => safeLowerHex(getVoteTreasuryAddress(chainId)), [chainId]);
  const oracleAddress = useMemo(
    () => safeLowerHex(getBnbContractAddresses(chainId).graduationOracle),
    [chainId],
  );

  const [open, setOpen] = useState(false);
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [minAmountWei, setMinAmountWei] = useState<bigint | null>(null);
  const [oracleTargetWei, setOracleTargetWei] = useState<bigint | null>(null);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [hasContractCode, setHasContractCode] = useState<boolean | null>(null);
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [estTotalWei, setEstTotalWei] = useState<bigint | null>(null);
  const [insufficient, setInsufficient] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const lockDialog = submitting;

  const fallbackUsdTargetWei = useMemo(() => {
    const p = Number(priceUsd ?? 0);
    if (!Number.isFinite(p) || p <= 0) return 0n;
    const bnb = UPVOTE_USD_TARGET / p;
    if (!Number.isFinite(bnb) || bnb <= 0) return 0n;
    try {
      return ethers.parseEther(bnb.toFixed(18));
    } catch {
      return 0n;
    }
  }, [priceUsd]);

  /** Exact wei we will send: max(on-chain min, oracle/spot $3). */
  const voteWei = useMemo(() => {
    let m = minAmountWei ?? 0n;
    const usdTarget = oracleTargetWei ?? fallbackUsdTargetWei;
    if (usdTarget > m) m = usdTarget;
    return m;
  }, [minAmountWei, oracleTargetWei, fallbackUsdTargetWei]);

  const priceReady = voteWei > 0n && !loadingCfg;

  const humanBnb = useMemo(() => (voteWei > 0n ? formatBnbAmount(voteWei) : "—"), [voteWei]);

  const usdLabel = useMemo(() => {
    const p = Number(priceUsd ?? 0);
    if (!Number.isFinite(p) || p <= 0 || voteWei <= 0n) return `$${UPVOTE_USD_TARGET.toFixed(2)}`;
    try {
      const bnb = Number(ethers.formatEther(voteWei));
      if (!Number.isFinite(bnb) || bnb <= 0) return `$${UPVOTE_USD_TARGET.toFixed(2)}`;
      const usd = bnb * p;
      if (!Number.isFinite(usd) || usd <= 0) return `$${UPVOTE_USD_TARGET.toFixed(2)}`;
      // Prefer the contract's $3 target label when we're within a few cents.
      if (Math.abs(usd - UPVOTE_USD_TARGET) < 0.15) return `$${UPVOTE_USD_TARGET.toFixed(2)}`;
      return `$${usd.toFixed(2)}`;
    } catch {
      return `$${UPVOTE_USD_TARGET.toFixed(2)}`;
    }
  }, [priceUsd, voteWei]);

  // Wallet balance when dialog opens
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
        const bal = await wallet.provider!.getBalance(wallet.account!);
        if (!cancelled) setBalanceWei(BigInt(bal));
      } catch {
        if (!cancelled) setBalanceWei(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, wallet.provider, wallet.account, chainId]);

  // Treasury min + enabled
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
        const code = await wallet.provider!.getCode(treasuryAddress);
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
        const isEnabled = Boolean(res?.enabled ?? res?.[0]);
        const min = BigInt(res?.minAmount ?? res?.[1] ?? 0);
        if (cancelled) return;
        setEnabled(isEnabled);
        setMinAmountWei(min);
      } catch {
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

  // Oracle $3 → native wei
  useEffect(() => {
    if (!open) return;
    if (!wallet.provider) return;
    if (!oracleAddress) {
      setOracleTargetWei(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const code = await wallet.provider!.getCode(oracleAddress);
        if (cancelled) return;
        if (!code || code === "0x") {
          setOracleTargetWei(null);
          return;
        }

        const oracle = new ethers.Contract(oracleAddress, GRADUATION_ORACLE_ABI, wallet.provider);
        const target = await oracle.nativeTargetForUsd(ethers.parseEther(String(UPVOTE_USD_TARGET)));
        if (!cancelled) setOracleTargetWei(BigInt(target));
      } catch {
        if (!cancelled) setOracleTargetWei(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, wallet.provider, oracleAddress]);

  // Estimate value + gas; flag insufficient balance
  useEffect(() => {
    if (!open) return;
    if (!wallet.provider || !wallet.account || !treasuryAddress) return;
    if (hasContractCode === false || !enabled) return;
    if (voteWei <= 0n) {
      setEstTotalWei(null);
      setInsufficient(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const provider = wallet.provider!;
        const fee = await provider.getFeeData();
        const gasPrice = BigInt(fee.gasPrice ?? 0n);

        if (gasPrice === 0n) {
          if (cancelled) return;
          setEstTotalWei(voteWei);
          if (balanceWei != null) setInsufficient(balanceWei < voteWei);
          return;
        }

        const c = new ethers.Contract(treasuryAddress, UPVOTE_ABI, provider);
        const meta = ethers.keccak256(ethers.toUtf8Bytes("user"));
        let gasLimit: bigint;
        try {
          gasLimit = BigInt(await c.voteWithBNB.estimateGas(campaignAddress, meta, { value: voteWei }));
        } catch {
          gasLimit = 150000n;
        }

        const bufferedGas = (gasLimit * 120n) / 100n;
        const total = voteWei + bufferedGas * gasPrice;
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
  }, [
    open,
    wallet.provider,
    wallet.account,
    treasuryAddress,
    hasContractCode,
    enabled,
    voteWei,
    campaignAddress,
    balanceWei,
  ]);

  const canUpvote = Boolean(
    treasuryAddress &&
      hasContractCode !== false &&
      enabled &&
      campaignAddress &&
      wallet.provider &&
      priceReady &&
      !insufficient,
  );

  const handleUpvote = async () => {
    try {
      const ABORT = "__UPVOTE_ABORT__";
      const fail = (title: string, description: string) => {
        toast({ title, description });
        throw new Error(ABORT);
      };

      setSubmitting(true);

      if (!treasuryAddress) {
        fail("UP Vote is not configured", "Missing vote treasury address for this chain.");
      }
      if (hasContractCode === false) {
        fail(
          "UP Vote contract not deployed",
          "The configured vote treasury address has no contract code on this network. Switch networks or update the contract address.",
        );
      }
      if (!wallet.signer) {
        window.dispatchEvent(new CustomEvent("memewarzone:openWalletModal"));
        return;
      }
      if (voteWei <= 0n) {
        fail("Price unavailable", "Could not resolve the $3 UP Vote amount. Try again in a moment.");
      }

      if (balanceWei != null) {
        const needed = estTotalWei ?? voteWei;
        if (balanceWei < needed) {
          fail("Insufficient BNB", "You don't have enough BNB to cover the vote fee (and gas).");
        }
      }

      const c = new ethers.Contract(treasuryAddress!, UPVOTE_ABI, wallet.signer);
      const meta = ethers.keccak256(ethers.toUtf8Bytes("user"));
      // BSC is legacy gas; force type=0 when gasPrice is available.
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

      const overrides: { value: bigint; gasPrice?: bigint; type?: number } = { value: voteWei };
      if (gasPrice && gasPrice > 0n) {
        overrides.gasPrice = gasPrice;
        overrides.type = 0;
      }

      const tx = await c.voteWithBNB(campaignAddress, meta, overrides);
      const txHash = String(tx?.hash || "");

      toast({ title: "Upvote sent", description: "Waiting for confirmation…" });
      await tx.wait();

      // Write votes + vote_aggregates from the receipt so Featured does not wait on indexer getLogs.
      let ingest: {
        votes24h?: number;
        votesAllTime?: number;
        campaignAddress?: string;
      } | null = null;
      if (txHash) {
        try {
          // Prefer /api/vote-ingest — /api/votes/* may be proxied to the indexer.
          const res = await apiFetch("/api/vote-ingest", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chainId, txHash }),
          });
          const body = await res.json().catch(() => null);
          if (res.ok && Array.isArray(body?.items) && body.items[0]) {
            ingest = body.items[0];
          } else {
            console.warn("[UpvoteDialog] vote ingest failed", res.status, body);
          }
        } catch (ingestErr) {
          console.warn("[UpvoteDialog] vote ingest error", ingestErr);
        }
      }

      toast({ title: "Upvoted", description: "Your vote has been recorded." });
      setOpen(false);

      try {
        const addr = safeLowerHex(ingest?.campaignAddress || campaignAddress);
        window.dispatchEvent(
          new CustomEvent("memewarzone:upvoteConfirmed", {
            detail: {
              chainId,
              campaignAddress: addr,
              txHash,
              votes24h: ingest?.votes24h != null ? Number(ingest.votes24h) : undefined,
              votesAllTime: ingest?.votesAllTime != null ? Number(ingest.votesAllTime) : undefined,
            },
          }),
        );
        window.dispatchEvent(
          new CustomEvent("memewarzone:txConfirmed", {
            detail: {
              kind: "upvote",
              chainId,
              campaignAddress: addr,
              txHash,
            },
          }),
        );
      } catch {
        // ignore
      }
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      const msg = String(err?.shortMessage || err?.message || "Transaction failed");
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
        if (!next && lockDialog) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={buttonVariant}
          size={buttonSize}
          className={className}
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
            Fixed price: ${UPVOTE_USD_TARGET} per vote. One transaction = one vote.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loadingCfg ? (
            <div className="text-sm text-muted-foreground">Loading fee…</div>
          ) : !treasuryAddress ? (
            <div className="text-sm text-muted-foreground">
              UP Vote treasury is not configured for this chain.
            </div>
          ) : hasContractCode === false || !enabled ? (
            <div className="text-sm text-muted-foreground">
              UP Vote is currently disabled on this chain.
            </div>
          ) : (
            <div className="rounded-md border border-border/60 bg-muted/30 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Vote price
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-2xl font-semibold text-foreground">{usdLabel}</span>
                <span className="text-sm text-muted-foreground">
                  {priceReady ? `${humanBnb} BNB` : "— BNB"}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {oracleTargetWei != null
                  ? "Converted via on-chain oracle"
                  : priceUsd
                    ? "Converted via live BNB/USD (oracle unavailable)"
                    : "Waiting for price…"}
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Balance:{" "}
            <span className="text-foreground">
              {balanceWei != null ? `${formatBnbAmount(balanceWei)} BNB` : "—"}
            </span>
            {insufficient ? (
              <span className="ml-2 text-destructive">Insufficient for this vote + gas.</span>
            ) : null}
          </div>

          <div className="text-xs text-muted-foreground">
            Off-chain cooldown & daily caps apply to keep the list fair.
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleUpvote} disabled={!canUpvote || submitting || loadingCfg}>
            {submitting ? "Upvoting…" : "Confirm Upvote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
