import { useEffect, useState } from "react";
import { CampaignTickerBar } from "@/components/home/CampaignTickerBar";
import { cn } from "@/lib/utils";

type HeaderBandProps = {
  className?: string;
};

// Launch reference timestamp. Override via VITE_LAUNCH_TS (ISO string, e.g.
// "2026-05-12T00:00:00Z"). Falls back to the platform site's creation date.
const LAUNCH_FALLBACK_ISO = "2026-04-24T12:26:01Z";

function getLaunchMs(): number {
  const raw = String(import.meta.env.VITE_LAUNCH_TS || "").trim();
  const parsed = raw ? Date.parse(raw) : NaN;
  if (Number.isFinite(parsed)) return parsed;
  return Date.parse(LAUNCH_FALLBACK_ISO);
}

function formatUptime(now: number, launch: number): string {
  const elapsed = Math.max(0, now - launch);
  const totalMinutes = Math.floor(elapsed / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(days)}D ${pad(hours)}H ${pad(minutes)}M`;
}

function useSystemUptime(): string {
  const [uptime, setUptime] = useState(() => formatUptime(Date.now(), getLaunchMs()));
  useEffect(() => {
    const launch = getLaunchMs();
    const tick = () => setUptime(formatUptime(Date.now(), launch));
    tick();
    // Align the first interval to the next minute boundary so the M digit
    // changes when the wall clock minute rolls over.
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    let intervalId: number | null = null;
    const initialTimeout = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, 60_000);
    }, msToNextMinute);
    return () => {
      if (intervalId) window.clearInterval(intervalId);
      window.clearTimeout(initialTimeout);
    };
  }, []);
  return uptime;
}

export function HeaderBand({ className }: HeaderBandProps) {
  const uptime = useSystemUptime();
  return (
    <>
      <section className={cn("mwz-tactical-hero", className)} aria-label="MemeWarzone command banner">
        <div className="mwz-tactical-hero__bg" />

        <div className="mwz-tactical-hero__terminal mwz-tactical-hero__terminal--left" aria-hidden="true">
          <div>MWZ TERMINAL V2.4.1</div>
          <div>STATUS: OPERATIONAL</div>
          <div>LINK: SECURE ▣</div>
          <div className="mwz-tactical-hero__node">
            NODE 07-A <span>▮▮▮▮▮▮</span>
          </div>
        </div>

        <div className="mwz-tactical-hero__terminal mwz-tactical-hero__terminal--right" aria-hidden="true">
          <div>SYSTEM UPTIME</div>
          <strong>{uptime}</strong>
          <div className="mwz-tactical-hero__pulse" />
        </div>

        <div className="mwz-tactical-hero__center">
          <img
            src="/assets/hero/orange_hud_true_transparent.png"
            alt=""
            className="mwz-tactical-hero__crosshair"
            draggable={false}
          />
          <img
            src="/assets/hero/logo.png"
            alt="MemeWarzone"
            className="mwz-tactical-hero__logo"
            draggable={false}
          />
        </div>

        <div className="mwz-tactical-hero__wave" aria-hidden="true" />
        <div className="mwz-tactical-hero__scanlines" aria-hidden="true" />
        <div className="mwz-tactical-hero__vignette" aria-hidden="true" />
      </section>

      <CampaignTickerBar />
    </>
  );
}
