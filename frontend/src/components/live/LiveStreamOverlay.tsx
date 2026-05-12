import { Link, useLocation } from "react-router-dom";
import { Play } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const PLAYBACK_ID = String(import.meta.env.VITE_MUX_PLAYBACK_ID || "").trim();

async function checkLive(playbackId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://stream.mux.com/${playbackId}.m3u8`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

export function LiveStreamOverlay() {
  const location = useLocation();
  // Reuse the LivestreamPlayer query key so react-query dedupes the probe.
  const { data: isLive = false } = useQuery({
    queryKey: ["mux-live-status", PLAYBACK_ID],
    queryFn: () => checkLive(PLAYBACK_ID),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    enabled: Boolean(PLAYBACK_ID),
  });

  if (location.pathname === "/live") return null;
  if (!isLive) return null;

  return (
    <Link
      to="/live"
      aria-label="Watch the MemeWarzone launch livestream"
      className="group fixed bottom-4 right-4 z-[60] flex items-center gap-3 border border-red-500/70 bg-black/85 px-4 py-2.5 font-retro shadow-[0_0_24px_rgba(239,68,68,0.35)] backdrop-blur-sm transition-all hover:scale-[1.03] hover:border-red-400 hover:shadow-[0_0_32px_rgba(239,68,68,0.55)] md:bottom-6 md:right-6 md:px-5 md:py-3"
    >
      <span className="relative flex h-3 w-3 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-80" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]" />
      </span>

      <div className="flex flex-col leading-none">
        <span className="text-[9px] uppercase tracking-[0.28em] text-red-400">Live now</span>
        <span className="mt-1 text-xs uppercase tracking-[0.16em] text-white group-hover:text-red-200 md:text-sm">
          Watch the launch
        </span>
      </div>

      <Play className="h-4 w-4 text-red-400 transition-transform group-hover:translate-x-0.5 md:h-5 md:w-5" />
    </Link>
  );
}
