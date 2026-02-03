/**
 * Loading Screen Component
 * Displays an animated loading screen with space background and logo
 * Automatically transitions out after the specified minimum load time
 */

import { useEffect, useState } from "react";
import { SpaceBackground } from "@/components/ui/space-background";

// NOTE:
// Use the public logo so there's exactly one source of truth with the header logo.
// The query string helps bust aggressive caching.
const LOADING_LOGO_SRC = "/assets/logo.png?v=mb1";

interface LoadingScreenProps {
  onLoadComplete?: () => void;
  minLoadTime?: number;
}

export const LoadingScreen = ({ onLoadComplete, minLoadTime = 2000 }: LoadingScreenProps) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, minLoadTime - 800); // Start exit animation 800ms before complete

    const completeTimer = setTimeout(() => {
      setIsVisible(false);
      if (onLoadComplete) {
        onLoadComplete();
      }
    }, minLoadTime);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [minLoadTime, onLoadComplete]);

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background transition-all duration-700 ${
        isExiting ? "opacity-0 scale-110" : "opacity-100 scale-100"
      }`}
    >
      <SpaceBackground 
        particleCount={450} 
        particleColor="rgba(175, 254, 0, 0.8)"
        backgroundColor="hsl(var(--background))"
      />
      
      <div 
        className={`relative z-10 text-center transition-all duration-700 ${
          isExiting ? "opacity-0 scale-150 blur-xl" : "opacity-100 scale-100 blur-0 animate-fade-in"
        }`}
      >
        <div className="animate-pulse">
          <img 
            src={LOADING_LOGO_SRC} 
            alt="Launchpad Logo" 
            className="h-48 w-48 mx-auto object-contain drop-shadow-[0_0_40px_rgba(175,254,0,0.6)]"
          />
        </div>
      </div>
    </div>
  );
};
