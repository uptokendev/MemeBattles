import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther } from "ethers";
import { CheckCircle2, Clock3, RefreshCw, ShieldAlert, WalletCards } from "lucide-react";
import { toast } from "sonner";

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

type NativeChain = "bnb" | "solana";

function shortAddress(value?: string | null) {
  const raw = String(value || "");
  return raw.length > 12 ? `${raw.slice(0, 6)}...${raw.slice(-4)}` : raw || "Not verified";
}

function tokenDecimals(token?: string | null) {
  return String(token || "").toUpperCase() === "SOL" ? 9 : 18;
}

function formatNative(raw?: string | null, token?: string | null): string {
  try {
    const decimals = tokenDecimals(token);
    const wei = BigInt(raw || "0");
    const value = Number(formatEther(decimals === 18 ? wei : wei * 10n ** BigInt(18 - decimals)));
    return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 });
  } catch {
    return "0";
  }
}

function statusTone(status?: string | null) {
  const value = String(status || "").toLowerCase();
  if (value === "claimable") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  if (value === "missing_payout_wallet") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return "border-border/40 bg-card/25 text-muted-foreground";
}

function statusLabel(status?: string | null) {
  return String(status || "pending_finality").replace(/_/g, " ");
}

function chainLabel(chain: NativeChain) {
  return chain === "bnb" ? "BNB Chain" : "Solana";
}

function balanceSort(balance: RecruiterPayoutBalance) {
  return balance.chain === "bnb" ? 0 : 1;
}

function payoutErrorCopy(message: string) {
  const raw = String(message || "");
  if (/application not found/i.test(raw)) {
    return "This wallet is not signed in as an approved recruiter yet. Use the Recruiter section to sign in with an approved recruiter wallet. QA seed data is visible in the admin dashboard, not in this personal recruiter panel unless you are signed in as that seeded recruiter.";
  }
  if (/unauthorized|not authenticated|session/i.test(raw)) {
    return "Sign in to recruiter tools first, then return here to view native payouts.";
  }
  return raw || "Could not load recruiter native payouts.";
}

export function RecruiterNativePayoutsPanel() {
  const wallet = useWallet();
  const [state, setState] = useState<RecruiterNativePayouts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchRecruiterNativePayouts();
      setState(next);
    } catch (err: any) {
      setState(null);
      setError(payoutErrorCopy(String(err?.message || err || "")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const balances = useMemo(() => [...(state?.balances || [])].sort((a, b) => balanceSort(a) - balanceSort(b)), [state?.balances]);

  const linkBnbWallet = async () => {
    if (!wallet.account || !wallet.signer) {
      toast.error("Connect the BNB payout wallet first.");
      return;
    }
    setPendingAction("link-bnb");
    try {
      const challenge = await requestRecruiterPayoutWalletChallenge("bnb", wallet.account);
      const signature = await wallet.signer.signMessage(challenge.message);
      await verifyRecruiterPayoutWallet("bnb", wallet.account, challenge.nonce, signature);
      toast.success("BNB payout wallet verified");
      await load();
    } catch (err: any) {
      toast.error(payoutErrorCopy(String(err?.message || "Could not verify BNB payout wallet.")));
    } finally {
      setPendingAction(null);
    }
  };

  const createClaim = async (chain: NativeChain) => {
    setPendingAction(`claim-${chain}`);
    try {
      const result = await createRecruiterNativeClaim(chain);
      toast.success(String(result?.message || `${chainLabel(chain)} claim created`));
      await load();
    } catch (err: any) {
      toast.error(payoutErrorCopy(String(err?.message || `Could not create ${chainLabel(chain)} claim.`)));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <CommandCenterCard
      title="Recruiter native payouts"
      description="BNB rewards stay BNB and Solana rewards stay SOL. USD values are display-only; raw native units remain the source of truth."
      action={<WalletCards className="h-5 w-5 text-accent" />}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {state?.code ? `Recruiter code: ${state.code}` : "Sign in to recruiter tools to view native payouts."}
        </div>
        <Button onClick={load} disabled={loading} variant="outline" className="font-retro">
          <RefreshCw className="mr-2 h-4 w-4" />
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error ? <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">{error}</div> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {balances.map((balance) => {
          const chain = balance.chain as NativeChain;
          const claimable = BigInt(balance.claimableRaw || "0");
          const canClaim = claimable > 0n && Boolean(balance.payoutWallet);
          return (
            <div key={chain} className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-retro text-sm text-foreground">{chainLabel(chain)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Pays in {balance.token}</div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${statusTone(balance.status)}`}>
                  {statusLabel(balance.status)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-xl border border-border/40 bg-card/25 p-3">
                  <div className="font-retro text-lg text-foreground">{formatNative(balance.claimableRaw, balance.token)}</div>
                  <div className="mt-1 text-muted-foreground">Claimable {balance.token}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/25 p-3">
                  <div className="font-retro text-lg text-foreground">{formatNative(balance.pendingRaw, balance.token)}</div>
                  <div className="mt-1 text-muted-foreground">Pending {balance.token}</div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-border/40 bg-card/25 p-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {balance.payoutWallet ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <ShieldAlert className="h-4 w-4 text-amber-200" />}
                  Payout wallet
                </div>
                <div className="mt-2 font-mono text-sm text-foreground">{shortAddress(balance.payoutWallet)}</div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {chain === "bnb" ? (
                  <Button onClick={linkBnbWallet} disabled={pendingAction === "link-bnb"} variant="outline" className="font-retro">
                    {pendingAction === "link-bnb" ? "Waiting..." : balance.payoutWallet ? "Update BNB wallet" : "Verify BNB wallet"}
                  </Button>
                ) : (
                  <Button disabled variant="outline" className="font-retro">
                    Solana verification after program phase
                  </Button>
                )}
                <Button onClick={() => createClaim(chain)} disabled={!canClaim || pendingAction === `claim-${chain}`} className="font-retro">
                  {pendingAction === `claim-${chain}` ? "Creating..." : `Claim ${balance.token}`}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-border/50 bg-background/25 p-4">
        <div className="flex items-start gap-3">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-sm text-muted-foreground">
            Claim creation records the native payout request and locks the matched ledger entries. On-chain vault submission is intentionally left pending until the payout signer/vault integration is connected.
          </p>
        </div>
      </div>

      {state?.claims?.length ? (
        <div className="mt-4 space-y-2">
          <div className="font-retro text-sm text-foreground">Recent native claims</div>
          {state.claims.slice(0, 5).map((claim) => (
            <div key={claim.id} className="rounded-xl border border-border/40 bg-card/25 p-3 text-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="font-retro text-foreground">{formatNative(claim.amountRaw, claim.token)} {claim.token}</div>
                <div className="text-xs text-muted-foreground">{chainLabel(claim.chain)} · {claim.status}</div>
              </div>
              <div className="mt-2 font-mono text-xs text-muted-foreground">{shortAddress(claim.payoutWallet)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </CommandCenterCard>
  );
}
