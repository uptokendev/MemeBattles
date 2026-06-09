import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Copy, ExternalLink, Loader2, ShieldCheck, Trophy, Users, WalletCards } from "lucide-react";
import { toast } from "sonner";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import {
  fetchWarMissionsRecruiterState,
  requestWarMissionsAuthNonce,
  submitWarMissionsRecruiterApplication,
  verifyWarMissionsAuth,
  type WarMissionsRecruiterApplication,
  type WarMissionsRecruiterState,
} from "@/lib/warMissionsApi";

const recruiterBenefits = [
  "Get a recruiter code and referral link tied to your War Missions identity.",
  "Bring in verified users and convert them into tracked recruits.",
  "Unlock recruiter milestone quests as your squad grows.",
  "Keep everything under the same wallet-first profile and XP ledger.",
];

const recruiterMilestones = [
  { label: "Assemble a Fireteam", requirement: "2 verified recruits" },
  { label: "Form a Full Squad", requirement: "4 verified recruits" },
  { label: "Deploy a Strike Force", requirement: "10 verified recruits" },
  { label: "Lead a Battalion", requirement: "20 verified recruits" },
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

function normalizeHandle(value: string) {
  return String(value || "").trim().replace(/^@+/, "").slice(0, 80);
}

function normalizeExpectedRecruits(value: string) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.min(1000, Math.trunc(parsed)));
}

function applicationTone(status?: string | null) {
  switch (status) {
    case "accepted":
      return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
    case "rejected":
      return "border-rose-300/30 bg-rose-300/10 text-rose-100";
    case "review":
      return "border-sky-300/30 bg-sky-300/10 text-sky-100";
    default:
      return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }
}

function applicationLabel(status?: string | null) {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Needs resubmission";
    case "review":
      return "In review";
    case "submitted":
      return "Submitted";
    default:
      return "Not submitted";
  }
}

function formFromApplication(application: WarMissionsRecruiterApplication | null) {
  return {
    xUsername: application?.xUsername || "",
    telegramUsername: application?.telegramUsername || "",
    discordUsername: application?.discordUsername || "",
    expectedRecruits: application?.expectedRecruits ? String(application.expectedRecruits) : "",
    motivation: application?.motivation || "",
  };
}

export default function CommandCenterRecruiter() {
  const { walletAddress } = useCommandCenterData();
  const wallet = useWallet();
  const { isSolanaConnected } = useSolanaWallet();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [authing, setAuthing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<WarMissionsRecruiterState | null>(null);
  const [form, setForm] = useState(() => formFromApplication(null));

  const loadRecruiterState = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const nextState = await fetchWarMissionsRecruiterState();
      setState(nextState);
      setAuthRequired(false);
    } catch (error: any) {
      const message = String(error?.message || error || "Could not load recruiter program state.");
      if (/connect wallet|session is no longer valid|session/i.test(message)) {
        setState(null);
        setAuthRequired(true);
      } else {
        setLoadError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecruiterState();
  }, [loadRecruiterState, walletAddress]);

  useEffect(() => {
    setForm(formFromApplication(state?.application || null));
  }, [state?.application]);

  const isRecruiter = state?.role === "recruiter";
  const application = state?.application || null;
  const recruiterLink = state?.referralLink?.url || "";
  const recruiterCode = state?.referralLink?.code || "";
  const shareText = useMemo(() => {
    if (!recruiterLink) return "";
    return `Join my MemeWarzone War Missions squad through my recruiter link: ${recruiterLink}`;
  }, [recruiterLink]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  const signIntoWarMissions = async () => {
    const account = wallet.account || walletAddress;
    if (!wallet.isConnected || !account || !wallet.signer) {
      if (isSolanaConnected) {
        toast.error("Recruiter / War Missions sign-in currently requires a connected BNB wallet (EVM). Solana support for this section is coming.");
      } else {
        toast.error("Connect the wallet for this profile before unlocking recruiter missions.");
      }
      return;
    }

    setAuthing(true);
    setLoadError(null);
    try {
      const challenge = await requestWarMissionsAuthNonce(account);
      const signature = await wallet.signer.signMessage(challenge.message);
      await verifyWarMissionsAuth(account, signature);
      await loadRecruiterState();
      toast.success("Recruiter program unlocked");
    } catch (error: any) {
      const message = String(error?.message || error || "Wallet sign-in failed.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setAuthing(false);
    }
  };

  const handleSubmit = async () => {
    const payload = {
      xUsername: normalizeHandle(form.xUsername),
      telegramUsername: normalizeHandle(form.telegramUsername),
      discordUsername: normalizeHandle(form.discordUsername),
      expectedRecruits: normalizeExpectedRecruits(form.expectedRecruits),
      motivation: String(form.motivation || "").trim(),
    };

    setSubmitting(true);
    setLoadError(null);
    try {
      await submitWarMissionsRecruiterApplication(payload);
      await loadRecruiterState();
      toast.success(application ? "Recruiter application updated" : "Recruiter application submitted");
    } catch (error: any) {
      const message = String(error?.message || error || "Could not submit recruiter application.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const shareToX = () => {
    if (!recruiterLink) return;
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const nativeShare = async () => {
    if (!recruiterLink) return;
    if (navigator.share) {
      await navigator.share({
        title: "My MemeWarzone recruiter link",
        text: shareText,
        url: recruiterLink,
      });
      return;
    }
    shareToX();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Recruiter Program" description="Loading recruiter program state for this wallet." />
        <CommandCenterCard title="Recruiter access" description="Checking your War Missions recruiter session.">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-6 text-sm text-muted-foreground">
            Loading recruiter program state...
          </div>
        </CommandCenterCard>
      </div>
    );
  }

  if (loadError && !authRequired) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Recruiter Program" description="Recruiter program data could not be loaded right now." />
        <CommandCenterCard title="Recruiter status unavailable" description="Try again after refreshing or signing in again.">
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-6 text-sm text-rose-100">
            {loadError}
          </div>
          <div className="mt-4">
            <Button onClick={() => void loadRecruiterState()} className="font-retro">
              Try again
            </Button>
          </div>
        </CommandCenterCard>
      </div>
    );
  }

  if (authRequired) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader
          title="Recruiter Program"
          description="Recruiter applications and referral tools are protected behind a War Missions wallet session."
        >
          <Button asChild variant="outline" className="font-retro">
            <Link to="/recruiters">
              Public leaderboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CommandCenterPageHeader>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <CommandCenterCard
            title="Unlock recruiter missions"
            description="Sign one wallet message to load your recruiter application, milestone progress, and referral tools."
          >
            <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-100" />
                <div className="text-sm text-amber-50/90">
                  Use the same wallet that owns this profile. Once signed, your recruiter application and referral progress load here automatically.
                </div>
              </div>
            </div>
            {loadError && (
              <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
                {loadError}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void signIntoWarMissions()} disabled={authing} className="font-retro">
                {authing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Waiting for signature...
                  </>
                ) : (
                  "Sign in with wallet"
                )}
              </Button>
              <Button asChild variant="outline" className="font-retro">
                <Link to="/recruiter">Program overview</Link>
              </Button>
            </div>
          </CommandCenterCard>

          <CommandCenterCard title="Why it matters" description="This unlocks the Operation: Reinforcements questline.">
            <div className="space-y-3">
              {recruiterBenefits.map((benefit) => (
                <div key={benefit} className="rounded-2xl border border-border/50 bg-background/25 p-3 text-sm text-muted-foreground">
                  {benefit}
                </div>
              ))}
            </div>
          </CommandCenterCard>
        </div>
      </div>
    );
  }

  if (isRecruiter) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader
          title="Recruiter Management"
          description="Your recruiter application is approved. This is now the home for your link, recruit tracking, and milestone progress."
        >
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="font-retro">
              <Link to="/recruiters">
                Public leaderboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button onClick={() => void loadRecruiterState()} variant="outline" className="font-retro">
              Refresh
            </Button>
          </div>
        </CommandCenterPageHeader>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <CommandCenterCard title="Recruiter account" description="Your recruiter identity and live invite link.">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Code</div>
                <div className="mt-2 break-all font-retro text-lg text-foreground">{recruiterCode || "Pending"}</div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Application</div>
                <div className="mt-2 font-retro text-lg text-foreground">{applicationLabel(application?.status || "accepted")}</div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Verified recruits</div>
                <div className="mt-2 font-retro text-lg text-foreground">{state?.summary.verified ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Wallet</div>
                <div className="mt-2 font-retro text-lg text-foreground">{shortAddress(walletAddress)}</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="font-retro text-sm text-foreground">Referral link</div>
              <div className="mt-3 rounded-xl border border-border/40 bg-card/25 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Share this link</div>
                <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{recruiterLink || "No link generated yet."}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => void copyText(recruiterLink, "Referral link")} disabled={!recruiterLink} variant="outline" className="font-retro">
                  <Copy className="mr-2 h-4 w-4" />
                  Copy link
                </Button>
                <Button onClick={shareToX} disabled={!recruiterLink} variant="outline" className="font-retro">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Share on X
                </Button>
                <Button onClick={() => void nativeShare()} disabled={!recruiterLink} variant="outline" className="font-retro">
                  <Users className="mr-2 h-4 w-4" />
                  Share squad
                </Button>
              </div>
            </div>
          </CommandCenterCard>

          <CommandCenterCard title="Recruit pipeline" description="How many wallets are moving through your recruiter funnel.">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Total tracked</div>
                <div className="mt-2 font-retro text-2xl text-foreground">{state?.summary.total ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Linked</div>
                <div className="mt-2 font-retro text-2xl text-foreground">{state?.summary.linked ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Pending</div>
                <div className="mt-2 font-retro text-2xl text-foreground">{state?.summary.pending ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Locked</div>
                <div className="mt-2 font-retro text-2xl text-foreground">{state?.summary.locked ?? 0}</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 p-4">
              <div className="font-retro text-sm text-foreground">Milestone track</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {recruiterMilestones.map((milestone) => {
                  const isComplete = (state?.summary.verified ?? 0) >= Number(milestone.requirement.split(" ")[0]);
                  return (
                    <div key={milestone.label} className="rounded-2xl border border-border/50 bg-background/25 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-retro text-sm text-foreground">{milestone.label}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{milestone.requirement}</div>
                        </div>
                        {isComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button asChild variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro">
                <Link to="/command/claims">
                  <WalletCards className="mr-3 h-4 w-4" />
                  Rewards / Claims
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left font-retro">
                <Link to="/recruiters">
                  <Trophy className="mr-3 h-4 w-4" />
                  Recruiter leaderboard
                </Link>
              </Button>
            </div>
          </CommandCenterCard>
        </div>

        <CommandCenterCard title="Tracked recruits" description="Wallets currently attributed to your recruiter link.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {state?.recruits.length ? (
              state.recruits.map((recruit) => (
                <div key={recruit.id} className="rounded-2xl border border-border/50 bg-background/25 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-retro text-sm text-foreground">
                        {recruit.user?.displayName || shortAddress(recruit.user?.walletAddress || "Unknown")}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {recruit.user?.walletAddress ? shortAddress(recruit.user.walletAddress) : "Waiting for wallet connect"}
                      </div>
                    </div>
                    <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-accent">
                      {recruit.status}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <div>First seen: {formatDate(recruit.firstSeenAt)}</div>
                    <div>Wallet connected: {formatDate(recruit.walletConnectedAt)}</div>
                    <div>Verified: {formatDate(recruit.verifiedAt)}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">
                No recruits tracked yet. Share your referral link to start the squad pipeline.
              </div>
            )}
          </div>
        </CommandCenterCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Recruiter Application"
        description="Apply to Operation: Reinforcements from here. Once accepted, this page becomes your recruiter control room."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="font-retro">
            <Link to="/recruiters">
              Public leaderboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button onClick={() => void loadRecruiterState()} variant="outline" className="font-retro">
            Refresh
          </Button>
        </div>
      </CommandCenterPageHeader>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <CommandCenterCard title="Application status" description="Your recruiter application lives on your wallet-based War Missions profile.">
          <div className={`rounded-2xl border p-4 ${applicationTone(application?.status)}`}>
            <div className="font-retro text-sm text-foreground">{applicationLabel(application?.status)}</div>
            <p className="mt-2 text-sm">
              {application?.status === "rejected"
                ? "Update the application with a clearer plan or stronger contact details and resubmit."
                : application?.status === "review"
                  ? "Your application is currently being reviewed by the admin team."
                  : application?.status === "submitted"
                    ? "Your application is in the queue. You can still refresh here to check for approval."
                    : "This wallet has not submitted a recruiter application yet."}
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {recruiterBenefits.map((benefit) => (
              <div key={benefit} className="rounded-2xl border border-border/50 bg-background/25 p-3 text-sm text-muted-foreground">
                {benefit}
              </div>
            ))}
          </div>

          {application?.createdAt && (
            <div className="mt-4 rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">
              Last submission: {formatDate(application.createdAt)}
            </div>
          )}
        </CommandCenterCard>

        <CommandCenterCard title="Apply now" description="Add your social handles, tell us how you recruit, and estimate the squad you can bring in.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="recruiter-x">X username</Label>
              <Input
                id="recruiter-x"
                value={form.xUsername}
                onChange={(event) => setForm((current) => ({ ...current, xUsername: event.target.value }))}
                placeholder="@yourhandle"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recruiter-expected">Expected recruits</Label>
              <Input
                id="recruiter-expected"
                type="number"
                min={1}
                max={1000}
                value={form.expectedRecruits}
                onChange={(event) => setForm((current) => ({ ...current, expectedRecruits: event.target.value }))}
                placeholder="10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recruiter-telegram">Telegram username</Label>
              <Input
                id="recruiter-telegram"
                value={form.telegramUsername}
                onChange={(event) => setForm((current) => ({ ...current, telegramUsername: event.target.value }))}
                placeholder="@telegram"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recruiter-discord">Discord username</Label>
              <Input
                id="recruiter-discord"
                value={form.discordUsername}
                onChange={(event) => setForm((current) => ({ ...current, discordUsername: event.target.value }))}
                placeholder="discordname"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="recruiter-motivation">Why should this wallet be approved?</Label>
              <Textarea
                id="recruiter-motivation"
                rows={7}
                value={form.motivation}
                onChange={(event) => setForm((current) => ({ ...current, motivation: event.target.value }))}
                placeholder="Describe your audience, where you recruit, and how you plan to bring verified users into War Missions."
              />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 p-4">
            <div className="font-retro text-sm text-foreground">Milestones you can unlock</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {recruiterMilestones.map((milestone) => (
                <div key={milestone.label} className="rounded-2xl border border-border/50 bg-background/25 p-3">
                  <div className="font-retro text-sm text-foreground">{milestone.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{milestone.requirement}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void handleSubmit()} disabled={submitting} className="font-retro">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : application ? (
                "Update application"
              ) : (
                "Submit application"
              )}
            </Button>
            <Button asChild variant="outline" className="font-retro">
              <Link to="/recruiter">Read program overview</Link>
            </Button>
          </div>
        </CommandCenterCard>
      </div>
    </div>
  );
}