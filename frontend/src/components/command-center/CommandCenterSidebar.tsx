import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { Coins, Gift, Home, Menu, Settings, Shield, Trophy, Users, X } from "lucide-react";

import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";

const menuItems = [
  { label: "Overview", path: "", icon: Home, end: true },
  { label: "Coins", path: "coins", icon: Coins },
  { label: "Recruiter", path: "recruiter", icon: Shield },
  { label: "Squad", path: "squad", icon: Users, requiresSquad: true },
  { label: "Warzone Airdrops", path: "airdrops", icon: Gift },
  { label: "Rewards / Claims", path: "claims", icon: Trophy },
  { label: "Settings", path: "settings", icon: Settings },
];

const NO_SQUAD_STATES = new Set(["", "none", "solo", "not_in_squad", "inactive", "unlinked", "missing"]);

function hasSquadAccess(squadState?: string | null) {
  return !NO_SQUAD_STATES.has(String(squadState || "").trim().toLowerCase());
}

type CommandCenterSidebarProps = {
  basePath: string;
};

export function CommandCenterSidebar({ basePath }: CommandCenterSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { attribution } = useCommandCenterData();

  const visibleMenuItems = useMemo(
    () => menuItems.filter((item) => !item.requiresSquad || hasSquadAccess(attribution?.squadState)),
    [attribution?.squadState],
  );

  return (
    <aside className="mwz-command-sidebar p-3 lg:sticky lg:top-4 lg:h-fit">
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        className="mwz-command-menu-toggle flex w-full items-center justify-between gap-3 px-3 py-3 font-retro text-xs uppercase tracking-[0.16em] text-foreground transition lg:hidden"
        aria-expanded={mobileOpen}
      >
        <span className="inline-flex items-center gap-2">
          <Menu className="h-4 w-4 text-accent" />
          Command Menu
        </span>
        {mobileOpen ? <X className="h-4 w-4" /> : null}
      </button>

      <div className="mb-3 hidden px-3 pt-2 font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground lg:block">
        Command Menu
      </div>

      <nav className={`${mobileOpen ? "flex" : "hidden"} mt-3 flex-col gap-1 lg:mt-0 lg:flex`}>
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const to = item.path ? `${basePath}/${item.path}` : basePath;
          return (
            <NavLink
              key={item.label}
              to={to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `mwz-command-nav-item flex min-w-0 items-center gap-2 border px-3 py-3 font-retro text-xs transition ${
                  isActive
                    ? "mwz-command-nav-item-active border-accent/70 bg-accent/10 text-accent"
                    : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-white/[0.025] hover:text-foreground"
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
