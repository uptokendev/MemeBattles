import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/contexts/WalletContext";
import { fetchRecruiterByWallet, normalizeRecruiterCode, signupRecruiter, type Recruiter, type RecruiterSquad } from "@/lib/recruiterApi";

function shortWallet(wallet?: string | null) {
  if (!wallet) return "";
  return wallet.length > 12 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet;
}

function defaultCode(wallet: string) {
  return wallet ? `squad-${wallet.slice(2, 8)}` : "";
}

export default function RecruiterSignup() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const account = wallet.account || "";
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [existing, setExisting] = useState<{ recruiter: Recruiter; squad: RecruiterSquad; inviteUrl: string } | null>(null);

  useEffect(() => {
    if (!account || code) return;
    setCode(defaultCode(account));
  }, [account, code]);

  useEffect(() => {
    let alive = true;
    async function loadExisting() {
      if (!account) {
        setExisting(null);
        return;
      }
      setChecking(true);
      try {
        const result = await fetchRecruiterByWallet(account);
        if (alive) {
          setExisting(result);
          setCode(result.recruiter.code);
          setDisplayName(result.recruiter.displayName ?? "");
        }
      } catch {
        if (alive) setExisting(null);
      } finally {
        if (alive) setChecking(false);
      }
    }
    void loadExisting();
    return () => {
      alive = false;
    };
  }, [account]);

  const normalizedCode = useMemo(() => normalizeRecruiterCode(code), [code]);
  const canonicalInvite = normalizedCode ? `${window.location.origin}/r/${normalizedCode}` : "";

  const connectWallet = async () => {
    await wallet.connect();
  };

  const submit = async () => {
    if (!account) {
      await connectWallet();
      return;
    }
    if (!normalizedCode) {
      toast.error("Choose a recruiter code first");
      return;
    }

    setLoading(true);
    try {
      const result = await signupRecruiter({ wallet: account, code: normalizedCode, displayName });
      toast.success("Recruiter profile is ready");
      navigate(result.redirectTo || `/profile/${account}/command/recruiter`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recruiter signup failed");
    } finally {
      setLoading(false);
    }
  };

  const copyInvite = async () => {
    if (!canonicalInvite) return;
    await navigator.clipboard.writeText(canonicalInvite);
    toast.success("Invite link copied");
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-4xl items-center justify-center px-3 py-8">
      <Card className="w-full border-orange-500/20 bg-black/35 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Recruiter Program</CardTitle>
              <p className="text-sm text-muted-foreground">Create your canonical recruiter code and invite link.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-md border border-border/70 bg-background/50 p-4 text-sm">
            {account ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-muted-foreground">Connected wallet</span>
                <span className="font-mono text-foreground">{shortWallet(account)}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-muted-foreground">Connect a wallet to become a recruiter.</span>
                <Button onClick={connectWallet} disabled={wallet.connecting}>{wallet.connecting ? "Connecting..." : "Connect"}</Button>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Main Squad" maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Recruiter code</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="memewarzonemainsquad" maxLength={64} />
              {code && code !== normalizedCode && <p className="text-xs text-muted-foreground">Canonical code: {normalizedCode}</p>}
            </div>
          </div>

          {existing && (
            <div className="rounded-md border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-100">
              This wallet is already a recruiter. Squad: {existing.squad.active} active, {existing.squad.creators} creators, {existing.squad.traders} traders, {existing.squad.pending} pending roles.
            </div>
          )}

          <div className="space-y-2">
            <Label>Canonical invite link</Label>
            <div className="flex gap-2">
              <Input readOnly value={canonicalInvite || "Connect wallet and choose a code"} />
              <Button type="button" variant="outline" size="icon" onClick={copyInvite} disabled={!canonicalInvite} title="Copy invite link">
                <Copy className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={() => canonicalInvite && window.open(canonicalInvite, "_blank")} disabled={!canonicalInvite} title="Open invite link">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Invitees will be sent to <span className="font-mono">/r/{normalizedCode || ":code"}</span> and must choose creator or trader before attribution is saved.</p>
            <Button onClick={submit} disabled={loading || checking || !account || !normalizedCode}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existing ? "Update Recruiter" : "Become Recruiter"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
