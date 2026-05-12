import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

type RecruiterPromoCardProps = {
  className?: string;
};

export function RecruiterPromoCard({ className }: RecruiterPromoCardProps) {
  const navigate = useNavigate();

  return (
    <div className={cn("mwz-card w-full min-h-[220px] p-4 md:p-5", className)}>
      <div className="grid min-h-[188px] grid-cols-[140px_minmax(0,1fr)] gap-4 items-center">
        <div className="relative flex items-center justify-center h-full border-r border-success/25 pr-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,153,0,0.18),transparent_58%)]" />
          <Users
            className="relative z-10 h-32 w-32 text-accent drop-shadow-[0_0_22px_rgba(255,153,0,0.55)]"
            strokeWidth={1.4}
          />
        </div>

        <div className="flex min-w-0 flex-col justify-between h-full py-1">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 mwz-section-title text-xl">
              <Users className="h-5 w-5" />
              Recruiters
            </div>
            <div className="mwz-muted text-base leading-8">
              <div>Build your squad.</div>
              <div>Bring creators and traders.</div>
              <div>Prepare for rewards.</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button className="mwz-button h-10 px-2 text-[11px] whitespace-nowrap" onClick={() => navigate("/recruiter")}>Learn More</Button>
            <Button className="mwz-button mwz-button-active h-10 px-2 text-[11px] whitespace-nowrap" onClick={() => navigate("/recruiter/signup")}>Sign Up</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
