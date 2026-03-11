import { cn } from "@/lib/utils";

type HeaderBandProps = {
  className?: string;
};

export function HeaderBand({ className }: HeaderBandProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative h-[210px] md:h-[220px] overflow-hidden rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(58,62,70,0.88),rgba(14,16,20,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.40),0_20px_46px_rgba(0,0,0,0.26)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,153,45,0.12),transparent_18%),radial-gradient(circle_at_80%_24%,rgba(255,110,0,0.10),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.18))]" />

        <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="h-5 rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(64,69,77,0.82),rgba(18,20,24,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" />
            <div className="h-8 w-10 rounded-xl border border-amber-400/20 bg-[linear-gradient(180deg,rgba(255,183,68,0.24),rgba(124,58,8,0.18))]" />
            <div className="h-5 rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(64,69,77,0.82),rgba(18,20,24,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" />
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative flex h-[150px] w-[270px] md:h-[165px] md:w-[360px] items-center justify-center rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(69,74,82,0.96),rgba(18,20,24,0.99))] px-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.42),0_18px_40px_rgba(0,0,0,0.30)]">
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-[1.9rem] bg-[linear-gradient(90deg,#f8cf45_0%,#ff9726_55%,#ff5a0d_100%)]" />
            <div className="absolute inset-0 rounded-[1.9rem] border border-white/5 [background:linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.04)_35%,transparent_60%)]" />
            <img
              src="/assets/logo.png"
              alt="Meme Battles"
              className="relative z-10 h-[126px] md:h-[142px] w-auto drop-shadow-[0_10px_26px_rgba(255,140,32,0.28)]"
              draggable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
