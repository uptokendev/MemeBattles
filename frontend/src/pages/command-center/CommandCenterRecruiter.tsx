import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Copy, ExternalLink, Gift, Image, Link2, LogOut, ShieldCheck, Trophy, WalletCards } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { ProfileRecruiterPanel } from "@/components/profile/ProfileRecruiterPanel";
import { useRecruiterWallet, type RecruiterWalletCandidate } from "@/hooks/useRecruiterWallet";
import { fetchRecruiterSignupStatus, type RecruiterSignupStatus } from "@/lib/recruiterApi";
import {
  fetchRecruiterPortal,
  getPortalSquadImageUrl,
  logoutRecruiterPortal,
  requestRecruiterAuthNonce,
  updateRecruiterPortalCode,
  updateRecruiterPortalSquadImage,
  verifyRecruiterAuth,
  type RecruiterPortalData,
} from "@/lib/recruiterPortalApi";

const benefits = [
  "Your own recruiter code and referral link",
  "Public recruiter profile and leaderboard visibility",
  "Track the creators and traders who join through your link",
  "Weekly recruiter rewards",
  "Claimable recruiter rewards through your creator dashboard",
  "Grow your squad as more creators and traders join",
];

const programSteps = [
  "Apply with your connected wallet",
  "Choose your recruiter code",
  "Share your recruiter link",
  "Grow creators, traders, and squads",
  "Track rewards inside your creator dashboard",
];

function shortAddress(value?: string | null) {
  const raw = String(value || "");
  return raw.length > 10 ? `${raw.slice(0, 6)}...${raw.slice(-4)}` : raw;
}

function formatDate(value?: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not yet" : date.toLocaleString();
}

function normalizeCode(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function looksLikeSolanaAddress(value?: string | null) {
  const raw = String(value || "").trim();
  return raw.length >= 32 && raw.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(raw);
}

function sameWallet(left?: string | null, right?: string | null) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  if (!a || !b) return false;
  if (a.startsWith("0x") || b.startsWith("0x")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

export default function CommandCenterRecruiter() {
  const { walletAddress } = useCommandCenterData();
  const recruiterWallet = useRecruiterWallet();
  const [status, setStatus] = useState<RecruiterSignupStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [portal, setPortal] = useState<RecruiterPortalData | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [preferredCode, setPreferredCode] = useState("");
  const [squadImageUrl, setSquadImageUrl] = useState("");
  const [authing, setAuthing] = useState(false);
  const [savingCode, setSavingCode] = useState(false);
  const [savingSquadImage, setSavingSquadImage] = useState(false);

  const activeRecruiterWallet = useMemo<RecruiterWalletCandidate | null>(() => {
    const exact = recruiterWallet.connectedWallets.find((candidate) => sameWallet(candidate.address, walletAddress));
    if (exact) return exact;
    if (looksLikeSolanaAddress(walletAddress)) {
      return recruiterWallet.connectedWallets.find((candidate) => candidate.chain === "solana") || null;
    }
    return null;
  }, [recruiterWallet.connectedWallets, walletAddress]);

  const effectiveWalletAddress = activeRecruiterWallet?.address || walletAddress;

  useEffect(() => {
    let cancelled = false;
    setLoadingStatus(true);
    setStatusError(null);
    setPortal(null);
    setPortalError(null);

    void fetchRecruiterSignupStatus(effectiveWalletAddress)
      .then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      })
      .catch((err: any) => {
        if (!cancelled) setStatusError(String(err?.message || err || "Could not load recruiter status."));
      })
      .finally(() => {
        if (!cancelled) setLoadingStatus(false);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveWalletAddress]);

  const recruiter = status?.recruiter ?? null;
  const isRecruiter = Boolean(status?.isRecruiter && recruiter);

  const applyPortal = useCallback((nextPortal: RecruiterPortalData | null) => {
    setPortal(nextPortal);
    setPreferredCode(nextPortal?.recruiter?.recruiter_code || recruiter?.code || "");
    setSquadImageUrl(getPortalSquadImageUrl(nextPortal));
  }, [recruiter?.code]);

  const loadPortal = useCallback(async () => {
    setLoadingPortal(true);
    setPortalError(null);
    try {
      const nextPortal = await fetchRecruiterPortal(effectiveWalletAddress);
      applyPortal(nextPortal);
      return nextPortal;
    } catch (err: any) {
      setPortal(null);
      setPortalError(String(err?.message || err || "Failed to load recruiter tools."));
      return null;
    } finally {
      setLoadingPortal(false);
    }
  }, [applyPortal, effectiveWalletAddress]);

  useEffect(() => {
    if (!isRecruiter) {
      setPortal(null);
      setPreferredCode("");
      setSquadImageUrl("");
      return;
    }
    void loadPortal();
  }, [isRecruiter, loadPortal]);

  const activeCode = portal?.recruiter?.recruiter_code || recruiter?.code || effectiveWalletAddress.slice(0, 8).toLowerCase();
  const baseUrl = typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "https://memewar.zone";
  const canonicalLink = `${baseUrl}/r/${encodeURIComponent(activeCode)}`;
  const queryLink = `${baseUrl}/?ref=${encodeURIComponent(activeCode)}`;
  const activeSquadImage = squadImageUrl || getPortalSquadImageUrl(portal);

  const shareText = useMemo(() => {
    const squadSize = portal?.squad?.counts?.total ?? recruiter?.linkedWalletCount ?? 0;
    return `I’m building my MemeWarzone squad early. ${squadSize} creators and traders already locked in. Join with my code ${activeCode}: ${canonicalLink}`;
  }, [activeCode, canonicalLink, portal?.squad?.counts?.total, recruiter?.linkedWalletCount]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  const signIntoPortal = async () => {
    if (!activeRecruiterWallet) {
      toast.error("Connect the approved recruiter wallet first.");
      return;
    }
    if (!activeRecruiterWallet.canSign) {
      toast.error(`Connect the approved ${activeRecruiterWallet.chain === "solana" ? "Solana" : "BNB"} recruiter wallet first.`);
      return;
    }

    setAuthing(true);
    setPortalError(null);
    try {
      const challenge = await requestRecruiterAuthNonce(activeRecruiterWallet.address);
      const signature = await recruiterWallet.signMessage(activeRecruiterWallet.chain, activeRecruiterWallet.address, challenge.message);
      await verifyRecruiterAuth(activeRecruiterWallet.address, signature);
      const nextPortal = await fetchRecruiterPortal(activeRecruiterWallet.address);
      if (!nextPortal) throw new Error("Signature accepted, but recruiter tools session was not restored. Please try again or refresh once.");
      applyPortal(nextPortal);
      toast.success("Recruiter tools unlocked");
    } catch (err: any) {
      const message = String(err?.message || err || "Wallet sign-in failed.");
      setPortal(null);
      setPortalError(message);
      toast.error(message);
    } finally {
      setAuthing(false);
    }
  };

  const saveCode = async () => {
    const nextCode = normalizeCode(preferredCode);
    if (!nextCode) {
      toast.error("Enter a recruiter code first.");
      return;
    }

    setSavingCode(true);
    setPortalError(null);
    try {
      const result = await updateRecruiterPortalCode(nextCode, effectiveWalletAddress);
      setPreferredCode(result.recruiter_code);
      await loadPortal();
      toast.success("Recruiter code updated");
    } catch (err: any) {
      setPortalError(String(err?.message || err || "Failed to update recruiter code."));
      toast.error(String(err?.message || "Failed to update recruiter code."));
    } finally {
      setSavingCode(false);
    }
  };

  const saveSquadImageUrl = async (nextImageUrl: string) => {
    setSavingSquadImage(true);
    setPortalError(null);
    try {
      const result = await updateRecruiterPortalSquadImage(nextImageUrl, effectiveWalletAddress);
      setSquadImageUrl(result.squad_image_url);
      await loadPortal();
      toast.success("Squad image updated");
    } catch (err: any) {
      setPortalError(String(err?.message || err || "Failed to update squad image."));
      toast.error(String(err?.message || "Failed to update squad image."));
    } finally {
      setSavingSquadImage(false);
    }
  };

  const disconnectPortal = async () => {
    await logoutRecruiterPortal(effectiveWalletAddress);
    setPortal(null);
    setPreferredCode(recruiter?.code || "");
    setSquadImageUrl("");
    toast.success("Recruiter tools disconnected");
  };

  const shareToX = () => {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const nativeShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: "My MemeWarzone squad", text: shareText, url: canonicalLink });
      return;
    }
    shareToX();
  };

  if (loadingStatus) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Recruiter" description="Loading recruiter status for this wallet." />
        <CommandCenterCard title="Recruiter status" description="Checking whether this wallet already has a recruiter account.">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-6 text-sm text-muted-foreground">Loading recruiter program state...</div>
        </CommandCenterCard>
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Recruiter" description="Recruiter status could not be loaded." />
        <CommandCenterCard title="Recruiter status unavailable" description="Try again after refreshing.">
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-6 text-sm text-rose-100">{statusError}</div>
        </CommandCenterCard>
      </div>
    );
  }

  if (!isRecruiter) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Recruiter Program" description="This wallet is not a recruiter yet. Learn how the program works and apply from here.">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="font-retro"><Link to="/recruiters">Public leaderboard<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button asChild className="font-retro"><Link to="/recruiter/signup">Sign up</Link></Button>
          </div>
        </CommandCenterPageHeader>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <CommandCenterCard title="Become a MemeWarzone Recruiter" description="Recruiters help grow the arena by bringing in creators, traders, and squads.">
            <div className="grid gap-3 sm:grid-cols-2">
              {benefits.map((benefit) => <div key={benefit} className="rounded-2xl border border-border/50 bg-background/25 p-3 text-sm text-muted-foreground">{benefit}</div>)}
            </div>
            <div className="mt-5 rounded-2xl border border-accent/30 bg-accent/10 p-4">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-accent" /><div><div className="font-retro text-sm text-foreground">Program rule</div><p className="mt-1 text-sm text-muted-foreground">Your recruiter link is tracked automatically. When creators and traders join through you, MemeWarzone keeps the squad and reward records updated.</p></div></div>
            </div>
          </CommandCenterCard>
          <CommandCenterCard title="How it works" description="The short path from wallet to recruiter dashboard.">
            <div className="space-y-3">
              {programSteps.map((step, index) => <div key={step} className="flex gap-3 rounded-2xl border border-border/50 bg-background/25 p-4"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 font-retro text-xs text-accent">{index + 1}</div><div className="text-sm text-muted-foreground">{step}</div></div>)}
            </div>
          </CommandCenterCard>
        </div>
      </div>
    );
  }

  const portalLocked = !portal;

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader title="Recruiter Management" description="Manage your recruiter link, public recruiter profile, rewards, squad growth, and account settings from Command Center.">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="font-retro"><Link to="/recruiters">Public leaderboard<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          <Button asChild className="font-retro"><Link to={`/recruiters/${encodeURIComponent(activeCode)}`}>Public page</Link></Button>
        </div>
      </CommandCenterPageHeader>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <CommandCenterCard title="Recruiter account" description="Your active recruiter identity and public referral link.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4"><div className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Code</div><div className="mt-2 break-all font-retro text-lg text-foreground">{activeCode}</div></div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4"><div className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Status</div><div className="mt-2 font-retro text-lg capitalize text-foreground">{portal?.recruiter?.status || recruiter.status}</div></div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4"><div className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Linked wallets</div><div className="mt-2 font-retro text-lg text-foreground">{(portal?.squad?.counts?.total ?? recruiter.linkedWalletCount).toLocaleString()}</div></div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4"><div className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Wallet</div><div className="mt-2 font-retro text-lg text-foreground">{shortAddress(effectiveWalletAddress)}</div></div>
          </div>

          {activeSquadImage && <div className="mt-4 flex justify-center"><img src={activeSquadImage} alt={`${activeCode} squad`} className="h-40 w-40 rounded-2xl border border-accent/30 bg-accent/10 object-cover" /></div>}

          <div className="mt-4 rounded-2xl border border-border/50 bg-background/25 p-4">
            <div className="font-retro text-sm text-foreground">Referral links</div>
            <div className="mt-3 space-y-2">
              <div className="rounded-xl border border-border/40 bg-card/25 p-3"><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Main invite link</div><div className="mt-1 break-all font-mono text-xs text-muted-foreground">{canonicalLink}</div></div>
              <div className="rounded-xl border border-border/40 bg-card/25 p-3"><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Home-page referral link</div><div className="mt-1 break-all font-mono text-xs text-muted-foreground">{queryLink}</div></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => copyText(canonicalLink, "Canonical link")} variant="outline" className="font-retro"><Copy className="mr-2 h-4 w-4" />Copy invite link</Button>
              <Button onClick={() => copyText(queryLink, "Universal link")} variant="outline" className="font-retro"><Copy className="mr-2 h-4 w-4" />Copy home link</Button>
            </div>
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="Management actions" description="Recruiter tools and sharing controls.">
          {portalLocked ? (
            <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
              <div className="font-retro text-sm text-foreground">Unlock recruiter tools</div>
              <p className="mt-2 text-sm text-muted-foreground">Sign with the approved recruiter wallet to edit your recruiter code, squad image, and sharing links.</p>
              {!activeRecruiterWallet && <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">The connected wallet does not match this command-center wallet. Switch to {shortAddress(effectiveWalletAddress)} first.</div>}
              {portalError && <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">{portalError}</div>}
              <Button onClick={signIntoPortal} disabled={authing || loadingPortal || !activeRecruiterWallet} className="mt-4 font-retro">{authing ? "Waiting for signature..." : loadingPortal ? "Loading tools..." : "Sign in to manage"}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <label className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Recruiter code</label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input value={preferredCode} onChange={(event) => setPreferredCode(normalizeCode(event.target.value))} className="min-h-10 flex-1 rounded-xl border border-border/50 bg-background/60 px-3 font-mono text-sm text-foreground outline-none transition focus:border-accent/60" placeholder="YOURCODE" />
                  <Button onClick={saveCode} disabled={savingCode} className="font-retro">{savingCode ? "Saving..." : "Save code"}</Button>
                </div>
                {portalError && <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">{portalError}</div>}
              </div>

              <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <label className="flex items-center gap-2 font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground"><Image className="h-4 w-4 text-accent" />Squad image URL</label>
                <p className="mt-2 text-xs text-muted-foreground">Paste a full http(s) or ipfs URL for now. Upload can be re-added after the dual-chain auth flow is stable on live dev.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input value={squadImageUrl} onChange={(event) => setSquadImageUrl(event.target.value)} className="min-h-10 flex-1 rounded-xl border border-border/50 bg-background/60 px-3 font-mono text-sm text-foreground outline-none transition focus:border-accent/60" placeholder="https://..." />
                  <Button onClick={() => void saveSquadImageUrl(squadImageUrl)} disabled={savingSquadImage} className="font-retro">{savingSquadImage ? "Saving..." : "Save image"}</Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button onClick={() => copyText(canonicalLink, "Referral link")} variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro"><Link2 className="mr-3 h-4 w-4" />Copy referral link</Button>
                <Button onClick={shareToX} variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro"><ExternalLink className="mr-3 h-4 w-4" />Share on X</Button>
                <Button onClick={() => void nativeShare()} variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro"><Gift className="mr-3 h-4 w-4" />Share squad</Button>
                <Button onClick={() => void disconnectPortal()} variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro"><LogOut className="mr-3 h-4 w-4" />Disconnect session</Button>
                <Button asChild variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro"><Link to="/command/claims"><WalletCards className="mr-3 h-4 w-4" />Rewards / Claims</Link></Button>
                <Button asChild variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro"><Link to="/recruiters"><Trophy className="mr-3 h-4 w-4" />Leaderboard</Link></Button>
              </div>
            </div>
          )}
        </CommandCenterCard>
      </div>

      {portal && (
        <CommandCenterCard title="Squad roster" description="Creators and traders connected through your recruiter link.">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4"><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Squad size</div><div className="mt-2 font-retro text-2xl text-foreground">{portal.squad.counts.total}</div></div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4"><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Creators</div><div className="mt-2 font-retro text-2xl text-foreground">{portal.squad.counts.creators}</div></div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4"><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Traders</div><div className="mt-2 font-retro text-2xl text-foreground">{portal.squad.counts.traders}</div></div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4"><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Role pending</div><div className="mt-2 font-retro text-2xl text-foreground">{portal.squad.counts.unknown}</div></div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {portal.squad.rows.length === 0 ? <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">No squad members yet. Share your code and start onboarding creators or traders.</div> : portal.squad.rows.map((row) => (
              <div key={`${row.wallet_address}-${row.bound_at}`} className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="flex items-center justify-between gap-3"><div><div className="font-retro text-sm text-foreground">{shortAddress(row.wallet_address)}</div><div className="mt-1 text-xs text-muted-foreground">Joined {formatDate(row.bound_at)}</div></div><span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-accent">{row.role}</span></div>
                <Button onClick={() => copyText(row.wallet_address, "Wallet")} variant="outline" className="mt-3 w-full font-retro">Copy wallet</Button>
              </div>
            ))}
          </div>
        </CommandCenterCard>
      )}

      <ProfileRecruiterPanel account={effectiveWalletAddress} isConnected={true} isOwnProfile={true} />
    </div>
  );
}
