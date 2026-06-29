import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther } from "ethers";
import { toast } from "sonner";
import { Gift, RefreshCcw, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { useWallet } from "@/contexts/WalletContext";
import {
  createRecruiterNativeClaim,
  fetchRecruiterNativePayouts,
  requestRecruiterPayoutWalletChallenge,
  verifyRecruiterPayoutWallet,
  type RecruiterNativePayouts,
  type RecruiterPayoutBalance,
} from "@/lib/recruiterPortalApi";

function formatNative(raw?: string | null): string {
  try {
    const value = Number(formatEther(BigInt(raw || "0")));
    return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 });
  } catch {
    return "0";
  }
}

function shortAddress(value?: string | null) {
  const raw = String(value || "").trim();
  return raw.length > 12 ? `${raw.slice(0, 6)}...${raw.slice(-4)}` : raw || "Not linked";
}

function balanceLabel(balance: RecruiterPayoutBalance) {
  const claimable = formatNative(balance.claimableRaw);
  const pending = formatNative(balance.pendingRaw);
  return `${claimable} ${balance.token} claimable / ${pending} ${balance.token} pending`;
}

export function RecruiterPayoutPanel() {
  const wallet = useWallet();
  const [data, setData] = useState<RecruiterNativePayouts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bnbWallet, setBnbWallet] = useState("");
  const [solWallet, setSolWallet] = useState("");
  const [linking, setLinking] = useState<"bnb" | "solana" | null>(null);
  const [claiming, setClaiming] = useState<"bnb" | "solana" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchRecruiterNativePayouts();
      setData(next);
      const bnb = next?.balances?.find((item) => item.chain === "bnb")?.payoutWallet || wallet.account || "";
      const sol = next?.balances?.find((item) => item.chain === "solana")?.payoutWallet || "";
      setBnbWallet((current) => current || bnb);
      setSolWallet((current) => current || sol);
    } catch (err: any) {
      const message = String(err?.message || err || "Could not load recruiter payouts.");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [wallet.account]);

  useEffect(() => {
    void load();
  }, [load]);

  const balances = useMemo(() => {
    const items = data?.balances || [];
    return [
      items.find((item) => item.chain === "bnb") || { chain: "bnb", token: "BNB", claimableRaw: "0", pendingRaw: "0", payoutWallet: null, status: "missing_payout_wallet" },
      items.find((item) => item.chain === "solana") || { chain: "solana", token: "SOL", claimableRaw: "0", pendingRaw: "0", payoutWallet: null, status: "missing_payout_wallet" },
    ] as RecruiterPayoutBalance[];
  }, [data?.balances]);

  const linkWallet = async (chain: "bnb" | "solana") => {
    const payoutWallet = chain === "bnb" ? bnbWallet.trim() : solWallet.trim();
    if (!payoutWallet) {
      toast.error(`Enter a ${chain === "bnb" ? "BNB" : "Solana"} payout wallet first.`);
      return;
    }

    setLinking(chain);
    setError(null);
    try {
      const challenge = await requestRecruiterPayoutWalletChallenge(chain, payoutWallet);
      if (chain === "solana") {
        throw new Error(challenge?.error || "Solana payout wallet verification is pending Phantom signing support.");
      }
      if (!wallet.signer) throw new Error("Connect the BNB payout wallet in MetaMask first.");
      const signature = await wallet.signer.signMessage(challenge.message);
      await verifyRecruiterPayoutWallet(chain, payoutWallet, challenge.nonce, signature);
      toast.success("BNB payout wallet verified");
      await load();
    } catch (err: any) {
      const message = String(err?.message || err || "Could not verify payout wallet.");
      setError(message);
      toast.error(message);
    } finally {
      setLinking(null);
    }
  };

  const createClaim = async (chain: "bnb" | "solana") => {
    setClaiming(chain);
    setError(null);
    try {
      const result = await createRecruiterNativeClaim(chain);
      toast.success(result?.message || "Recruiter claim created");
      await load();
    } catch (err: any) {
      const message = String(err?.message || err || "Could not create claim.");
      setError(message);
      toast.error(message);
    } finally {
      setClaiming(null);
    }
  };

  return (
    <CommandCenterCard
      title="Recruiter payouts"
      description="Link payout wallets and create native BNB / SOL recruiter reward claims from the signed recruiter session."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-retro text-sm text-foreground">Native payout controls</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Rewards stay locked to your recruiter session. BNB payout wallets require a wallet signature before claims can be created.
          </p>
        </div>
        <Button onClick={() => void load()} disabled={loading} variant="outline" className="font-retro">
          <RefreshCcw className="mr-2 h-4 w-4" />
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error && <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</div>}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {balances.map((balance) => {
          const isBnb = balance.chain === "bnb";
          const inputValue = isBnb ? bnbWallet : solWallet;
          const setInputValue = isBnb ? setBnbWallet : setSolWallet;
          const canClaim = BigInt(balance.claimableRaw || "0") > 0n;
          return (
            <div key={balance.chain} className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-retro text-lg text-foreground">{balance.token} rewards</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">{balance.status.replace(/_/g, " ")}</div>
                </div>
                <WalletCards className="h-5 w-5 text-accent" />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/40 bg-card/25 p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Claimable</div>
                  <div className="mt-1 font-retro text-xl text-foreground">{formatNative(balance.claimableRaw)} {balance.token}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/25 p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Pending</div>
                  <div className="mt-1 font-retro text-xl text-foreground">{formatNative(balance.pendingRaw)} {balance.token}</div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border/40 bg-card/25 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Verified payout wallet</div>
                <div className="mt-1 font-mono text-sm text-foreground">{shortAddress(balance.payoutWallet)}</div>
              </div>

              <div className="mt-4 space-y-2">
                <label className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {balance.token} payout wallet
                </label>
                <input
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder={isBnb ? "0x..." : "Solana wallet address"}
                  className="min-h-10 w-full rounded-xl border border-border/50 bg-background/60 px-3 font-mono text-sm text-foreground outline-none transition focus:border-accent/60"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void linkWallet(balance.chain)} disabled={linking === balance.chain} className="font-retro">
                  {linking === balance.chain ? "Verifying..." : `Verify ${balance.token} wallet`}
                </Button>
                <Button onClick={() => void createClaim(balance.chain)} disabled={!canClaim || claiming === balance.chain} variant="outline" className="font-retro">
                  <Gift className="mr-2 h-4 w-4" />
                  {claiming === balance.chain ? "Creating..." : `Create ${balance.token} claim`}
                </Button>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">{balanceLabel(balance)}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-border/50 bg-background/25 p-4">
        <div className="font-retro text-sm text-foreground">Recent claim records</div>
        <div className="mt-3 space-y-2">
          {(data?.claims || []).length === 0 ? (
            <div className="rounded-xl border border-border/40 bg-card/25 p-3 text-sm text-muted-foreground">No recruiter payout claims created yet.</div>
          ) : (
            data!.claims.slice(0, 5).map((claim) => (
              <div key={claim.id} className="rounded-xl border border-border/40 bg-card/25 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-retro text-foreground">{formatNative(claim.amountRaw)} {claim.token}</div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{claim.status}</div>
                </div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{shortAddress(claim.payoutWallet)} {claim.txHash ? `• ${shortAddress(claim.txHash)}` : ""}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </CommandCenterCard>
  );
}
