import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

type RecruiterPromoCardProps = {
  className?: string;
  compact?: boolean;
};

export function RecruiterPromoCard({ className, compact = false }: RecruiterPromoCardProps) {
  const navigate = useNavigate();

  return (
    <div className={cn(
      "mwz-card w-full",
      compact ? "min-h-[160px] p-3 md:p-4" : "min-h-[220px] p-4 md:p-5",
      className
    )}>
      <div className={cn(
        "grid items-center",
        compact 
          ? "min-h-[130px] grid-cols-[80px_minmax(0,1fr)] gap-3" 
          : "min-h-[188px] grid-cols-[140px_minmax(0,1fr)] gap-4"
      )}>
        <div className={cn(
          "relative flex items-center justify-center h-full border-r border-success/25 pr-3",
          compact && "pr-2"
        )}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,153,0,0.18),transparent_58%)]" />
          <Users
            className={cn(
              "relative z-10 text-accent drop-shadow-[0_0_22px_rgba(255,153,0,0.55)]",
              compact ? "h-16 w-16" : "h-32 w-32"
            )}
            strokeWidth={compact ? 1.6 : 1.4}
          />
        </div>

        <div className="flex min-w-0 flex-col justify-between h-full py-1">
          <div className="space-y-2">
            <div className={cn(
              "inline-flex items-center gap-2 mwz-section-title",
              compact ? "text-base" : "text-xl"
            )}>
              <Users className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
              Recruiters
            </div>
            <div className={cn(
              "mwz-muted leading-snug",
              compact ? "text-xs" : "text-base leading-8"
            )}>
              <div>Build your squad.</div>
              <div>Bring creators and traders.</div>
              {!compact && <div>Prepare for rewards.</div>}
            </div>
          </div>

          <div className={cn(
            "mt-3 grid gap-2",
            compact ? "grid-cols-1" : "grid-cols-2"
          )}>
            <Button 
              className={cn(
                "mwz-button whitespace-nowrap",
                compact ? "h-8 px-2 text-[10px]" : "h-10 px-2 text-[11px]"
              )} 
              onClick={() => navigate("/recruiter")}
            >
              Learn More
            </Button>
            <Button 
              className={cn(
                "mwz-button mwz-button-active whitespace-nowrap",
                compact ? "h-8 px-2 text-[10px]" : "h-10 px-2 text-[11px]"
              )} 
              onClick={() => navigate("/recruiter/signup")}
            >
              Sign Up
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
