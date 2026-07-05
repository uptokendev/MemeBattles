import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther } from "ethers";
import { CheckCircle2, ShieldAlert, WalletCards } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { signSolanaMessage } from "@/lib/solanaWallet";
import { fetchRecruiterSignupStatus } from "@/lib/recruiterApi";
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

function chainLabel(chain: NativeChain) {
  return chain === "bnb" ? "BNB" : "Solana";
}

function walletPlaceholder(chain: NativeChain) {
  return chain === "bnb" ? "0x..." : "Solana wallet address";
}

function balanceSort(balance: RecruiterPayoutBalance) {
  return balance.chain === "bnb" ? 0 : 1;
}

function randomNonce() {
  try {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  }
}

function buildPayoutWalletMessage(input: { recruiterId: string; chain: NativeChain; walletAddress: string; nonce: string }) {
  return [
    "MemeWarzone Recruiter Payout Wallet",
    "Action: LINK_PAYOUT_WALLET",
    `RecruiterId: ${input.recruiterId}`,
    `Chain: ${input.chain}`,
    `Wallet: ${input.walletAddress}`,
    `Nonce: ${input.nonce}`,
  ].join("\n");
}

function payoutErrorCopy(message: string) {
  const raw = String(message || "");
  if (/unsupported action|request failed|unknown route|not found|ledger|vault|portal|backend|api/i.test(raw)) {
    return "Recruiter rewards are not available right now. Please try again later.";
  }
  if (/application not found/i.test(raw)) {
    return "This wallet is not approved for recruiter rewards.";
  }
  if (/unauthorized|not authenticated|session/i.test(raw)) {
    return "Please sign in with your approved recruiter wallet first.";
  }
  return raw || "Could not load recruiter rewards.";
}

function rewardReady(balance: RecruiterPayoutBalance) {
  try {
    return BigInt(balance.claimableRaw || "0") > 0n && Boolean(balance.payoutWallet);
  } catch {
    return false;
  }
}

export function RecruiterNativePayoutsPanel() {
  const wallet = useWallet();
  const solanaWallet = useSolanaWallet();
  const [state, setState] = useState<RecruiterNativePayouts | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [isRecruiterWallet, setIsRecruiterWallet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [bnbWallet, setBnbWallet] = useState("");
  const [solWallet, setSolWallet] = useState("");

  useEffect(() => {
    let cancelled = false;
    const account = String(wallet.account || "").trim();

    if (!account) {
      setIsRecruiterWallet(false);
      setIdentityError(null);
      setState(null);
      setBnbWallet("");
      return;
    }

    setIdentityLoading(true);
    setIdentityError(null);
    void fetchRecruiterSignupStatus(account)
      .then((status) => {
        if (cancelled) return;
        const isRecruiter = Boolean(status?.isRecruiter && status.recruiter);
        setIsRecruiterWallet(isRecruiter);
        if (!isRecruiter) setState(null);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setIsRecruiterWallet(false);
        setState(null);
        setIdentityError(String(err?.message || err || "Could not verify recruiter wallet."));
      })
      .finally(() => {
        if (!cancelled) setIdentityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wallet.account]);

  const load = useCallback(async () => {
    if (!isRecruiterWallet) return null;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchRecruiterNativePayouts();
      setState(next);
      const bnb = next?.balances?.find((item) => item.chain === "bnb")?.payoutWallet || wallet.account || "";
      const sol = next?.balances?.find((item) => item.chain === "solana")?.payoutWallet || solanaWallet.solanaAccount || "";
      setBnbWallet((current) => current || bnb);
      setSolWallet((current) => current || sol);
      return next;
    } catch (err: any) {
      setState(null);
      setError(payoutErrorCopy(String(err?.message || err || "")));
      return null;
    } finally {
      setLoading(false);
    }
  }, [isRecruiterWallet, wallet.account, solanaWallet.solanaAccount]);

  useEffect(() => {
    if (!identityLoading && isRecruiterWallet) void load();
  }, [identityLoading, isRecruiterWallet, load]);

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
      toast.success("Recruiter rewards unlocked");
      await load();
    } catch (err: any) {
      const message = payoutErrorCopy(String(err?.message || "Could not unlock recruiter rewards."));
      setError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  };

  const linkBnbWallet = async () => {
    const payoutWallet = bnbWallet.trim() || wallet.account || "";
    if (!payoutWallet || !wallet.signer) {
      toast.error("Connect or enter the BNB wallet first.");
      return;
    }
    setPendingAction("link-bnb");
    setError(null);
    try {
      const challenge = await requestRecruiterPayoutWalletChallenge("bnb", payoutWallet);
      const signature = await wallet.signer.signMessage(challenge.message);
      await verifyRecruiterPayoutWallet("bnb", payoutWallet, challenge.nonce, signature);
      toast.success("BNB wallet verified");
      await load();
    } catch (err: any) {
      const message = payoutErrorCopy(String(err?.message || "Could not verify BNB wallet."));
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
      if (!publicKey) throw new Error("Connect or enter a Solana wallet first.");

      const latest = state?.recruiterId ? state : await load();
      const recruiterId = String(latest?.recruiterId || "").trim();
      if (!recruiterId) throw new Error("Unlock recruiter rewards first, then verify your Solana wallet.");

      const nonce = randomNonce();
      const message = buildPayoutWalletMessage({ recruiterId, chain: "solana", walletAddress: publicKey, nonce });
      const signed = await signSolanaMessage(message, publicKey);
      await verifyRecruiterPayoutWallet("solana", signed.walletAddress, nonce, signed.signature);
      toast.success("Solana wallet verified");
      await load();
    } catch (err: any) {
      const message = payoutErrorCopy(String(err?.message || "Could not verify Solana wallet."));
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
      toast.success(String(result?.message || `${chainLabel(chain)} rewards claimed`));
      await load();
    } catch (err: any) {
      const message = payoutErrorCopy(String(err?.message || `Could not claim ${chainLabel(chain)} rewards.`));
      setError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  };

  if (identityLoading || identityError || !isRecruiterWallet) {
    return null;
  }

  return (
    <CommandCenterCard
      title="Recruiter Rewards"
      description="Verify your BNB and Solana wallets, then claim available recruiter rewards."
      action={<WalletCards className="h-5 w-5 text-accent" />}
    >
      {error ? <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">{error}</div> : null}

      {!state?.recruiterId ? (
        <div className="mb-4 rounded-2xl border border-border/50 bg-background/25 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-retro text-sm text-foreground">Unlock recruiter rewards</div>
              <p className="mt-1 text-sm text-muted-foreground">Sign once with your approved recruiter wallet to view and claim rewards.</p>
            </div>
            <Button onClick={signInRecruiter} disabled={pendingAction === "signin" || loading} className="font-retro">
              {pendingAction === "signin" || loading ? "Unlocking..." : "Unlock Rewards"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {balances.map((balance) => {
          const chain = balance.chain as NativeChain;
          const isBnb = chain === "bnb";
          const inputValue = isBnb ? bnbWallet : solWallet;
          const setInputValue = isBnb ? setBnbWallet : setSolWallet;
          const canClaim = rewardReady(balance);
          const verified = Boolean(balance.payoutWallet);
          const verifyPending = pendingAction === (isBnb ? "link-bnb" : "link-solana");
          const claimPending = pendingAction === `claim-${chain}`;
          const verifyLabel = isBnb
            ? verified ? "Update BNB Wallet" : "Verify BNB Wallet"
            : verified ? "Update Solana Wallet" : "Verify Solana Wallet";

          return (
            <div key={chain} className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-retro text-sm text-foreground">{chainLabel(chain)} Rewards</div>
                  <div className="mt-1 text-xs text-muted-foreground">Paid in {balance.token}</div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${canClaim ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-border/40 bg-card/25 text-muted-foreground"}`}>
                  {canClaim ? "Ready" : "No rewards yet"}
                </span>
              </div>

              <div className="mt-5 rounded-xl border border-border/40 bg-card/25 p-4 text-center">
                <div className="font-retro text-2xl text-foreground">{formatNative(balance.claimableRaw, balance.token)}</div>
                <div className="mt-1 text-xs text-muted-foreground">Available {balance.token}</div>
              </div>

              <div className="mt-4 rounded-xl border border-border/40 bg-card/25 p-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {verified ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <ShieldAlert className="h-4 w-4 text-amber-200" />}
                  {chainLabel(chain)} wallet verification
                </div>
                <div className="mt-2 font-mono text-sm text-foreground">{shortAddress(balance.payoutWallet)}</div>
              </div>

              <div className="mt-4 space-y-2">
                <label className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {chainLabel(chain)} wallet
                </label>
                <input
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder={walletPlaceholder(chain)}
                  className="min-h-10 w-full rounded-xl border border-border/50 bg-background/60 px-3 font-mono text-sm text-foreground outline-none transition focus:border-accent/60"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {isBnb ? (
                  <Button onClick={linkBnbWallet} disabled={verifyPending} variant="outline" className="font-retro">
                    {verifyPending ? "Waiting..." : verifyLabel}
                  </Button>
                ) : (
                  <Button onClick={linkSolanaWallet} disabled={verifyPending || solanaWallet.connectingSolana} variant="outline" className="font-retro">
                    {verifyPending || solanaWallet.connectingSolana ? "Waiting..." : verifyLabel}
                  </Button>
                )}
                <Button onClick={() => createClaim(chain)} disabled={!canClaim || claimPending} className="font-retro">
                  {claimPending ? "Claiming..." : `Claim ${balance.token}`}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </CommandCenterCard>
  );
}
