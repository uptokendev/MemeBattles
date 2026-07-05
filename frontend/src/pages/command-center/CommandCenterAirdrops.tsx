import { Link } from "react-router-dom";
import { ArrowRight, Gift, Info, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { ProfileAirdropsPanel } from "@/components/profile/ProfileAirdropsPanel";

const rules = [
  "Solo users can qualify",
  "Trader and creator buckets are separate",
  "Reason codes explain ineligibility",
  "Claims stay user-initiated",
  "Eligibility checks run automatically",
  "Published winners remain public",
];

export default function CommandCenterAirdrops() {
  const { walletAddress } = useCommandCenterData();

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Warzone Airdrops"
        
      >
        <Button asChild variant="outline" className="font-retro">
          <Link to="/airdrops/winners">
            Public winners
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CommandCenterPageHeader>
      <ProfileAirdropsPanel account={walletAddress} isConnected={true} isOwnProfile={true} />
    </div>
  );
}
