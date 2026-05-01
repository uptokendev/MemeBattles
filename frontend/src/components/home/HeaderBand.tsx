import { cn } from "@/lib/utils";

type HeaderBandProps = {
  className?: string;
};

export function HeaderBand({ className }: HeaderBandProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <div className="mwz-hud-frame relative h-[106px] md:h-[116px] lg:h-[126px] overflow-hidden px-5 md:px-7">
        <div className="absolute inset-0 mwz-stat-grid opacity-70" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(57,255,79,0.13),transparent_34%),linear-gradient(90deg,rgba(0,0,0,0.68),transparent_35%,transparent_65%,rgba(0,0,0,0.68))]" />

        <div className="absolute left-5 top-3 hidden md:block mwz-panel px-4 py-3 min-w-[250px]">
          <div className="mwz-section-title text-xs leading-6">
            <div>MWZ-TERMINAL V2.4.1</div>
            <div>COMMAND NODE: ONLINE</div>
            <div>SECURE LINK: ESTABLISHED</div>
          </div>
        </div>

        <div className="absolute right-36 top-3 hidden lg:block mwz-panel px-4 py-3 min-w-[228px]">
          <div className="mwz-section-title text-xs leading-5">
            <div>SYSTEM STATUS</div>
            <div>NET: SECURE</div>
            <div>WALLET: CONNECTED</div>
            <div>BLOCKCHAIN: SYNCED</div>
          </div>
        </div>

        <div className="absolute right-8 top-2 hidden lg:block scale-[0.82] origin-top-right">
          <div className="mwz-radar">
            <div className="mwz-radar-sweep" />
          </div>
        </div>

        <div className="absolute inset-x-[15%] top-1/2 -translate-y-1/2 hidden md:flex items-center justify-between opacity-80">
          <div className="h-10 w-10 rounded-full border border-success/50 flex items-center justify-center text-success">⌖</div>
          <div className="h-px flex-1 mx-5 bg-[repeating-linear-gradient(90deg,rgba(57,255,79,0.6)_0_5px,transparent_5px_9px)]" />
          <div className="h-10 w-10 rounded-full border border-success/50 flex items-center justify-center text-success">⌖</div>
        </div>

        <div className="mwz-scan-line" />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <img
            src="/assets/logo.png"
            alt="MemeWarzone"
            className="h-[104px] md:h-[116px] lg:h-[126px] w-auto drop-shadow-[0_0_24px_rgba(57,255,79,0.22)]"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
