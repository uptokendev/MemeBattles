import { Link } from "react-router-dom";
import { ArrowRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RecruiterPromoCardProps = {
  className?: string;
};

export function RecruiterPromoCard({ className }: RecruiterPromoCardProps) {
  return (
    <div
      className={cn(
        "pointer-events-auto mt-8 w-full overflow-hidden rounded-2xl border border-border/50 bg-[radial-gradient(circle_at_top_right,rgba(240,106,26,0.18),transparent_36%),linear-gradient(180deg,rgba(24,27,33,0.92),rgba(11,13,16,0.98))] shadow-[0_26px_70px_-38px_rgba(0,0,0,0.95)] transition-colors hover:border-accent/50",
        className,
      )}
    >
      <div className="grid min-h-[192px] grid-cols-[132px_minmax(0,1fr)] sm:grid-cols-[148px_minmax(0,1fr)] md:min-h-[210px] md:grid-cols-[168px_minmax(0,1fr)]">
        <div className="relative flex items-center justify-center border-r border-border/40 bg-gradient-to-br from-background/90 via-card/85 to-background/95 p-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(240,106,26,0.14),transparent_56%),radial-gradient(circle_at_30%_20%,rgba(57,227,23,0.08),transparent_32%)]" />
          <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-3xl border border-accent/25 bg-accent/10 shadow-[0_0_30px_rgba(240,106,26,0.15)] sm:h-24 sm:w-24 md:h-28 md:w-28">
            <Users className="h-10 w-10 text-accent sm:h-12 sm:w-12" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between p-4 md:p-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-[16px] font-bold uppercase tracking-[0.22em] text-accent/90">
              <Users className="h-4 w-4" />
              Recruiters
            </div>
            <div className="text-lg font-semibold leading-tight text-foreground md:text-xl">
              Become a Recruiter
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Build your squad before the Warzone opens. Bring in creators and traders, grow your network, and prepare for recruiter rewards.
            </p>
          </div>

          <div className="mt-4">
            <Button asChild className="w-full font-retro">
              <Link to="/recruiter">
                Become a Recruiter
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
