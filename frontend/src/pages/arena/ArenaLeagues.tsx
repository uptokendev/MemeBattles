import League from "@/pages/League";
import { ArenaSubnav } from "@/components/arena/ArenaSubnav";

export default function ArenaLeagues() {
  return (
    <div className="min-h-full">
      <ArenaSubnav />
      <League />
    </div>
  );
}
