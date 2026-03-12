import { cn } from "@/lib/utils";

type HeaderBandProps = {
  className?: string;
};

export function HeaderBand({ className }: HeaderBandProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative h-[250px] md:h-[270px] overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(61,66,74,0.92),rgba(13,15,19,0.99))] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-1px_0_rgba(0,0,0,0.46),0_26px_56px_rgba(0,0,0,0.34)]">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(0,0,0,0.14)),radial-gradient(circle_at_18%_20%,rgba(255,164,58,0.18),transparent_18%),radial-gradient(circle_at_78%_20%,rgba(255,110,0,0.14),transparent_20%),radial-gradient(circle_at_50%_42%,rgba(255,130,20,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.02),transparent_20%,rgba(255,255,255,0.02)_21%,transparent_22%,transparent_48%,rgba(255,255,255,0.02)_49%,transparent_50%,transparent)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="absolute inset-x-0 top-8 h-[2px] bg-[linear-gradient(90deg,transparent,rgba(255,170,60,0.35),transparent)]" />
        <div className="absolute inset-x-0 bottom-8 h-[2px] bg-[linear-gradient(90deg,transparent,rgba(255,120,20,0.28),transparent)]" />

        {/* dirty structural rails */}
        <div className="absolute left-4 right-4 top-[44%] -translate-y-1/2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4">
            <div className="relative h-7 overflow-hidden rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(72,78,87,0.88),rgba(17,19,23,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.42)]">
              <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(135deg,transparent_0%,transparent_42%,rgba(255,255,255,0.06)_43%,transparent_44%,transparent_100%)] [background-size:42px_42px]" />
              <div className="absolute inset-y-[5px] left-3 right-3 rounded-full bg-black/25" />
            </div>
            <div className="relative h-10 w-12 overflow-hidden rounded-xl border border-amber-400/25 bg-[linear-gradient(180deg,rgba(255,194,84,0.30),rgba(110,46,6,0.18))] shadow-[0_0_28px_rgba(255,120,20,0.16)]">
              <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(135deg,transparent_0%,transparent_46%,rgba(255,255,255,0.16)_47%,transparent_48%)] [background-size:22px_22px]" />
            </div>
            <div className="relative h-7 overflow-hidden rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(72,78,87,0.88),rgba(17,19,23,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.42)]">
              <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(135deg,transparent_0%,transparent_42%,rgba(255,255,255,0.06)_43%,transparent_44%,transparent_100%)] [background-size:42px_42px]" />
              <div className="absolute inset-y-[5px] left-3 right-3 rounded-full bg-black/25" />
            </div>
          </div>
        </div>

        {/* side clutter plates */}
        <div className="absolute left-6 top-10 hidden md:block h-24 w-28 rotate-[-9deg] rounded-[1.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(55,59,67,0.76),rgba(14,16,20,0.95))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_32px_rgba(0,0,0,0.22)]">
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(135deg,transparent_0%,transparent_48%,rgba(255,255,255,0.08)_49%,transparent_50%)] [background-size:28px_28px]" />
          <div className="absolute left-3 top-3 h-2 w-2 rounded-full bg-stone-500/80" />
          <div className="absolute right-3 bottom-3 h-2 w-2 rounded-full bg-stone-500/80" />
        </div>
        <div className="absolute right-6 top-12 hidden md:block h-28 w-32 rotate-[8deg] rounded-[1.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(55,59,67,0.78),rgba(14,16,20,0.95))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_32px_rgba(0,0,0,0.22)]">
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(135deg,transparent_0%,transparent_48%,rgba(255,255,255,0.08)_49%,transparent_50%)] [background-size:28px_28px]" />
          <div className="absolute left-3 bottom-3 h-2 w-2 rounded-full bg-stone-500/80" />
          <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-stone-500/80" />
        </div>

        {/* chaotic emblem housing */}
        <div className="absolute inset-0 flex items-center justify-center pt-1 md:pt-0">
          <div className="relative flex h-[175px] w-[300px] md:h-[198px] md:w-[430px] items-center justify-center rounded-[2.15rem] border border-white/10 bg-[linear-gradient(180deg,rgba(74,80,88,0.98),rgba(18,20,24,1))] px-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.48),0_24px_54px_rgba(0,0,0,0.34)]">
            <div className="absolute inset-x-0 top-0 h-1.5 rounded-t-[2.15rem] bg-[linear-gradient(90deg,#f8cf45_0%,#ff9726_55%,#ff5a0d_100%)]" />
            <div className="absolute inset-0 rounded-[2.15rem] border border-white/5 [background:linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.05)_22%,transparent_36%,transparent_64%,rgba(255,255,255,0.04)_78%,transparent_100%)]" />
            <div className="absolute -left-5 top-5 hidden md:block h-[120px] w-[92px] rotate-[-10deg] rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(62,67,74,0.90),rgba(15,17,21,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_36px_rgba(0,0,0,0.24)]" />
            <div className="absolute -right-5 top-4 hidden md:block h-[126px] w-[96px] rotate-[8deg] rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(62,67,74,0.90),rgba(15,17,21,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_36px_rgba(0,0,0,0.24)]" />
            <div className="absolute -bottom-5 left-1/2 h-9 w-[72%] -translate-x-1/2 rounded-[1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(64,69,77,0.96),rgba(14,16,20,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_24px_rgba(0,0,0,0.24)]" />
            <div className="absolute inset-0">
              <div className="absolute left-1/2 top-[44%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/20 blur-2xl" />
              <div className="absolute left-[35%] top-[38%] h-16 w-16 rounded-full bg-amber-300/10 blur-xl" />
              <div className="absolute right-[35%] top-[38%] h-16 w-16 rounded-full bg-orange-400/10 blur-xl" />
            </div>
            <img
              src="/assets/logo.png"
              alt="Meme Battles"
              className="relative z-10 h-[138px] md:h-[162px] w-auto drop-shadow-[0_14px_32px_rgba(255,140,32,0.34)]"
              draggable={false}
            />
          </div>
        </div>

        {/* lower armor wedges / grime */}
        <div className="absolute bottom-0 left-0 right-0 h-20">
          <div className="absolute left-[11%] bottom-4 h-7 w-[20%] rotate-[-7deg] rounded-[1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(59,63,70,0.84),rgba(15,17,21,0.98))]" />
          <div className="absolute right-[11%] bottom-4 h-7 w-[20%] rotate-[7deg] rounded-[1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(59,63,70,0.84),rgba(15,17,21,0.98))]" />
          <div className="absolute inset-x-0 bottom-0 h-14 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.34))]" />
        </div>

        {/* rivets */}
        <div className="absolute left-4 top-4 h-2.5 w-2.5 rounded-full bg-stone-500/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" />
        <div className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-stone-500/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" />
        <div className="absolute left-4 bottom-4 h-2.5 w-2.5 rounded-full bg-stone-500/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" />
        <div className="absolute right-4 bottom-4 h-2.5 w-2.5 rounded-full bg-stone-500/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" />
       </div>
    </div>
  );
}
