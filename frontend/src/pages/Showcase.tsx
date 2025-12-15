/**
 * Showcase Page
 * Main landing page displaying a horizontal scrolling carousel of tokens
 * with navigation buttons to Create and UP Dashboard
 */

import Example from "@/components/ui/horizontal-scroll-carousel";
import { GlowingButton } from "@/components/ui/glowing-button";
import { Plus, Grid3x3 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Showcase = () => {
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex-1">
        <Example />
      </div>
      
      <div className="absolute bottom-8 left-0 right-0 flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-6 z-20 pointer-events-none px-4 md:static md:mt-6 md:pb-6">
        <div className="pointer-events-auto w-full sm:w-auto">
          <GlowingButton 
            glowColor="#ec4899" 
            className="flex items-center justify-center gap-2 md:gap-3 text-sm md:text-lg px-4 md:px-8 py-3 md:py-6 w-full sm:w-auto"
            onClick={() => navigate("/create")}
          >
            <Plus className="h-4 w-4 md:h-5 md:w-5" />
            Create
          </GlowingButton>
        </div>
        <div className="pointer-events-auto w-full sm:w-auto">
          <GlowingButton 
            glowColor="#a3e635" 
            className="flex items-center justify-center gap-2 md:gap-3 text-sm md:text-lg px-4 md:px-8 py-3 md:py-6 w-full sm:w-auto"
            onClick={() => navigate("/up-now")}
          >
            <Grid3x3 className="h-4 w-4 md:h-5 md:w-5" />
            UP Dashboard
          </GlowingButton>
        </div>
      </div>
    </div>
  );
};

export default Showcase;
