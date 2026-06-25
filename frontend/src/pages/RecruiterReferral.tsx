import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Swords, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/contexts/WalletContext";
import { fetchRecruiterByCode, normalizeRecruiterCode, syncRecruiterAttribution, type Recruiter, type RecruiterRole, type RecruiterSquad } from "@/lib/recruiterApi";

const roleOptions: Array<{ role: RecruiterRole; title: string; description: string; icon: typeof Swords }> = [
  { role: "creator", title: "Creator", description: "I want to launch and grow campaigns.", icon: Swords },
  { role: "trader", title: "Trader", description: "I want to discover, trade, and back winners.", icon: TrendingUp },
];

function shortWallet(wallet?: string | null) {
  if (!wallet) return "";
  return wallet.length > 12 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet;
}

export default function RecruiterReferral() {
  const params = useParams();
  const wallet = useWallet();
  const code = useMemo(() => normalizeRecruiterCode(params.code ?? ""), [params.code]);
  const [selectedRole, setSelectedRole] = useState<RecruiterRole | null>(null);
  const [recruiter, setRecruiter] = useState<Recruiter | null>(null);
  const [squad, setSquad] = useState<RecruiterSquad | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function loadRecruiter() {
      if (!code) {
        setError("Recruiter code is missing");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await fetchRecruiterByCode(code);
        if (!alive) return;
        setRecruiter(result.recruiter);
        setSquad(result.squad);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Recruiter not found");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void loadRecruiter();
    return () => {
      alive = false;
    };
  }, [code]);

  const handleConnectAndLink = async () => {
    if (!selectedRole) {
      toast.error("Choose creator or trader before connecting your wallet");
      return;
    }

    setLinking(true);
    try {
      if (!wallet.account) {
        await wallet.connect();
      }
      const account = wallet.account || "";
      if (!account) {
        toast.info("Wallet connected. Confirm the attribution once your wallet address appears.");
        return;
      }
      const result = await syncRecruiterAttribution({ wallet: account, recruiterCode: code, memberRole: selectedRole });
      if (result?.needsRoleSelection) {
        toast.error("Choose creator or trader before attribution can be saved");
        return;
      }
      setLinked(true);
      toast.success("Recruiter attribution saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Attribution failed");
    } finally {
      setLinking(false);
    }
  };

  useEffect(() => {
    if (!wallet.account || !selectedRole || linked || !code) return;
    void syncRecruiterAttribution({ wallet: wallet.account, recruiterCode: code, memberRole: selectedRole })
      .then((result) => {
        if (!result?.needsRoleSelection) {
          setLinked(true);
          toast.success("Recruiter attribution saved");
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Attribution failed"));
  }, [wallet.account, selectedRole, linked, code]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-5xl items-center justify-center px-3 py-8">
      <Card className="w-full border-orange-500/20 bg-black/35 backdrop-blur">
        <CardHeader>
          <CardTitle>Join {recruiter?.displayName || recruiter?.code || "Recruiter Squad"}</CardTitle>
          <p className="text-sm text-muted-foreground">Choose your squad role before connecting your wallet. Attribution is not finalized until a role is selected.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center gap-2 rounded-md border border-border/70 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading recruiter...
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="Squad" value={String(squad?.active ?? 0)} />
                <Metric label="Creators" value={String(squad?.creators ?? 0)} />
                <Metric label="Traders" value={String(squad?.traders ?? 0)} />
                <Metric label="Pending" value={String(squad?.pending ?? 0)} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {roleOptions.map(({ role, title, description, icon: Icon }) => {
                  const active = selectedRole === role;
                  return (
                    <button
                      type="button"
                      key={role}
                      onClick={() => setSelectedRole(role)}
                      className={`rounded-lg border p-5 text-left transition ${active ? "border-orange-400 bg-orange-500/10" : "border-border/70 bg-background/40 hover:border-orange-400/60"}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-orange-500/10 text-orange-300">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-semibold">{title}</div>
                          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {wallet.account && !selectedRole && (
                <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
                  Wallet {shortWallet(wallet.account)} is connected, but attribution is waiting for a creator/trader choice.
                </div>
              )}

              {linked ? (
                <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-100">
                  <CheckCircle2 className="h-4 w-4" /> You are linked to {recruiter?.code} as a {selectedRole}.
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Canonical referral code: <span className="font-mono">{code}</span></p>
                  <Button onClick={handleConnectAndLink} disabled={linking || !selectedRole}>
                    {linking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {wallet.account ? "Save Attribution" : "Choose Role & Connect Wallet"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-background/40 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
