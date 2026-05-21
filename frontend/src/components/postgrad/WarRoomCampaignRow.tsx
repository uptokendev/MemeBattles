import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, ExternalLink, Globe, ShoppingCart } from "lucide-react";
import type { CampaignInfo } from "@/lib/launchpadClient";
import { Button } from "@/components/ui/button";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { CurvePriceChart } from "@/components/token/CurvePriceChart";
import { WarRoomTradePanel } from "@/components/postgrad/WarRoomTradePanel";

function shortenAddress(value?: string | null) {
  const input = String(value ?? "").trim();
  if (!input) return "—";
  if (input.length <= 10) return input;
  return `${input.slice(0, 6)}…${input.slice(-4)}`;
}

function resolveExternalHref(raw?: string | null) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function WarRoomCampaignRow({ campaign }: { campaign: CampaignInfo }) {
  const [expanded, setExpanded] = useState(false);

  const tokenRoute = `/token/${campaign.campaign.toLowerCase()}`;
  const websiteHref = resolveExternalHref(campaign.website);
  const xHref = campaign.xAccount ? `https://x.com/${campaign.xAccount.replace(/^@/, "")}` : null;

  const createdLabel = useMemo(() => {
    if (!campaign.createdAt) return "Recent listing";
    try {
      return new Date(Number(campaign.createdAt) * 1000).toLocaleDateString();
    } catch {
      return "Recent listing";
    }
  }, [campaign.createdAt]);

  return (
    <div className="border-b border-white/8 py-3 last:border-b-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="min-w-0 flex-1 rounded-2xl text-left transition-colors hover:bg-white/[0.03]"
        >
          <div className="flex items-center gap-3 px-1">
            <img
              src={campaign.logoURI || "/placeholder.svg"}
              alt={campaign.name}
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).src = "/placeholder.svg";
              }}
              className="h-11 w-11 rounded-2xl border border-white/10 object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-base font-semibold text-white">{campaign.name}</div>
                <div className="text-xs uppercase tracking-[0.22em] text-white/45">{campaign.symbol}</div>
                <TacticalTag label="Token" tone="default" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/55">
                <span>{shortenAddress(campaign.campaign)}</span>
                <span>Creator {shortenAddress(campaign.creator)}</span>
                <span>Listed {createdLabel}</span>
              </div>
            </div>
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Button asChild size="sm" variant="outline">
            <Link to={tokenRoute}>Token details</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExpanded((value) => !value)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 grid gap-4 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,24,0.88),rgba(8,9,12,0.94))] p-4 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="min-h-[360px] rounded-[20px] border border-white/10 bg-black/30 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Chart</div>
                <div className="mt-1 text-sm font-semibold text-white">Same market view as token details</div>
              </div>
              <TacticalTag label={campaign.symbol} tone="sponsored" />
            </div>
            <CurvePriceChart campaignAddress={campaign.campaign} />
          </div>

          <div className="space-y-3">
            <WarRoomTradePanel campaign={campaign} />

            <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Links</div>
              <div className="mt-4 flex flex-col gap-2">
                <Button asChild size="sm" variant="outline" className="justify-between">
                  <Link to={tokenRoute}>
                    Open token details
                    <ShoppingCart className="h-4 w-4" />
                  </Link>
                </Button>
                {websiteHref ? (
                  <Button asChild size="sm" variant="outline" className="justify-between">
                    <a href={websiteHref} target="_blank" rel="noreferrer">
                      Website
                      <Globe className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
                {xHref ? (
                  <Button asChild size="sm" variant="outline" className="justify-between">
                    <a href={xHref} target="_blank" rel="noreferrer">
                      X account
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
