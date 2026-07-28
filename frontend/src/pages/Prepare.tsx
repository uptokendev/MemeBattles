import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Rocket } from "lucide-react";

import PrepareBase from "./PrepareBase";
import { ScheduledLaunchCountdown } from "@/components/prepare/ScheduledLaunchCountdown";
import { Button } from "@/components/ui/button";
import {
  fetchPublicCampaignLifecycleDrafts,
  readCampaignLaunchAt,
  timestampSeconds,
  type CampaignDraftLifecycle,
} from "@/lib/scheduledLaunchApi";

export default function Prepare() {
  const { slug = "memewarzone-mwz-demo" } = useParams();
  const [draft, setDraft] = useState<CampaignDraftLifecycle | null>(null);
  const [onChainLaunchAt, setOnChainLaunchAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void fetchPublicCampaignLifecycleDrafts({ limit: 500 })
      .then((items) => {
        if (cancelled) return;
        setDraft(items.find((item) => String(item.slug) === String(slug)) || null);
      })
      .catch(() => {
        if (!cancelled) setDraft(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const storedScheduledLaunchAt = timestampSeconds(draft?.scheduledLaunchAt);

  useEffect(() => {
    let cancelled = false;
    setOnChainLaunchAt(null);
    if (!storedScheduledLaunchAt || !draft?.campaignAddress || !draft.chainId) return;
    void readCampaignLaunchAt(Number(draft.chainId), draft.campaignAddress).then((value) => {
      if (!cancelled) setOnChainLaunchAt(value);
    });
    return () => {
      cancelled = true;
    };
  }, [draft?.campaignAddress, draft?.chainId, storedScheduledLaunchAt]);

  const isScheduledLifecycle = Boolean(draft?.campaignAddress && storedScheduledLaunchAt);
  const launchAt = isScheduledLifecycle ? onChainLaunchAt || storedScheduledLaunchAt : null;

  useEffect(() => {
    if (!launchAt) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [launchAt]);

  const launched = Boolean(
    isScheduledLifecycle &&
      launchAt &&
      Math.floor(nowMs / 1000) >= launchAt &&
      draft?.campaignAddress,
  );

  const liveRoute = useMemo(() => {
    const address = draft?.tokenAddress || draft?.campaignAddress;
    return address ? `/token/${encodeURIComponent(address)}` : null;
  }, [draft?.campaignAddress, draft?.tokenAddress]);

  return (
    <div data-scheduled-lifecycle={isScheduledLifecycle ? "true" : "false"} className="relative">
      {isScheduledLifecycle && launchAt ? (
        <section className="relative z-40 -mx-2 border-b border-orange-400/35 bg-[radial-gradient(circle_at_50%_0%,rgba(255,153,0,0.19),transparent_65%),rgba(0,0,0,0.96)] px-4 py-5 md:-mx-3 md:px-8 md:py-7 lg:-mx-4">
          <div className="mx-auto max-w-7xl">
            <ScheduledLaunchCountdown
              launchAt={launchAt}
              chainId={draft?.chainId}
              campaignAddress={draft?.campaignAddress}
              contractDeployed={Boolean(draft?.campaignAddress)}
            />

            {launched && liveRoute ? (
              <div className="mt-4 flex flex-col items-center justify-between gap-4 border border-green-400/35 bg-green-500/5 px-5 py-4 text-center md:flex-row md:text-left">
                <div>
                  <div className="font-retro text-xl uppercase tracking-[0.08em] text-green-300">
                    Promotion page remains active
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Community activity, creator updates, watchlists, and transmissions remain available here after launch.
                  </p>
                </div>
                <Button asChild className="mwz-button mwz-button-orange h-12 shrink-0 px-6 font-retro">
                  <Link to={liveRoute}>
                    <Rocket className="mr-2 h-4 w-4" />
                    Open live campaign
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {isScheduledLifecycle ? (
        <style>{`
          [data-scheduled-lifecycle="true"] main > section:first-child > div:nth-of-type(2) { display: none !important; }
          ${launched ? '[data-scheduled-lifecycle="true"] main > section:last-child { display: none !important; }' : ""}
        `}</style>
      ) : null}

      <PrepareBase />
    </div>
  );
}
