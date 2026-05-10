import { Link } from "react-router-dom";
import { ArrowRight, Copy, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { ProfileRecruiterPanel } from "@/components/profile/ProfileRecruiterPanel";

const benefits = [
  "Recruiter code and link",
  "Public recruiter profile",
  "Linked creator/trader tracking",
  "Weekly claim flow",
  "Squad growth tools",
  "Leaderboard visibility",
];

export default function CommandCenterRecruiter() {
  const { walletAddress } = useCommandCenterData();
  const recruiterLink = typeof window !== "undefined"
    ? `${window.location.origin}/r/${walletAddress.slice(2, 8).toLowerCase()}`
    : `/r/${walletAddress.slice(2, 8).toLowerCase()}`;

  const copyRecruiterLink = async () => {
    try {
      await navigator.clipboard.writeText(recruiterLink);
      toast.success("Recruiter link copied");
    } catch {
      toast.error("Could not copy recruiter link");
    }
  };

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Recruiter"
        description="Recruiter onboarding, dashboard state, attribution, and claim visibility now live inside Command Center."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="font-retro">
            <Link to="/recruiters">
              Public leaderboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild className="font-retro">
            <Link to="/recruiter/signup">Apply</Link>
          </Button>
        </div>
      </CommandCenterPageHeader>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <CommandCenterCard
          title="Become a MemeWarzone Recruiter"
          description="Recruiters help grow the arena by bringing in creators, traders, and squads. When linked users trade or graduate campaigns, recruiters earn weekly rewards."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <div key={benefit} className="rounded-2xl border border-border/50 bg-background/25 p-3 text-sm text-muted-foreground">
                {benefit}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-accent" />
              <div>
                <div className="font-retro text-sm text-foreground">Program rule</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Recruiter routing, claim accounting, and attribution locks stay backend controlled. This page only displays safe dashboard state.
                </p>
              </div>
            </div>
          </div>
        </CommandCenterCard>

        <CommandCenterCard
          title="Recruiter quick actions"
          description="Use these until the full in-page application modal is added."
        >
          <div className="space-y-3">
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="font-retro text-sm text-foreground">Preview referral link</div>
              <div className="mt-2 break-all font-mono text-xs text-muted-foreground">{recruiterLink}</div>
              <Button onClick={copyRecruiterLink} variant="outline" className="mt-3 font-retro">
                <Copy className="mr-2 h-4 w-4" />
                Copy preview link
              </Button>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="flex items-start gap-3">
                <Users className="mt-1 h-4 w-4 shrink-0 text-accent" />
                <div>
                  <div className="font-retro text-sm text-foreground">Dashboard status</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If this wallet is already a recruiter, the full dashboard below will load live recruiter stats. If not, the onboarding state stays visible.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CommandCenterCard>
      </div>

      <ProfileRecruiterPanel account={walletAddress} isConnected={true} isOwnProfile={true} />
    </div>
  );
}
