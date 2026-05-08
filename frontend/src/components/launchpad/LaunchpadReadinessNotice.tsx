import { AlertTriangle, CheckCircle2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { requestWalletChainSwitch, type LaunchpadWriteReadiness } from "@/lib/launchpadReadiness";

export function LaunchpadReadinessNotice({
  readiness,
  compact = false,
}: {
  readiness: LaunchpadWriteReadiness;
  compact?: boolean;
}) {
  const wallet = useWallet();

  if (readiness.ready && compact) return null;

  const Icon = readiness.ready ? CheckCircle2 : readiness.reason === "wallet_disconnected" ? Wallet : AlertTriangle;
  const tone = readiness.ready
    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
    : "border-accent/30 bg-accent/10 text-foreground";

  const handleAction = async () => {
    if (readiness.reason === "wallet_disconnected") {
      await wallet.connect();
      return;
    }

    if (readiness.reason === "wrong_chain" && readiness.targetChainId) {
      await requestWalletChainSwitch(wallet.provider, readiness.targetChainId);
    }
  };

  return (
    <div className={`rounded-2xl border p-4 md:p-5 ${tone}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <div className="font-retro text-base md:text-lg text-foreground">{readiness.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{readiness.message}</p>
          </div>
        </div>

        {readiness.actionLabel && (
          <Button
            type="button"
            onClick={handleAction}
            className="bg-accent hover:bg-accent/90 text-accent-foreground font-retro rounded-xl md:min-w-40"
          >
            {readiness.actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
