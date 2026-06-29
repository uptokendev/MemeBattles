import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther } from "ethers";
import { CheckCircle2, Clock3, RefreshCw, ShieldAlert, WalletCards } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { signSolanaMessage } from "@/lib/solanaWallet";
import {
  createRecruiterNativeClaim,
  fetchRecruiterNativePayouts,
  requestRecruiterAuthNonce,
  requestRecruiterPayoutWalletChallenge,
  verifyRecruiterAuth,
  verifyRecruiterPayoutWallet,
  type RecruiterNativePayouts,
  type RecruiterPayoutBalance,
} from "@/lib/recruiterPortalApi";

type NativeChain = "bnb" | "solana";

const EMPTY_BALANCES: RecruiterPayoutBalance[] = [
  { chain: "bnb", token: "BNB", claimableRaw: "0", pendingRaw: "0", payoutWallet: null, status: "missing_payout_wallet" },
  { chain: "solana", token: "SOL", claimableRaw: "0", pendingRaw: "0", payoutWallet: null, status: "missing_payout_wallet" },
];

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
  if (/unsupported action/i.test(raw)) {
    return "The Railway API is still running the old recruiter portal code. Redeploy the frontend API service, then refresh and try again.";
  }
  if (/application not found/i.test(raw)) {
    return "This wallet is not signed in as an approved recruiter yet. Use the recruiter sign-in button in this panel first.";
  }
  if (/unauthorized|not authenticated|session/i.test(raw)) {
    return "Sign in to recruiter tools first, then return here to view native payouts.";
  }
  return raw || "Could not load recruiter native payouts.";
}

export function RecruiterNativePayoutsPanel() {
  const wallet = useWallet();
  const solanaWallet = useSolanaWallet();
  const [state, setState] = useState<RecruiterNativePayouts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [bnbWallet, setBnbWallet] = useState("");
  const [solWallet, setSolWallet] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchRecruiterNativePayouts();
      setState(next);
      const bnb = next?.balances?.find((item) => item.chain === "bnb")?.payoutWallet || wallet.account || "";
      const sol = next?.balances?.find((item) => item.chain === "solana")?.payoutWallet || solanaWallet.solanaAccount || "";
      setBnbWallet((current) => current || bnb);
      setSolWallet((current) => current || sol);
    } catch (err: any) {
      setState(null);
      setError(payoutErrorCopy(String(err?.message || err || "")));
    } finally {
      setLoading(false);
    }
  }, [wallet.account, solanaWallet.solanaAccount]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (wallet.account) setBnbWallet((current) => current || wallet.account || "");
  }, [wallet.account]);

  useEffect(() => {
    if (solanaWallet.solanaAccount) setSolWallet((current) => current || solanaWallet.solanaAccount || "");
  }, [solanaWallet.solanaAccount]);

  const balances = useMemo(() => {
    const items = state?.balances?.length ? state.balances : EMPTY_BALANCES;
    return [...items].sort((a, b) => balanceSort(a) - balanceSort(b));
  }, [state?.balances]);

  const signInRecruiter = async () => {
    if (!wallet.account || !wallet.signer) {
      toast.error("Connect your approved recruiter wallet in MetaMask first.");
      return;
    }
    setPendingAction("signin");
    setError(null);
    try {
      const challenge = await requestRecruiterAuthNonce(wallet.account);
      const signature = await wallet.signer.signMessage(challenge.message);
      await verifyRecruiterAuth(wallet.account, signature);
      toast.success("Recruiter tools signed in");
      await load();
    } catch (err: any) {
      const message = payoutErrorCopy(String(err?.message || "Could not sign in to recruiter tools."));
      setError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  };

  const linkBnbWallet = async () => {
    const payoutWallet = bnbWallet.trim() || wallet.account || "";
    if (!payoutWallet || !wallet.signer) {
      toast.error("Connect or enter the BNB payout wallet first.");
      return;
    }
    setPendingAction("link-bnb");
    setError(null);
    try {
      const challenge = await requestRecruiterPayoutWalletChallenge("bnb", payoutWallet);
      const signature = await wallet.signer.signMessage(challenge.message);
      await verifyRecruiterPayoutWallet("bnb", payoutWallet, challenge.nonce, signature);
      toast.success("BNB payout wallet verified");
      await load();
    } catch (err: any) {
      const message = payoutErrorCopy(String(err?.message || "Could not verify BNB payout wallet."));
      setError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  };

  const linkSolanaWallet = async () => {
    let publicKey = solWallet.trim() || solanaWallet.solanaAccount;
    setPendingAction("link-solana");
    setError(null);
    try {
      if (!publicKey) {
        const connected = await solanaWallet.connectSolana();
        publicKey = connected.publicKey;
        setSolWallet(publicKey);
      }
      if (!publicKey) throw new Error("Connect or enter a Solana payout wallet first.");

      const challenge = await requestRecruiterPayoutWalletChallenge("solana", publicKey);
      const signed = await signSolanaMessage(challenge.message, publicKey);
      await verifyRecruiterPayoutWallet("solana", signed.walletAddress, challenge.nonce, signed.signature);
      toast.success("Solana payout wallet verified");
      await load();
    } catch (err: any) {
      const message = payoutErrorCopy(String(err?.message || "Could not verify Solana payout wallet."));
      setError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  };

  const createClaim = async (chain: NativeChain) => {
    setPendingAction(`claim-${chain}`);
    setError(null);
    try {
      const result = await createRecruiterNativeClaim(chain);
      toast.success(String(result?.message || `${chainLabel(chain)} claim created`));
      await load();
    } catch (err: any) {
      const message = payoutErrorCopy(String(err?.message || `Could not create ${chainLabel(chain)} claim.`));
      setError(message);
      toast.error(message);
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
        <div className="space-y-1 text-sm text-muted-foreground">
          <div>{state?.code ? `Recruiter code: ${state.code}` : "Sign in to recruiter tools to view native payouts."}</div>
          <div className="font-mono text-xs">
            BNB connected: {shortAddress(wallet.account)} · SOL connected: {shortAddress(solanaWallet.solanaAccount)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!state?.code ? (
            <Button onClick={signInRecruiter} disabled={pendingAction === "signin"} className="font-retro">
              {pendingAction === "signin" ? "Signing..." : "Sign in recruiter"}
            </Button>
          ) : null}
          <Button onClick={load} disabled={loading} variant="outline" className="font-retro">
            <RefreshCw className="mr-2 h-4 w-4" />
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">{error}</div> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {balances.map((balance) => {
          const chain = balance.chain as NativeChain;
          const isBnb = chain === "bnb";
          const inputValue = isBnb ? bnbWallet : solWallet;
          const setInputValue = isBnb ? setBnbWallet : setSolWallet;
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
                  Verified payout wallet
                </div>
                <div className="mt-2 font-mono text-sm text-foreground">{shortAddress(balance.payoutWallet)}</div>
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
                {isBnb ? (
                  <Button onClick={linkBnbWallet} disabled={pendingAction === "link-bnb"} variant="outline" className="font-retro">
                    {pendingAction === "link-bnb" ? "Waiting..." : balance.payoutWallet ? "Update BNB wallet" : "Verify BNB wallet"}
                  </Button>
                ) : (
                  <Button onClick={linkSolanaWallet} disabled={pendingAction === "link-solana" || solanaWallet.connectingSolana} variant="outline" className="font-retro">
                    {pendingAction === "link-solana" || solanaWallet.connectingSolana ? "Waiting..." : balance.payoutWallet ? "Update SOL wallet" : "Verify SOL wallet"}
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
