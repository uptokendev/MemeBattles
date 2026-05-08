import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatEther } from "ethers";
import { ArrowRight, Copy, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  fetchRecruiterReplacements,
  fetchRecruiterSummary,
  fetchSquadSummary,
  type RecruiterSummary,
  type SquadSummary,
} from "@/lib/recruiterApi";

function formatBnb(raw: string): string {
  try {
    const value = Number(formatEther(BigInt(raw || "0")));
    return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 });
  } catch {
    return "0";
  }
}

function formatDate(value: string | null): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not yet" : date.toLocaleString();
}

function statusTone(status: string): string {
  switch (status) {
    case "active":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
    case "closed":
      return "border-rose-400/30 bg-rose-400/10 text-rose-200";
    case "inactive":
      return "border-amber-300/30 bg-amber-300/10 text-amber-100";
    default:
      return "border-slate-400/30 bg-slate-400/10 text-slate-200";
  }
}

export default function RecruiterProfile() {
  const { code = "" } = useParams<{ code: string }>();
  const [summary, setSummary] = useState<RecruiterSummary | null>(null);
  const [squad, setSquad] = useState<SquadSummary | null>(null);
  const [replacements, setReplacements] = useState<RecruiterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const recruiterCode = code.trim();
    if (!recruiterCode) {
      setLoading(false);
      setError("Recruiter code missing.");
      return;
    }

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const recruiter = await fetchRecruiterSummary(recruiterCode);
        const [squadSummary, replacementData] = await Promise.all([
          fetchSquadSummary(recruiterCode).catch(() => null),
          fetchRecruiterReplacements(recruiterCode, 4).catch(() => ({ replacements: [] })),
        ]);

        if (cancelled) return;
        setSummary(recruiter);
        setSquad(squadSummary);
        setReplacements(Array.isArray(replacementData?.replacements) ? replacementData.replacements : []);
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message || err || "Failed to load recruiter profile"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  const referralLink = useMemo(() => {
    if (!summary) return "";
    if (typeof window === "undefined") return `/r/${summary.code}`;
    return `${window.location.origin}/r/${summary.code}`;
  }, [summary]);

  const handleCopyLink = async () => {
    if (!referralLink || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl py-10">
        <Card className="border-border/60 bg-card/65 px-6 py-16 text-center text-sm text-muted-foreground">
          Loading recruiter profile...
        </Card>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="mx-auto max-w-5xl py-10">
        <Card className="border-rose-400/30 bg-rose-400/10 px-6 py-16 text-center text-sm text-rose-100">
          {error || "Recruiter profile not found."}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-8">
      <Card className="overflow-hidden border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(115,205,255,0.14),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(240,106,26,0.18),transparent_38%),linear-gradient(180deg,rgba(16,19,25,0.94),rgba(8,10,14,0.98))] p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${statusTone(summary.status)}`}>
                {summary.status}
              </span>
              {summary.isOg ? (
                <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-sky-100">
                  OG recruiter
                </span>
              ) : null}
            </div>
            <h1 className="font-retro text-3xl text-foreground md:text-5xl">
              {summary.displayName || summary.code}
            </h1>
            <p className="font-retro text-xs uppercase tracking-[0.24em] text-muted-foreground">
              /r/{summary.code}
            </p>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
              This profile is powered by the recruiter summary read model, so linked users, routed events, and earnings
              stay tied to attribution state instead of frontend-only counters.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleCopyLink} variant="outline" className="font-retro">
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copied" : "Copy referral link"}
            </Button>
            <Button asChild className="font-retro">
              <Link to={referralLink.replace(typeof window !== "undefined" ? window.location.origin : "", "") || `/r/${summary.code}`}>
                Open referral page
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/60 bg-card/70 p-5">
          <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Linked wallets</p>
          <p className="mt-4 font-retro text-3xl text-foreground">{summary.linkedWalletCount}</p>
        </Card>
        <Card className="border-border/60 bg-card/70 p-5">
          <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Claimable</p>
          <p className="mt-4 font-retro text-3xl text-foreground">{formatBnb(summary.claimableEarningsRaw)} BNB</p>
        </Card>
        <Card className="border-border/60 bg-card/70 p-5">
          <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Claimed lifetime</p>
          <p className="mt-4 font-retro text-3xl text-foreground">{formatBnb(summary.claimedLifetimeRaw)} BNB</p>
        </Card>
        <Card className="border-border/60 bg-card/70 p-5">
          <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Routed volume</p>
          <p className="mt-4 font-retro text-3xl text-foreground">{formatBnb(summary.referredVolumeRaw)} BNB</p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <Card className="border-border/60 bg-card/65 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-retro text-xs uppercase tracking-[0.22em] text-muted-foreground">Profile stats</p>
              <h2 className="mt-1 font-retro text-xl text-foreground">Recruiter performance</h2>
            </div>
            <Users className="h-5 w-5 text-amber-200" />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Linked creators</p>
              <p className="mt-2 font-retro text-2xl text-foreground">{summary.linkedCreatorsCount}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Linked traders</p>
              <p className="mt-2 font-retro text-2xl text-foreground">{summary.linkedTradersCount}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Last referred event</p>
              <p className="mt-2 font-retro text-sm text-foreground">{formatDate(summary.lastReferredEventAt)}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Last claim</p>
              <p className="mt-2 font-retro text-sm text-foreground">{formatDate(summary.lastClaimedAt)}</p>
            </div>
          </div>

          {squad ? (
            <div className="mt-6 rounded-2xl border border-border/60 bg-background/35 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Squad snapshot</p>
                  <h3 className="mt-1 font-retro text-lg text-foreground">Current squad posture</h3>
                </div>
                <ShieldCheck className="h-4 w-4 text-sky-200" />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Active members</p>
                  <p className="mt-1 font-retro text-xl text-foreground">{squad.activeMemberCount}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Eligible members</p>
                  <p className="mt-1 font-retro text-xl text-foreground">{squad.eligibleMemberCount}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Pending squad pool</p>
                  <p className="mt-1 font-retro text-xl text-foreground">{formatBnb(squad.estimatedPendingPoolAmount)} BNB</p>
                </div>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="border-border/60 bg-card/65 p-6">
          <div>
            <p className="font-retro text-xs uppercase tracking-[0.22em] text-muted-foreground">Replacement path</p>
            <h2 className="mt-1 font-retro text-xl text-foreground">If this recruiter closes</h2>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            Closed recruiters detach linked users back to solo status. These are active alternatives the frontend can
            surface when someone needs to rejoin under a different recruiter.
          </p>

          <div className="mt-5 space-y-3">
            {replacements.length === 0 ? (
              <div className="rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                No replacement suggestions are available yet.
              </div>
            ) : (
              replacements.map((replacement) => (
                <Link
                  key={replacement.code}
                  to={`/recruiters/${encodeURIComponent(replacement.code)}`}
                  className="block rounded-2xl border border-border/60 bg-background/35 p-4 transition-colors hover:border-sky-300/35 hover:bg-background/55"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-retro text-sm text-foreground">
                        {replacement.displayName || replacement.code}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        /r/{replacement.code}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-sky-100">
                      View
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
