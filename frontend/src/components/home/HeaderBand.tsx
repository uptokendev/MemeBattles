import { cn } from "@/lib/utils";

type HeaderBandProps = {
  className?: string;
};

export function HeaderBand({ className }: HeaderBandProps) {
  return (
    <div className={cn("mwz-hud-frame w-full", className)}>
      <div className="relative h-[124px] md:h-[142px] lg:h-[154px] overflow-visible px-5 md:px-7">
        <div className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-[linear-gradient(90deg,transparent,rgba(57,255,79,0.45),rgba(57,255,79,0.7),rgba(57,255,79,0.45),transparent)] shadow-[0_0_18px_rgba(57,255,79,0.28)]" />
        <div className="absolute inset-x-[15%] top-1/2 -translate-y-1/2 hidden md:flex items-center justify-between opacity-80">
          <div className="h-10 w-10 rounded-full border border-success/50 flex items-center justify-center text-success bg-black/45">⌖</div>
          <div className="h-px flex-1 mx-5 bg-[repeating-linear-gradient(90deg,rgba(57,255,79,0.6)_0_5px,transparent_5px_9px)]" />
          <div className="h-10 w-10 rounded-full border border-success/50 flex items-center justify-center text-success bg-black/45">⌖</div>
        </div>

        <div className="!absolute left-[5px] top-[5px] bottom-[5px] hidden md:flex items-center mwz-panel px-4 min-w-[250px]">
          <div className="mwz-section-title text-xs leading-6">
            <div>MWZ-TERMINAL V2.4.1</div>
            <div>COMMAND NODE: ONLINE</div>
            <div>SECURE LINK: ESTABLISHED</div>
          </div>
        </div>

        <div className="absolute right-8 top-2 hidden lg:block scale-[0.88] origin-top-right">
          <div className="mwz-radar">
            <div className="mwz-radar-sweep" />
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <img
            src="/assets/logo.png"
            alt="MemeWarzone"
            className="h-[118px] md:h-[138px] lg:h-[150px] w-auto drop-shadow-[0_0_24px_rgba(57,255,79,0.22)]"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
