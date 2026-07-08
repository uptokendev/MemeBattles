import { useState } from "react";
import { NavLink } from "react-router-dom";
import { FileText, Home, Menu, Settings, Shield, Users, X } from "lucide-react";

const menuItems = [
  { label: "Overview", path: "", icon: Home, end: true },
  { label: "Drafts", path: "coins", icon: FileText },
  { label: "Recruiter", path: "recruiter", icon: Shield },
  { label: "Squad", path: "squad", icon: Users },
  { label: "Settings", path: "settings", icon: Settings },
];

type CommandCenterSidebarProps = {
  basePath: string;
};

export function CommandCenterSidebar({ basePath }: CommandCenterSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <aside className="rounded-3xl border border-border/50 bg-card/35 p-3 shadow-2xl backdrop-blur-md lg:sticky lg:top-4 lg:h-fit">
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/25 px-3 py-3 font-retro text-xs uppercase tracking-[0.16em] text-foreground transition hover:border-accent/50 hover:bg-card/45 lg:hidden"
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

      <nav className={`${mobileOpen ? "flex" : "hidden"} mt-3 flex-col gap-2 lg:mt-0 lg:flex`}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const to = item.path ? `${basePath}/${item.path}` : basePath;
          return (
            <NavLink
              key={item.label}
              to={to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-3 font-retro text-xs transition ${
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
