import * as React from "react";
import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type InfoTooltipProps = {
  children: React.ReactNode;
  ariaLabel?: string;
  className?: string;
  contentClassName?: string;
  side?: React.ComponentPropsWithoutRef<typeof TooltipContent>["side"];
  align?: React.ComponentPropsWithoutRef<typeof TooltipContent>["align"];
};

const InfoTooltip = ({
  children,
  ariaLabel = "More information",
  className,
  contentClassName,
  side = "top",
  align = "center",
}: InfoTooltipProps) => {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && wrapperRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <span ref={wrapperRef} className="inline-flex">
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full text-accent transition-colors hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              className,
            )}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen((current) => !current);
            }}
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          className={cn("max-w-[260px] whitespace-normal text-left font-retro leading-relaxed", contentClassName)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="space-y-1">{children}</div>
        </TooltipContent>
      </Tooltip>
    </span>
  );
};

export { InfoTooltip };
