// frontend/src/components/live/LivestreamPlayer.tsx
import { useEffect, useRef } from "react";
import MuxPlayer from "@mux/mux-player-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { LiveBadge } from "./LiveBadge";
import { PlayerOffline } from "./PlayerOffline";

type Props = {
  playbackId: string;
};

async function checkLive(playbackId: string): Promise<boolean> {
  // HEAD on the HLS manifest is the lightest "is the stream live now" probe.
  // If Mux's CDN ever blocks CORS on HEAD, the fetch throws and we return false (offline).
  // That's a safe default — we'll spot a stuck-offline state in the launch-night
  // smoke test (Task 12) and can swap this for Mux Player's own `loaderror`/`playing`
  // state events if needed.
  try {
    const res = await fetch(`https://stream.mux.com/${playbackId}.m3u8`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

export const LivestreamPlayer = ({ playbackId }: Props) => {
  const { data: isLive = false } = useQuery({
    queryKey: ["mux-live-status", playbackId],
    queryFn: () => checkLive(playbackId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    enabled: Boolean(playbackId),
  });

  // Spec Section 10: toast when stream drops mid-event. Only fire on a true
  // live→offline transition (not on first-load offline state).
  const wasLiveRef = useRef(false);
  useEffect(() => {
    if (wasLiveRef.current && !isLive) {
      toast("Stream interrupted — back in a moment");
    }
    wasLiveRef.current = isLive;
  }, [isLive]);

  return (
    <div className="relative w-full">
      <div className="absolute right-3 top-3 z-10">
        <LiveBadge isLive={isLive} />
      </div>
      {isLive ? (
        <MuxPlayer
          streamType="live"
          playbackId={playbackId}
          metadata={{ video_title: "MemeBattles Launch Party" }}
          autoPlay
          accentColor="#ef4444"
          className="aspect-video w-full overflow-hidden rounded-md bg-black"
        />
      ) : (
        <PlayerOffline />
      )}
    </div>
  );
};
