import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getProtocolDeploymentReadiness,
  inspectProtocolDeployment,
  summarizeProtocolInspection,
  type EvmDeploymentChainId,
  type ProtocolContractGroup,
  type ProtocolContractInspection,
} from "@/lib/deploymentConfig";

const GROUPS: ProtocolContractGroup[] = ["Launch core", "Treasury and security", "Minimal Topaz"];

function shortAddress(address: string) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not configured";
}

function stateLabel(contract: ProtocolContractInspection) {
  if (contract.state === "live") return "Live";
  if (contract.state === "no_code") return "No code";
  if (contract.state === "rpc_error") return "RPC error";
  if (contract.state === "checking") return "Checking";
  return "Missing";
}

function StateIcon({ state }: { state: ProtocolContractInspection["state"] }) {
  if (state === "live") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (state === "checking") return <Loader2 className="h-4 w-4 animate-spin text-accent" />;
  if (state === "rpc_error") return <CircleAlert className="h-4 w-4 text-yellow-300" />;
  return <XCircle className="h-4 w-4 text-red-400" />;
}

export function ProtocolDeploymentStatus() {
  const [chainId, setChainId] = useState<EvmDeploymentChainId>(97);
  const [inspections, setInspections] = useState<ProtocolContractInspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  const configuredReadiness = useMemo(() => getProtocolDeploymentReadiness(chainId), [chainId]);
  const inspectionSummary = useMemo(() => summarizeProtocolInspection(inspections), [inspections]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setInspections(
      configuredReadiness.contracts.map((contract) => ({
        ...contract,
        state: contract.configured ? "checking" : "missing",
      })),
    );

    try {
      const next = await inspectProtocolDeployment(chainId);
      setInspections(next);
      setLastCheckedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, [chainId, configuredReadiness.contracts]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ready = inspections.length > 0 && inspectionSummary.ready;
  const configuredOnly = !inspections.length && configuredReadiness.configured;
  const liveCount = inspections.filter((contract) => contract.state === "live").length;

  return (
    <Card className="border-border bg-card/60 backdrop-blur">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="font-retro text-lg">Protocol Deployment</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Frontend configuration and live bytecode checks for the MemeWarzone launchpad and Minimal Topaz.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={chainId === 97 ? "default" : "outline"} onClick={() => setChainId(97)}>
              BNB Testnet
            </Button>
            <Button size="sm" variant={chainId === 56 ? "default" : "outline"} onClick={() => setChainId(56)}>
              BNB Mainnet
            </Button>
            <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background/40 px-3 py-2">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Required config</div>
            <div className="mt-1 font-mono text-sm">
              {configuredReadiness.configuredRequiredCount}/{configuredReadiness.requiredCount}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background/40 px-3 py-2">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Live contracts</div>
            <div className="mt-1 font-mono text-sm">
              {liveCount}/{inspections.length || configuredReadiness.contracts.length}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background/40 px-3 py-2">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Launch readiness</div>
            <div className={`mt-1 text-sm font-semibold ${ready ? "text-emerald-400" : configuredOnly ? "text-yellow-300" : "text-red-400"}`}>
              {ready ? "READY" : configuredOnly ? "CONFIGURED" : "NOT READY"}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {GROUPS.map((group) => {
          const contracts = (inspections.length ? inspections : configuredReadiness.contracts.map((contract) => ({ ...contract, state: contract.configured ? "checking" : "missing" } as ProtocolContractInspection))).filter(
            (contract) => contract.group === group,
          );

          return (
            <section key={group} className="space-y-2">
              <h3 className="font-retro text-xs uppercase tracking-[0.18em] text-accent">{group}</h3>
              <div className="overflow-hidden rounded-xl border border-border">
                {contracts.map((contract, index) => (
                  <div
                    key={contract.key}
                    className={`grid gap-2 px-3 py-3 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center ${index ? "border-t border-border" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        <StateIcon state={contract.state} />
                        <span>{contract.label}</span>
                        {!contract.requiredForLaunch ? (
                          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Optional</span>
                        ) : null}
                      </div>
                      {contract.error ? <div className="mt-1 truncate text-xs text-yellow-300" title={contract.error}>{contract.error}</div> : null}
                    </div>

                    <div className="font-mono text-xs text-muted-foreground" title={contract.address || undefined}>
                      {shortAddress(contract.address)}
                    </div>

                    <div className="flex items-center justify-between gap-3 md:justify-end">
                      <span className={`text-xs font-semibold ${contract.state === "live" ? "text-emerald-400" : contract.state === "rpc_error" ? "text-yellow-300" : "text-red-400"}`}>
                        {stateLabel(contract)}
                      </span>
                      {contract.explorerUrl ? (
                        <a
                          href={contract.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          Explorer <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <div className="text-xs text-muted-foreground">
          {lastCheckedAt ? `Last contract check: ${new Date(lastCheckedAt).toLocaleString()}` : "Contract bytecode has not been checked yet."}
        </div>
      </CardContent>
    </Card>
  );
}
