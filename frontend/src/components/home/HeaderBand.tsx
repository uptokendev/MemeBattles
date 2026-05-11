import { CampaignTickerBar } from "@/components/home/CampaignTickerBar";
import { cn } from "@/lib/utils";

type HeaderBandProps = {
  className?: string;
};

export function HeaderBand({ className }: HeaderBandProps) {
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
          <strong>12D 04H 32M</strong>
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
