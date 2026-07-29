import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

const PARTICLES = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  angle: (Math.PI * 2 * index) / 28,
  distance: 140 + (index % 7) * 24,
  size: 5 + (index % 5) * 3,
  delay: (index % 6) * 0.025,
}));

export function GraduationExplosion({
  campaignAddress,
  active,
  transitionAt,
}: {
  campaignAddress?: string;
  active: boolean;
  transitionAt?: number | null;
}) {
  const storageKey = useMemo(
    () => `mwz:graduation-explosion:${String(campaignAddress || "").toLowerCase()}`,
    [campaignAddress],
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active || !campaignAddress) return;
    let alreadyShown = false;
    try {
      alreadyShown = window.sessionStorage.getItem(storageKey) === "1";
    } catch {
      alreadyShown = false;
    }
    if (alreadyShown && !transitionAt) return;

    setVisible(true);
    try {
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // The animation is non-critical when storage is unavailable.
    }
    const timeout = window.setTimeout(() => setVisible(false), 2_800);
    return () => window.clearTimeout(timeout);
  }, [active, campaignAddress, storageKey, transitionAt]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-black/20 backdrop-blur-[1px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          aria-hidden="true"
        >
          <motion.div
            className="absolute h-24 w-24 rounded-full bg-amber-300/80 blur-xl"
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{ scale: [0.2, 4.5, 7], opacity: [0, 1, 0] }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
          <motion.div
            className="absolute h-56 w-56 rounded-full border-8 border-orange-400/80"
            initial={{ scale: 0.1, opacity: 1 }}
            animate={{ scale: 5, opacity: 0 }}
            transition={{ duration: 1.3, ease: "easeOut" }}
          />
          <motion.div
            className="absolute h-36 w-36 rounded-full border-4 border-yellow-200/70"
            initial={{ scale: 0.1, opacity: 1 }}
            animate={{ scale: 7, opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeOut", delay: 0.08 }}
          />

          {PARTICLES.map((particle) => (
            <motion.span
              key={particle.id}
              className="absolute rounded-full bg-gradient-to-br from-yellow-100 via-orange-400 to-red-600 shadow-[0_0_20px_rgba(251,146,60,0.9)]"
              style={{ width: particle.size, height: particle.size }}
              initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
              animate={{
                x: Math.cos(particle.angle) * particle.distance,
                y: Math.sin(particle.angle) * particle.distance,
                scale: [0, 1.8, 0.4],
                opacity: [0, 1, 0],
                rotate: 360 + particle.id * 18,
              }}
              transition={{ duration: 1.5, delay: particle.delay, ease: "easeOut" }}
            />
          ))}

          <motion.div
            className="relative rounded-2xl border border-amber-300/70 bg-black/80 px-6 py-5 text-center shadow-[0_0_80px_rgba(249,115,22,0.75)] md:px-10 md:py-7"
            initial={{ scale: 0.45, opacity: 0, rotateX: 35 }}
            animate={{ scale: [0.45, 1.12, 1], opacity: 1, rotateX: 0 }}
            exit={{ scale: 1.2, opacity: 0 }}
            transition={{ duration: 0.65, ease: "backOut", delay: 0.2 }}
          >
            <motion.p
              className="text-xs font-black uppercase tracking-[0.38em] text-amber-300 md:text-sm"
              initial={{ letterSpacing: "0.1em", opacity: 0 }}
              animate={{ letterSpacing: "0.38em", opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.5 }}
            >
              Graduation confirmed
            </motion.p>
            <p className="mt-2 font-retro text-2xl text-white drop-shadow-[0_0_18px_rgba(251,191,36,0.8)] md:text-4xl">
              THE REAL BATTLE STARTS NOW
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-200 md:text-sm">
              Trading continues on Topaz inside MemeWarzone
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
