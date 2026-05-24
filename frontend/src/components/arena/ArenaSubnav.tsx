import { Link, useLocation } from "react-router-dom";
import { Swords, Trophy, CalendarDays, LayoutPanelTop } from "lucide-react";
import { cn } from "@/lib/utils";

const arenaLinks = [
  { label: "Overview", path: "/arena", icon: LayoutPanelTop },
  { label: "Battles", path: "/arena/battles", icon: Swords },
  { label: "Leagues", path: "/arena/leagues", icon: Trophy },
  { label: "Events", path: "/arena/events", icon: CalendarDays },
];

function isActive(pathname: string, target: string) {
  return pathname === target;
}

export function ArenaSubnav() {
  const location = useLocation();

  return (
    <div className="mb-5 overflow-x-auto">
      <div className="inline-flex min-w-full items-center gap-2 rounded-2xl border border-border/60 bg-card/45 p-1.5 backdrop-blur-sm md:min-w-0">
        {arenaLinks.map((item) => {
          const Icon = item.icon;
          const active = isActive(location.pathname, item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs transition-colors md:text-sm",
                active
                  ? "bg-accent text-accent-foreground shadow-[0_18px_40px_-28px_rgba(240,106,26,0.72)]"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
