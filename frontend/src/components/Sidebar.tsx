/**
 * Sidebar Component
 * Responsive navigation sidebar that becomes a drawer on mobile/tablet
 */

import { X } from "lucide-react";
import { Link } from "react-router-dom";
import AnimatedNav from "./ui/animated-nav";
import { SocialTooltip } from "./ui/social-media";
import { navItems, socialLinks } from "@/constants/navigation";
import { isPostGradNavEnabled } from "@/features/postgrad/config";
import { ArenaMobileNav } from "@/components/postgrad/ArenaMobileNav";

// Use public brand assets so we can swap without touching the build pipeline.
const brandMark = "/assets/ticker.png";
const primaryPaths = new Set(["/", "/war-room", "/create"]);

interface SidebarProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export const Sidebar = ({ mobileMenuOpen, setMobileMenuOpen }: SidebarProps) => {
  const primaryNavItems = navItems.filter((item) => primaryPaths.has(item.path));
  const utilityNavItems = navItems.filter((item) => !primaryPaths.has(item.path));

  return (
    <>
      {/* Mobile/Tablet Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-md lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop: Fixed, Mobile/Tablet: Drawer */}
      <aside
        className={`
        fixed top-4 bottom-4 z-50 flex w-[calc(100vw-2rem)] max-w-72 flex-col rounded-3xl border border-sidebar-border/70 bg-[linear-gradient(180deg,rgba(23,26,31,0.94),rgba(11,13,16,0.98))] shadow-[0_28px_80px_-36px_rgba(0,0,0,0.98),0_0_0_1px_rgba(255,153,0,0.08)] backdrop-blur-xl transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? "left-4" : "-left-80"}
        lg:hidden
      `}
      >
        {/* Mobile Close Button */}
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="absolute right-4 top-4 rounded-lg p-2 transition-colors hover:bg-muted lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 px-4 pb-4 pt-5">
          <Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3">
            <img src={brandMark} alt="MemeWarzone" className="h-10 w-10" draggable={false} />
            <div className="space-y-1">
              <span className="block font-retro text-sm text-foreground">MemeWarzone</span>
              <span className="block text-[10px] uppercase tracking-[0.18em] text-success/60">Launch Control</span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          <div className="space-y-2">
            {isPostGradNavEnabled() ? <ArenaMobileNav onNavigate={() => setMobileMenuOpen(false)} /> : null}
            {primaryNavItems.length ? <AnimatedNav options={primaryNavItems} onNavigate={() => setMobileMenuOpen(false)} /> : null}
          </div>

          {utilityNavItems.length ? (
            <div className="space-y-2">
              <div className="px-3 text-[10px] uppercase tracking-[0.22em] text-success/55">Account</div>
              <AnimatedNav options={utilityNavItems} onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          ) : null}
        </nav>

        <div className="space-y-3 border-t border-sidebar-border/50 px-4 py-4">
          <SocialTooltip items={socialLinks} className="justify-start gap-2 [&_a]:!h-9 [&_a]:!w-9" />
          <p className="hidden text-[11px] text-muted-foreground md:block">© 2026 MemeWarzone. All rights reserved.</p>
        </div>
      </aside>
    </>
  );
};
