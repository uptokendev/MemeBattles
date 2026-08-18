/**
 * Loading Screen Component
 * Displays an animated loading screen with space background and logo
 * Automatically transitions out after the specified minimum load time
 */

import { useEffect, useState } from "react";
import { SpaceBackground } from "@/components/ui/space-background";

// NOTE:
// Use the public hero logo (everywhere except the navbar, which uses its own
// strip mark at /assets/navbar-logo.png). The query string helps bust aggressive
// caching.
const LOADING_LOGO_SRC = "/assets/logo.png?v=mw2";

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
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#010600] transition-all duration-700 ${
        isExiting ? "opacity-0 scale-110" : "opacity-100 scale-100"
      }`}
      style={{ backgroundColor: "#010600" }}
    >
      <SpaceBackground
        particleCount={450}
        particleColor="rgba(240, 106, 26, 0.72)"
        backgroundColor="#010600"
      />

      <div
        className={`relative z-10 text-center transition-all duration-700 ${
          isExiting ? "opacity-0 scale-150 blur-xl" : "opacity-100 scale-100 blur-0 animate-fade-in"
        }`}
      >
        <div className="animate-pulse">
          <img
            src={LOADING_LOGO_SRC}
            alt="MemeWarzone Logo"
            className="mx-auto h-48 w-48 object-contain drop-shadow-[0_0_40px_rgba(240,106,26,0.30)]"
          />
        </div>
        <p className="mt-6 text-sm uppercase tracking-[0.28em] text-[#39ff4f]/80">
          Booting MemeWarzone
        </p>
      </div>
    </div>
  );
};
