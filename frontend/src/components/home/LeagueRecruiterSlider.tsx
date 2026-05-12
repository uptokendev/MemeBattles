import { useEffect, useRef, useState } from "react";
import type { CarouselApi } from "@/components/ui/carousel";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { LeagueOverlayCard } from "./LeagueOverlayCard";
import { RecruiterPromoCard } from "./RecruiterPromoCard";

type LeagueRecruiterSliderProps = {
  className?: string;
};

const slideLabels = ["Battle Leagues", "Recruiters"];
const AUTOPLAY_INTERVAL_MS = 6000;

export function LeagueRecruiterSlider({ className }: LeagueRecruiterSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [api, setApi] = useState<CarouselApi | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!api) return;
    const sync = () => setActiveIndex(api.selectedScrollSnap());
    sync();
    api.on("select", sync);
    api.on("reInit", sync);
    return () => {
      api.off("select", sync);
      api.off("reInit", sync);
    };
  }, [api]);

  useEffect(() => {
    if (!api) return;
    const tick = () => {
      if (pausedRef.current) return;
      if (document.hidden) return;
      api.scrollNext();
    };
    const id = window.setInterval(tick, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [api]);

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const onEnter = () => { pausedRef.current = true; };
    const onLeave = () => { pausedRef.current = false; };
    node.addEventListener("pointerenter", onEnter);
    node.addEventListener("pointerleave", onLeave);
    node.addEventListener("focusin", onEnter);
    node.addEventListener("focusout", onLeave);
    return () => {
      node.removeEventListener("pointerenter", onEnter);
      node.removeEventListener("pointerleave", onLeave);
      node.removeEventListener("focusin", onEnter);
      node.removeEventListener("focusout", onLeave);
    };
  }, []);

  const goTo = (index: number) => {
    if (!api) return;
    api.scrollTo(index);
  };

  return (
    <div ref={wrapperRef} className={cn("space-y-3", className)}>
      <Carousel opts={{ align: "start", loop: true }} setApi={setApi}>
        <CarouselContent>
          <CarouselItem>
            <LeagueOverlayCard className="w-full" />
          </CarouselItem>
          <CarouselItem>
            <RecruiterPromoCard className="w-full" />
          </CarouselItem>
        </CarouselContent>
      </Carousel>

      <div className="flex items-center justify-center gap-2">
        {slideLabels.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => goTo(index)}
            aria-label={`Go to ${label}`}
            aria-current={activeIndex === index}
            className={cn(
              "h-1.5 cursor-pointer rounded-full transition-all",
              activeIndex === index ? "w-8 bg-accent" : "w-3 bg-border/70 hover:bg-accent/50",
            )}
          />
        ))}
      </div>
    </div>
  );
}
