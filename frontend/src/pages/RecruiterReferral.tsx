import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { useWallet } from "@/contexts/WalletContext";
import {
  captureRecruiterReferral,
  fetchRecruiterReplacements,
  fetchWalletAttributionState,
  getRecruiterReferralMemberRole,
  setRecruiterReferralMemberRole,
  syncWalletRecruiterAttribution,
  type RecruiterMemberRole,
  type RecruiterSummary,
  type WalletAttributionPublicState,
} from "@/lib/recruiterApi";

type ReferralState = {
  recruiter: null | {
    code: string;
    displayName: string | null;
    isOg: boolean;
    status: string;
  };
  expiresAt: string | null;
};

function fallbackExpiresAt(days?: unknown): string | null {
  const parsed = Number(days);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const expiresAt = new Date(Date.now() + Math.trunc(parsed) * 24 * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

function normalizeReferralState(result: any, fallbackCode: string): ReferralState {
  const nestedRecruiter = result?.recruiter;
  const flatCode = result?.recruiterCode;
  const code = String(nestedRecruiter?.code || flatCode || fallbackCode || "").trim();

  return {
    recruiter: code
      ? {
          code,
          displayName: nestedRecruiter?.displayName ?? result?.recruiterDisplayName ?? null,
          isOg: Boolean(nestedRecruiter?.isOg ?? result?.recruiterIsOg),
          status: String(nestedRecruiter?.status || result?.recruiterStatus || "active"),
        }
      : null,
    expiresAt: result?.referral?.expiresAt ?? result?.expiresAt ?? fallbackExpiresAt(result?.expiresInDays),
  };
}

export default function RecruiterReferral() {
  const { code = "" } = useParams<{ code: string }>();
  const wallet = useWallet();
  const [loading, setLoading] = useState(true);
  const [syncingRole, setSyncingRole] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleMessage, setRoleMessage] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<RecruiterMemberRole | null>(() => getRecruiterReferralMemberRole());
  const [state, setState] = useState<ReferralState | null>(null);
  const [walletState, setWalletState] = useState<WalletAttributionPublicState | null>(null);
  const [replacementSuggestions, setReplacementSuggestions] = useState<RecruiterSummary[]>([]);

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
        const [result, currentWalletState, replacementData] = await Promise.all([
          captureRecruiterReferral(recruiterCode, wallet.account || null),
          wallet.account ? fetchWalletAttributionState(wallet.account).catch(() => null) : Promise.resolve(null),
          fetchRecruiterReplacements(recruiterCode, 3).catch(() => ({ replacements: [] })),
        ]);

        if (cancelled) return;
        setState(normalizeReferralState(result, recruiterCode));
        setWalletState(currentWalletState);
        setReplacementSuggestions(Array.isArray(replacementData?.replacements) ? replacementData.replacements : []);
      } catch (err: any) {
        if (cancelled) return;
        setError(String(err?.message || err || "Failed to capture referral"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, wallet.account]);

  const lockedToOtherRecruiter = useMemo(() => {
    const capturedCode = String(state?.recruiter?.code || code).trim().toLowerCase();
    const linkedCode = String(walletState?.recruiterCode || "").trim().toLowerCase();
    return Boolean(
      walletState?.recruiterLinkState === "linked_locked"
        && linkedCode
        && capturedCode
        && linkedCode !== capturedCode
    );
  }, [code, state?.recruiter?.code, walletState]);

  const chooseRole = async (role: RecruiterMemberRole) => {
    setMemberRole(role);
    setRecruiterReferralMemberRole(role);
    setRoleMessage(`Selected ${role}. Connect your wallet to lock this recruiter link.`);

    if (!wallet.account) return;
    setSyncingRole(true);
    try {
      const result = await syncWalletRecruiterAttribution(wallet.account, role);
      const nextWalletState = await fetchWalletAttributionState(wallet.account).catch(() => null);
      setWalletState(nextWalletState);
      if (result?.linked) setRoleMessage(`Wallet linked as ${role}.`);
      else if (result?.needsRoleSelection) setRoleMessage("Role saved. Reconnect or refresh if the backend has not linked yet.");
      else if (result?.blocked) setRoleMessage(result.reason || "This wallet cannot be linked as a squad member.");
      else setRoleMessage(result?.reason || `Selected ${role}. Connect your wallet to lock this recruiter link.`);
    } catch (err: any) {
      setRoleMessage(String(err?.message || err || "Could not sync recruiter attribution."));
    } finally {
      setSyncingRole(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-10">
      <Card className="overflow-hidden border-border/50 bg-card/70 p-6 md:p-8">
        <div className="space-y-4">
          <p className="font-retro text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Recruiter Invite
          </p>
          <h1 className="font-retro text-3xl text-foreground md:text-4xl">
            {loading ? "Saving your recruiter link..." : "Recruiter referral captured"}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
            This page stores the recruiter referral first. Choose whether this wallet joins as a creator or trader,
            then connect the wallet you want to lock to this recruiter.
          </p>
        </div>
      </Card>

      <Card className="border-border/50 bg-card/60 p-6">
        {error ? (
          <div className="space-y-3">
            <p className="font-medium text-destructive">{error}</p>
            <Button asChild variant="outline">
              <Link to="/">Back to app</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Recruiter</p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {state?.recruiter?.displayName || state?.recruiter?.code || code}
              </p>
              <p className="text-sm text-muted-foreground">
                Code: {state?.recruiter?.code || code}
                {state?.recruiter?.isOg ? " | OG recruiter" : ""}
              </p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
              <p className="text-sm text-muted-foreground">
                Referral window: {state?.expiresAt ? new Date(state.expiresAt).toLocaleString() : "stored"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Select your role before connecting. Without a role, the backend will hold the referral window but will
                not add the wallet to the squad roster.
              </p>
            </div>

            <div className="rounded-2xl border border-orange-400/25 bg-orange-400/10 p-4">
              <p className="font-retro text-xs uppercase tracking-[0.2em] text-orange-100">Choose your squad role</p>
              <p className="mt-2 text-sm text-orange-50/80">
                Creators prepare and launch campaigns. Traders join campaigns, trade, and support the battlefield.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant={memberRole === "creator" ? "default" : "outline"}
                  onClick={() => void chooseRole("creator")}
                  disabled={syncingRole}
                >
                  I am a creator
                </Button>
                <Button
                  type="button"
                  variant={memberRole === "trader" ? "default" : "outline"}
                  onClick={() => void chooseRole("trader")}
                  disabled={syncingRole}
                >
                  I am a trader
                </Button>
              </div>
              {roleMessage ? <p className="mt-3 text-sm text-orange-50/80">{roleMessage}</p> : null}
            </div>

            {lockedToOtherRecruiter ? (
              <div className="rounded-2xl border border-amber-300/35 bg-amber-300/10 p-4">
                <p className="font-retro text-xs uppercase tracking-[0.2em] text-amber-100">
                  Recruiter link already locked
                </p>
                <p className="mt-2 text-sm text-amber-50/90">
                  This wallet is already locked to recruiter{" "}
                  <span className="font-semibold">{walletState?.recruiterDisplayName || walletState?.recruiterCode}</span>.
                  This referral was stored, but it cannot replace the current recruiter because first activity already
                  happened on this wallet.
                </p>
                {walletState?.recruiterCode ? (
                  <Button asChild variant="outline" className="mt-4">
                    <Link to={`/recruiters/${encodeURIComponent(walletState.recruiterCode)}`}>
                      View current recruiter
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}

            {state?.recruiter?.status !== "active" && replacementSuggestions.length > 0 ? (
              <div className="rounded-2xl border border-sky-300/30 bg-sky-300/10 p-4">
                <p className="font-retro text-xs uppercase tracking-[0.2em] text-sky-100">
                  Active replacement suggestions
                </p>
                <div className="mt-3 flex flex-col gap-3">
                  {replacementSuggestions.map((replacement) => (
                    <Link
                      key={replacement.code}
                      to={`/recruiters/${encodeURIComponent(replacement.code)}`}
                      className="rounded-xl border border-sky-300/20 bg-background/35 px-4 py-3 text-sm text-foreground transition-colors hover:border-sky-300/40"
                    >
                      {replacement.displayName || replacement.code}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <ConnectWalletButton />
              <Button asChild variant="outline">
                <Link to={`/recruiters/${encodeURIComponent(code)}`}>View recruiter profile</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/">Continue to app</Link>
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
