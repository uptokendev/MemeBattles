import { Link } from "react-router-dom";
import { ArrowRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RecruiterPromoCardProps = {
  className?: string;
};

export function RecruiterPromoCard({ className }: RecruiterPromoCardProps) {
  return (
    <div className={cn("mwz-card w-full min-h-[220px] p-4 md:p-5", className)}>
      <div className="grid min-h-[188px] grid-cols-[140px_minmax(0,1fr)] gap-4 items-center">
        <div className="relative flex items-center justify-center h-full border-r border-success/25 pr-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(57,255,79,0.18),transparent_58%)]" />
          <div className="relative z-10 flex h-28 w-28 items-center justify-center border border-success/40 bg-success/10 shadow-[0_0_30px_rgba(57,255,79,0.18)]">
            <Users className="h-14 w-14 text-success" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between h-full py-1">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 mwz-section-title text-xl">
              <Users className="h-5 w-5" />
              Recruiters
            </div>
            <div className="mwz-muted text-base leading-7">
              <div>Build your squad.</div>
              <div>Bring creators and traders.</div>
              <div>Prepare for rewards.</div>
            </div>
          </div>

          <div className="mt-4">
            <Button asChild className="mwz-button mwz-button-active w-full h-10 text-xs">
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
