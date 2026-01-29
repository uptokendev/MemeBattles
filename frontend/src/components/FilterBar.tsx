import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FILTERS, type FilterKey } from "@/constants/filters";

export const FilterBar = () => {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("All");

  return (
    <div className="flex gap-3 mb-6 justify-center">
      {FILTERS.map((filter) => (
        <Button
          key={filter}
          variant={activeFilter === filter ? "default" : "outline"}
          onClick={() => setActiveFilter(filter)}
          className={`font-retro text-xs ${
            activeFilter === filter
              ? "bg-accent/20 text-accent border-accent/50"
              : "border-accent/30 text-accent/70 hover:text-accent hover:border-accent/50"
          }`}
        >
          {filter}
        </Button>
      ))}
    </div>
  );
};
