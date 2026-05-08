import { useState } from "react";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { LeagueOverlayCard } from "./LeagueOverlayCard";
import { RecruiterPromoCard } from "./RecruiterPromoCard";

type LeagueRecruiterSliderProps = {
  className?: string;
};

const slideLabels = ["Battle Leagues", "Recruiters"];

export function LeagueRecruiterSlider({ className }: LeagueRecruiterSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className={cn("space-y-3", className)}>
      <Carousel
        opts={{ align: "start", loop: false }}
        setApi={(api) => {
          if (!api) return;
          const sync = () => setActiveIndex(api.selectedScrollSnap());
          sync();
          api.on("select", sync);
          api.on("reInit", sync);
        }}
      >
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
          <div
            key={label}
            className={cn(
              "h-1.5 rounded-full transition-all",
              activeIndex === index ? "w-8 bg-accent" : "w-3 bg-border/70",
            )}
            aria-label={label}
          />
        ))}
      </div>
    </div>
  );
}
