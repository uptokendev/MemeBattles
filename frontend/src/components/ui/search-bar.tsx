"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, CircleDot, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { TokenSearchResult } from "@/types/search";

const GooeyFilter = () => (
  <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
    <defs>
      <filter id="gooey-effect">
        <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -8"
          result="goo"
        />
        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
      </filter>
    </defs>
  </svg>
);

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onValueChange: (query: string) => void;
  results: TokenSearchResult[];
  loading?: boolean;
  error?: string | null;
  onSelectResult: (r: TokenSearchResult) => void;
}

const SearchBar = ({
  placeholder = "Search...",
  value,
  onValueChange,
  results,
  loading,
  error,
  onSelectResult,
}: SearchBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const [isFocused, setIsFocused] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsMobile(Boolean(mq.matches));
    apply();
    try {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } catch {
      // Safari fallback
      mq.addListener(apply);
      return () => mq.removeListener(apply);
    }
  }, []);

  const isUnsupportedBrowser = useMemo(() => {
    if (typeof window === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    const isSafari = ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium");
    const isChromeOniOS = ua.includes("crios");
    return isSafari || isChromeOniOS;
  }, []);

  const showDropdown = isFocused && (results.length > 0 || Boolean(error));

  useEffect(() => {
    if (isFocused && inputRef.current) inputRef.current.focus();
  }, [isFocused]);

  useEffect(() => {
    // Reset active selection when results change.
    setActiveIndex(results.length ? 0 : -1);
    itemRefs.current = itemRefs.current.slice(0, results.length);
  }, [results.length, value]);

  useEffect(() => {
    if (activeIndex < 0) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!results.length) return;
    const idx = activeIndex >= 0 ? activeIndex : 0;
    const r = results[idx];
    if (!r) return;

    setIsAnimating(true);
    window.setTimeout(() => setIsAnimating(false), 700);
    onSelectResult(r);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isFocused) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setIsClicked(true);
    window.setTimeout(() => setIsClicked(false), 800);
  };

  const searchIconVariants = {
    initial: { scale: 1 },
    animate: {
      rotate: isAnimating ? [0, -15, 15, -10, 10, 0] : 0,
      scale: isAnimating ? [1, 1.2, 1] : 1,
      transition: { duration: 0.6, ease: "easeInOut" as const },
    },
  };

  const particles = Array.from({ length: isFocused ? 18 : 0 }, (_, i) => (
    <motion.div
      key={i}
      initial={{ scale: 0 }}
      animate={{
        x: [0, (Math.random() - 0.5) * 40],
        y: [0, (Math.random() - 0.5) * 40],
        scale: [0, Math.random() * 0.8 + 0.4],
        opacity: [0, 0.8, 0],
      }}
      transition={{
        duration: Math.random() * 1.5 + 1.5,
        ease: "easeInOut",
        repeat: Infinity,
        repeatType: "reverse",
      }}
      className="absolute w-3 h-3 rounded-full bg-accent/80"
      style={{
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        filter: "blur(2px)",
      }}
    />
  ));

  const clickParticles = isClicked
    ? Array.from({ length: 14 }, (_, i) => (
        <motion.div
          key={`click-${i}`}
          initial={{ x: mousePosition.x, y: mousePosition.y, scale: 0, opacity: 1 }}
          animate={{
            x: mousePosition.x + (Math.random() - 0.5) * 160,
            y: mousePosition.y + (Math.random() - 0.5) * 160,
            scale: Math.random() * 0.8 + 0.2,
            opacity: [1, 0],
          }}
          transition={{ duration: Math.random() * 0.8 + 0.5, ease: "easeOut" }}
          className="absolute w-3 h-3 rounded-full"
          style={{
            background: `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(
              Math.random() * 200
            ) + 55}, ${Math.floor(Math.random() * 255)}, 0.8)`,
            boxShadow: "0 0 8px rgba(255, 255, 255, 0.8)",
          }}
        />
      ))
    : null;

  return (
    <div className="relative w-full">
      <GooeyFilter />
      <motion.form
        onSubmit={handleSubmit}
        className="relative flex items-center justify-center w-full mx-auto"
        initial={{ width: isMobile ? "170px" : "240px" }}
        animate={{
          width: isFocused
            ? isMobile
              ? "220px"
              : "340px"
            : isMobile
            ? "170px"
            : "240px",
          scale: isFocused ? 1.05 : 1,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        onMouseMove={handleMouseMove}
      >
        <motion.div
          className={cn(
            "flex items-center w-full rounded-full border relative overflow-hidden backdrop-blur-md",
            isFocused ? "border-accent/50 shadow-glow-accent" : "border-border bg-card/30"
          )}
          animate={{
            boxShadow: isClicked
              ? "0 0 40px hsl(var(--accent) / 0.5), 0 0 15px hsl(var(--primary) / 0.7) inset"
              : isFocused
              ? "0 0 30px hsl(var(--accent) / 0.4)"
              : "0 0 0 rgba(0, 0, 0, 0)",
          }}
          onClick={handleClick}
        >
          {isFocused && (
            <motion.div
              className="absolute inset-0 -z-10"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 0.15,
                background: [
                  "linear-gradient(90deg, #f6d365 0%, #fda085 100%)",
                  "linear-gradient(90deg, #a1c4fd 0%, #c2e9fb 100%)",
                  "linear-gradient(90deg, #d4fc79 0%, #96e6a1 100%)",
                  "linear-gradient(90deg, #f6d365 0%, #fda085 100%)",
                ],
              }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            />
          )}

          <div
            className="absolute inset-0 overflow-hidden rounded-full -z-5"
            style={{ filter: isUnsupportedBrowser ? "none" : "url(#gooey-effect)" }}
          >
            {particles}
          </div>

          {isClicked && (
            <>
              <motion.div
                className="absolute inset-0 -z-5 rounded-full bg-accent/10"
                initial={{ scale: 0, opacity: 0.7 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
              <motion.div
                className="absolute inset-0 -z-5 rounded-full bg-white dark:bg-white/20"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </>
          )}

          {clickParticles}

          <motion.div className="pl-4 py-3" variants={searchIconVariants} initial="initial" animate="animate">
            <Search
              size={20}
              strokeWidth={isFocused ? 2.5 : 2}
              className={cn(
                "transition-all duration-300",
                isAnimating ? "text-accent" : isFocused ? "text-accent" : "text-muted-foreground"
              )}
            />
          </motion.div>

          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => window.setTimeout(() => setIsFocused(false), 200)}
            onKeyDown={(e) => {
              if (!showDropdown) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(results.length - 1, (i < 0 ? 0 : i + 1)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, (i < 0 ? 0 : i - 1)));
              } else if (e.key === "Escape") {
                setIsFocused(false);
              }
            }}
            className={cn(
              "w-full py-3 bg-transparent outline-none placeholder:text-muted-foreground font-medium text-base relative z-10",
              isFocused ? "text-foreground tracking-wide" : "text-foreground/80"
            )}
          />

          <AnimatePresence>
            {value.trim() && (
              <motion.button
                type="submit"
                initial={{ opacity: 0, scale: 0.8, x: -20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: -20 }}
                whileHover={{
                  scale: 1.05,
                  boxShadow: "0 10px 25px -5px hsl(var(--accent) / 0.5)",
                }}
                whileTap={{ scale: 0.95 }}
                className="px-4 py-2 mr-2 text-sm font-medium rounded-full bg-accent text-accent-foreground backdrop-blur-sm transition-all shadow-lg hover:shadow-glow-accent"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.form>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute z-10 w-full mt-2 overflow-hidden bg-card/90 backdrop-blur-md rounded-lg shadow-xl border border-border"
            style={{ maxHeight: "300px", overflowY: "auto" }}
          >
            <div className="p-2">
              {error ? (
                <div className="px-4 py-2 text-xs text-destructive">{error}</div>
              ) : results.length === 0 ? (
                <div className="px-4 py-2 text-xs text-muted-foreground">No results.</div>
              ) : (
                results.map((r, index) => (
                  <div
                    key={`${r.campaignAddress}-${r.symbol}`}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSelectResult(r)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 cursor-pointer rounded-md hover:bg-accent/10 group",
                      activeIndex === index && "bg-accent/10"
                    )}
                  >
                    <CircleDot size={16} className="text-accent/70 group-hover:text-accent" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-foreground group-hover:text-accent truncate">
                          {r.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {r.symbol}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {r.campaignAddress}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export { SearchBar };
