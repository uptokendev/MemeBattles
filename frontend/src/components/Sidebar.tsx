/**
 * Sidebar Component
 * Responsive navigation sidebar that becomes a drawer on mobile/tablet
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Swords, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { SocialTooltip } from "./ui/social-media";
import { arenaNavItems, navItems, socialLinks } from "@/constants/navigation";
import { cn } from "@/lib/utils";

const brandMark = "/assets/ticker.png";

interface SidebarProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

function isArenaPath(pathname: string) {
  return pathname === "/arena" || pathname.startsWith("/arena/");
}

export const Sidebar = ({ mobileMenuOpen, setMobileMenuOpen }: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [arenaOpen, setArenaOpen] = useState(isArenaPath(location.pathname));

  const handleNavigate = (path: string) => {
    if (/^https?:\/\//i.test(path)) {
      window.open(path, "_blank", "noopener,noreferrer");
    } else {
      navigate(path);
    }
    setMobileMenuOpen(false);
  };

  const nonArenaItems = navItems.filter((item) => item.label !== "Arena");

  return (
    <>
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed top-4 bottom-4 w-64 bg-[linear-gradient(180deg,rgba(23,26,31,0.94),rgba(11,13,16,0.98))] backdrop-blur-xl border border-sidebar-border/70 rounded-3xl flex flex-col shadow-[0_28px_80px_-36px_rgba(0,0,0,0.98),0_0_0_1px_rgba(255,153,0,0.08)] z-50 transition-transform duration-300 ease-in-out lg:hidden",
          mobileMenuOpen ? "left-4" : "-left-72",
        )}
      >
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="absolute top-4 right-4 lg:hidden p-2 hover:bg-muted rounded-lg transition-colors"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 pl-4 flex items-center gap-3">
          <Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3">
            <img src={brandMark} alt="MemeWarzone" className="h-10 w-10" draggable={false} />
            <span className="font-retro text-sm">MemeWarzone</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 overflow-y-auto space-y-1">
          {nonArenaItems.slice(0, 1).map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => handleNavigate(item.path)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base transition-colors",
                location.pathname === item.path ? "bg-card/70 text-accent" : "text-sidebar-foreground hover:bg-card/50 hover:text-accent",
              )}
            >
              {typeof item.icon === "string" ? (
                <img src={item.icon} alt={item.label} className="h-5 w-5 opacity-80" />
              ) : (
                <item.icon className="h-5 w-5" />
              )}
              <span>{item.label}</span>
            </button>
          ))}

          <div className="rounded-2xl border border-border/40 bg-card/20">
            <button
              type="button"
              onClick={() => setArenaOpen((current) => !current)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-base transition-colors",
                isArenaPath(location.pathname) ? "text-accent" : "text-sidebar-foreground hover:text-accent",
              )}
            >
              <div className="flex items-center gap-3">
                <Swords className="h-5 w-5" />
                <span>Arena</span>
              </div>
              {arenaOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {arenaOpen ? (
              <div className="px-2 pb-2">
                {arenaNavItems.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => handleNavigate(item.path)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                      location.pathname === item.path ? "bg-card/70 text-accent" : "text-muted-foreground hover:bg-card/50 hover:text-foreground",
                    )}
                  >
                    {typeof item.icon === "string" ? (
                      <img src={item.icon} alt={item.label} className="h-4 w-4 opacity-80" />
                    ) : (
                      <item.icon className="h-4 w-4" />
                    )}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {nonArenaItems.slice(1).map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => handleNavigate(item.path)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base transition-colors",
                location.pathname === item.path ? "bg-card/70 text-accent" : "text-sidebar-foreground hover:bg-card/50 hover:text-accent",
              )}
            >
              {typeof item.icon === "string" ? (
                <img src={item.icon} alt={item.label} className="h-5 w-5 opacity-80" />
              ) : (
                <item.icon className="h-5 w-5" />
              )}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 md:p-6 border-t border-sidebar-border/50 space-y-4">
          <SocialTooltip items={socialLinks} />
          <p className="text-xs text-muted-foreground mt-4 hidden md:block">© 2026 MemeWarzone. All rights reserved.</p>
        </div>
      </aside>
    </>
  );
};
