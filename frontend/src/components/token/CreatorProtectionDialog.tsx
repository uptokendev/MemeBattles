import { useEffect, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CreatorProtectionDetail = {
  code?: string | null;
  creatorWallet?: string | null;
  creatorLinked?: boolean;
  relationship?: "creator" | "confirmed_cluster" | string | null;
  tier?: string | null;
  tierNumber?: number | null;
  unlockAt?: string | null;
  creatorBuyCapWei?: string | null;
  creatorBoughtWei?: string | null;
  requestedWei?: string | null;
  remainingWei?: string | null;
  error?: string | null;
};

function formatBnb(raw?: string | null): string {
  try {
    const wei = BigInt(String(raw || "0"));
    const whole = wei / 10n ** 18n;
    const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "").slice(0, 6);
    return `${whole.toString()}${fraction ? `.${fraction}` : ""} BNB`;
  } catch {
    return "—";
  }
}

function formatUnlock(value?: string | null): string {
  if (!value) return "the end of the protection period";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function CreatorProtectionDialog() {
  const [detail, setDetail] = useState<CreatorProtectionDetail | null>(null);

  useEffect(() => {
    const onBlocked = (event: Event) => {
      const next = (event as CustomEvent<CreatorProtectionDetail>).detail;
      if (next) setDetail(next);
    };
    window.addEventListener("mwz:creatorProtectionBlocked", onBlocked as EventListener);
    return () => window.removeEventListener("mwz:creatorProtectionBlocked", onBlocked as EventListener);
  }, []);

  const copy = useMemo(() => {
    const code = String(detail?.code || "");
    const tierNumber = Number(detail?.tierNumber || 1);
    const tierLabel = detail?.tier || `Tier ${tierNumber}`;
    const cap = formatBnb(detail?.creatorBuyCapWei);
    const unlock = formatUnlock(detail?.unlockAt);

    if (code === "CREATOR_CLUSTER_BUY_CAP_EXCEEDED") {
      return {
        title: "Creator Cluster Buy Cap Reached",
        body: `This buy would exceed the ${cap} combined purchase allowance for the ${tierLabel} creator wallet and its confirmed linked wallets.`,
        note: detail?.remainingWei != null ? `Remaining creator-cluster allowance: ${formatBnb(detail.remainingWei)}.` : null,
      };
    }

    if (code === "CREATOR_CLUSTER_CHECK_UNAVAILABLE" || code === "CREATOR_CLUSTER_CAP_CHECK_UNAVAILABLE") {
      return {
        title: "Protection Check Unavailable",
        body: "MemeWarzone could not safely verify the creator-cluster protection for this campaign. No trading authorization was issued and MetaMask was not opened.",
        note: "Try again after the security service and RPC connection are healthy.",
      };
    }

    if (detail?.relationship === "confirmed_cluster" || code === "CREATOR_CLUSTER_BUY_LOCKED") {
      return {
        title: "Creator-Linked Wallet",
        body: `This wallet is linked to the ${tierLabel} campaign creator. Creator-linked wallets cannot buy this campaign during the creator protection period.`,
        note: `This campaign-specific restriction ends at ${unlock}. The combined creator-cluster allowance after that time is ${cap}.`,
      };
    }

    return {
      title: `Tier ${tierNumber} Creator Buy Protection`,
      body: `As a ${tierLabel} creator, you cannot buy your own token during the first ${tierNumber === 1 ? "24 hours" : tierNumber === 2 ? "6 hours" : "1 hour"}.`,
      note: `You can participate after ${unlock}. Your creator wallet and confirmed linked wallets share a combined allowance of ${cap}.`,
    };
  }, [detail]);

  const openTierRules = () => {
    window.dispatchEvent(new CustomEvent("mwz:openTokenSafety"));
    setDetail(null);
  };

  return (
    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
      <DialogContent className="max-w-md border-amber-500/35 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/35 bg-amber-500/10">
            <ShieldAlert className="h-6 w-6 text-amber-300" />
          </div>
          <DialogTitle className="font-retro text-base md:text-lg">{copy.title}</DialogTitle>
          <DialogDescription className="space-y-3 text-left text-sm leading-6 text-muted-foreground">
            <span className="block">{copy.body}</span>
            {copy.note ? <span className="block rounded-xl border border-border/60 bg-muted/20 p-3 text-foreground/85">{copy.note}</span> : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="secondary" onClick={openTierRules}>View Tier Rules</Button>
          <Button type="button" onClick={() => setDetail(null)}>Understood</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
