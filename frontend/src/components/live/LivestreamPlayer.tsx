// frontend/src/components/live/LivestreamPlayer.tsx
import MuxPlayer from "@mux/mux-player-react";
import { useQuery } from "@tanstack/react-query";
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
