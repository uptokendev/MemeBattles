/**
 * Sidebar Component
 * Responsive navigation sidebar that becomes a drawer on mobile/tablet
 */

import { X } from "lucide-react";
import AnimatedNav from "./ui/animated-nav";
import { SocialTooltip } from "./ui/social-media";
import { navItems, socialLinks } from "@/constants/navigation";

// Use public brand assets so we can swap without touching the build pipeline.
const brandMark = "/assets/ticker.png";

interface SidebarProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export const Sidebar = ({ mobileMenuOpen, setMobileMenuOpen }: SidebarProps) => {
  return (
    <>
      {/* Mobile/Tablet Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop: Fixed, Mobile/Tablet: Drawer */}
      <aside className={`
        fixed top-4 bottom-4 w-64 bg-[linear-gradient(180deg,rgba(23,26,31,0.94),rgba(11,13,16,0.98))] backdrop-blur-xl border border-sidebar-border/70 rounded-3xl flex flex-col shadow-[0_28px_80px_-36px_rgba(0,0,0,0.98),0_0_0_1px_rgba(240,106,26,0.08)] z-50 transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'left-4' : '-left-72'}
        lg:hidden
      `}>
        {/* Mobile Close Button */}
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="absolute top-4 right-4 lg:hidden p-2 hover:bg-muted rounded-lg transition-colors"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 pl-4 flex items-center gap-3">
          <a href="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3">
            <img src={brandMark} alt="MemeWarzone" className="h-10 w-10" draggable={false} />
            <span className="font-retro text-sm">MemeWarzone</span>
          </a>
        </div>

        <nav className="flex-1 px-4 overflow-y-auto">
          <AnimatedNav options={navItems} onNavigate={() => setMobileMenuOpen(false)} />
        </nav>

        <div className="p-4 md:p-6 border-t border-sidebar-border/50 space-y-4">
          <SocialTooltip items={socialLinks} />
          <p className="text-xs text-muted-foreground mt-4 hidden md:block">© 2026 MemeWarzone. All rights reserved.</p>
        </div>
      </aside>
    </>
  );
};
