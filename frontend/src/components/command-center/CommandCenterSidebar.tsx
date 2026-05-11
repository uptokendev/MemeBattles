import { NavLink } from "react-router-dom";
import { Gift, Home, Settings, Shield, Trophy, Users } from "lucide-react";

import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";

const menuItems = [
  { label: "Overview", path: "", icon: Home, end: true },
  { label: "Recruiter", path: "recruiter", icon: Shield },
  { label: "Squad", path: "squad", icon: Users, requiresSquad: true },
  { label: "Warzone Airdrops", path: "airdrops", icon: Gift },
  { label: "Rewards / Claims", path: "claims", icon: Trophy },
  { label: "Settings", path: "settings", icon: Settings },
];

type CommandCenterSidebarProps = {
  basePath: string;
};

function shouldShowSquad(squadState?: string | null) {
  if (!squadState) return true;
  const normalized = String(squadState).toLowerCase();
  return !(normalized.includes("solo") || normalized.includes("detached"));
}

export function CommandCenterSidebar({ basePath }: CommandCenterSidebarProps) {
  const { attribution, loadingAttribution } = useCommandCenterData();
  const showSquad = loadingAttribution || shouldShowSquad(attribution?.squadState);
  const visibleMenuItems = menuItems.filter((item) => !item.requiresSquad || showSquad);

  return (
    <aside className="rounded-3xl border border-border/50 bg-card/35 p-3 shadow-2xl backdrop-blur-md lg:sticky lg:top-4 lg:h-fit">
      <div className="mb-3 hidden px-3 pt-2 font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground lg:block">
        Command Menu
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const to = item.path ? `${basePath}/${item.path}` : basePath;
          return (
            <NavLink
              key={item.label}
              to={to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-w-fit items-center gap-2 rounded-2xl border px-3 py-3 font-retro text-xs transition lg:min-w-0 ${
                  isActive
                    ? "border-accent/60 bg-accent/15 text-accent"
                    : "border-transparent bg-background/20 text-muted-foreground hover:border-border/60 hover:bg-card/45 hover:text-foreground"
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
