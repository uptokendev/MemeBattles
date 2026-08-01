import { Clock3, Layers, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CreatorArmBlockReason = "cooldown" | "live_limit" | "restricted" | "manual_review" | "generic";

export type CreatorArmEligibilityDialogDetail = {
  reason: CreatorArmBlockReason;
  mode?: "now" | "scheduled" | null;
  cooldownEndsAt?: number | null;
  currentLiveCount?: number | null;
  maxLiveBonding?: number | null;
  message?: string | null;
};

function formatLocal(seconds?: number | null) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function CreatorArmEligibilityDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: CreatorArmEligibilityDialogDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const modeLabel = detail?.mode === "scheduled" ? "Deploy with countdown" : detail?.mode === "now" ? "Deploy now" : "deploy";
  const unlockLabel = formatLocal(detail?.cooldownEndsAt);
  const liveCount = Number(detail?.currentLiveCount ?? 0);
  const liveLimit = Number(detail?.maxLiveBonding ?? 0);
  const liveKnown = liveLimit > 0;

  const title =
    detail?.reason === "cooldown"
      ? "Creator arm cooldown is active"
      : detail?.reason === "live_limit"
        ? "Live campaign limit reached"
        : detail?.reason === "restricted"
          ? "Creator wallet restricted"
          : detail?.reason === "manual_review"
            ? "Manual review required"
            : "Deployment not available right now";

  const lead =
    detail?.reason === "cooldown"
      ? `You cannot use ${modeLabel} until the creator arm cooldown ends${unlockLabel ? ` (${unlockLabel})` : ""}.`
      : detail?.reason === "live_limit"
        ? `You already hold the maximum number of live campaigns${liveKnown ? ` (${liveCount} / ${liveLimit})` : ""}.`
        : detail?.message || "This wallet cannot deploy or arm another campaign right now.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-orange-500/35 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/35 bg-orange-500/10">
            <ShieldAlert className="h-6 w-6 text-orange-300" />
          </div>
          <DialogTitle className="font-retro text-base md:text-lg">{title}</DialogTitle>
          <DialogDescription className="space-y-3 text-left text-sm leading-6 text-muted-foreground">
            <span className="block text-foreground/90">{lead}</span>

            <span className="block rounded-xl border border-border/60 bg-muted/20 p-3 text-foreground/85">
              <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-orange-300">
                <Clock3 className="h-3.5 w-3.5" />
                Two different clocks
              </span>
              <span className="block space-y-2">
                <span className="block">
                  <strong className="text-foreground">Creator arm cooldown</strong> starts when you pay gas and the campaign is created on-chain
                  (Deploy now or Deploy with countdown). It limits how often <em>you</em> may arm another campaign.
                </span>
                <span className="block">
                  <strong className="text-foreground">Trading open time</strong> is only when the public can buy/sell. A timer set days ahead does{" "}
                  <em>not</em> delay or reset the arm cooldown.
                </span>
              </span>
            </span>

            <span className="block rounded-xl border border-orange-500/25 bg-black/30 p-3">
              <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-orange-300">
                <Layers className="h-3.5 w-3.5" />
                What you can still do
              </span>
              <span className="grid gap-2 text-foreground/90">
                <span>• Prepare, edit, and publish as many drafts as your draft limit allows.</span>
                <span>• Arm or deploy at most one campaign every 24 hours per creator wallet.</span>
                <span>
                  • Hold at most your tier&apos;s live campaigns at once
                  {liveKnown ? ` (currently ${liveCount} / ${liveLimit})` : " (Tier 1 = 3, including timed arms not yet trading)"}.
                </span>
                {detail?.reason === "live_limit" ? (
                  <span>• Free a slot by graduating an existing live campaign, then try again.</span>
                ) : null}
                {detail?.reason === "cooldown" && unlockLabel ? (
                  <span>• Retry {modeLabel} after {unlockLabel}.</span>
                ) : null}
              </span>
            </span>

            {detail?.message && detail.reason !== "generic" ? (
              <span className="block text-xs text-muted-foreground">{detail.message}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Understood
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Map eligibility / API errors into dialog content. Returns null for unrelated failures. */
export function classifyCreatorArmBlock(input: {
  mode?: "now" | "scheduled" | null;
  eligibility?: {
    allowed?: boolean;
    cooldownEndsAt?: number;
    currentLiveCount?: number;
    maxLiveBonding?: number;
    restricted?: boolean;
    manualReviewRequired?: boolean;
  } | null;
  errorMessage?: string | null;
}): CreatorArmEligibilityDialogDetail | null {
  const now = Math.floor(Date.now() / 1000);
  const eligibility = input.eligibility;
  const text = String(input.errorMessage || "").toLowerCase();

  if (eligibility && eligibility.allowed === false) {
    if (eligibility.restricted) {
      return { reason: "restricted", mode: input.mode, ...counts(eligibility), message: input.errorMessage };
    }
    if (eligibility.manualReviewRequired) {
      return { reason: "manual_review", mode: input.mode, ...counts(eligibility), message: input.errorMessage };
    }
    if (Number(eligibility.currentLiveCount) >= Number(eligibility.maxLiveBonding) && Number(eligibility.maxLiveBonding) > 0) {
      return { reason: "live_limit", mode: input.mode, ...counts(eligibility), message: input.errorMessage };
    }
    if (Number(eligibility.cooldownEndsAt) > now) {
      return {
        reason: "cooldown",
        mode: input.mode,
        cooldownEndsAt: Number(eligibility.cooldownEndsAt),
        ...counts(eligibility),
        message: input.errorMessage,
      };
    }
    return { reason: "generic", mode: input.mode, ...counts(eligibility), message: input.errorMessage };
  }

  if (!text) return null;

  if (text.includes("live campaign limit") || text.includes("live-limit") || text.includes("maxlive") || text.includes("live bonding")) {
    return { reason: "live_limit", mode: input.mode, message: input.errorMessage };
  }
  if (text.includes("cooldown") || text.includes("cannot deploy or arm another") || text.includes("cannot arm another")) {
    const isoMatch = String(input.errorMessage || "").match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/);
    let cooldownEndsAt: number | null = null;
    if (isoMatch) {
      const ms = Date.parse(isoMatch[0]);
      if (Number.isFinite(ms)) cooldownEndsAt = Math.floor(ms / 1000);
    }
    return { reason: "cooldown", mode: input.mode, cooldownEndsAt, message: input.errorMessage };
  }
  if (text.includes("restricted")) {
    return { reason: "restricted", mode: input.mode, message: input.errorMessage };
  }
  if (text.includes("manual review")) {
    return { reason: "manual_review", mode: input.mode, message: input.errorMessage };
  }

  return null;
}

function counts(eligibility: {
  currentLiveCount?: number;
  maxLiveBonding?: number;
  cooldownEndsAt?: number;
}) {
  return {
    currentLiveCount: Number(eligibility.currentLiveCount ?? 0),
    maxLiveBonding: Number(eligibility.maxLiveBonding ?? 0),
    cooldownEndsAt: Number(eligibility.cooldownEndsAt ?? 0) || null,
  };
}
