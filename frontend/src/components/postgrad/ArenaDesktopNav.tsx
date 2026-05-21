import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Crosshair } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { arenaSubNavItems } from "@/constants/navigation";
import { cn } from "@/lib/utils";

function matchesPath(pathname: string, target: string) {
  return pathname === target || (target !== "/arena" && pathname.startsWith(`${target}/`));
}

export function ArenaDesktopNav() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const activeItem = useMemo(() => {
    return arenaSubNavItems.find((item) => matchesPath(location.pathname, item.path)) ?? arenaSubNavItems[0] ?? null;
  }, [location.pathname]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (containerRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!arenaSubNavItems.length) return null;

  const arenaActive = location.pathname === "/arena" || location.pathname.startsWith("/arena/");

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "mwz-nav-link inline-flex items-center gap-1.5 px-2 md:px-3 !py-1 text-[11px] leading-none whitespace-nowrap 2xl:text-xs",
          arenaActive && "mwz-nav-link-active",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Crosshair className="h-3.5 w-3.5" />
        <span>Arena</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-44 rounded-2xl border border-sidebar-border/70 bg-[linear-gradient(180deg,rgba(23,26,31,0.98),rgba(11,13,16,0.98))] p-2 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.95)]">
          <div className="mb-1 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-success/65">Arena</div>
          <div className="space-y-1">
            {arenaSubNavItems.map((item) => {
              const active = activeItem?.path === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "block rounded-xl px-3 py-2 text-xs uppercase tracking-[0.14em] text-success/78 transition-colors hover:bg-success/10 hover:text-success",
                    active && "bg-success/12 text-success",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
