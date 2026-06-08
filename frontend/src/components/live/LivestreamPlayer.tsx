// frontend/src/components/live/LivestreamPlayer.tsx
import { PlayerOffline } from "./PlayerOffline";

// Mux live status polling and related imports removed to stop 412 errors and console spam.
// The component now statically shows the offline placeholder (no active stream).
// Restore MuxPlayer + status query if a live broadcast is re-enabled.

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
  // Live status polling removed to stop repeated 412 Precondition Failed on Mux HLS
  // (stream not live or no active broadcast). Hardcode as offline for now; replace
  // with static player or different provider if a stream is re-enabled.
  const isLive = false;

  return (
    <div className="relative w-full">
      <PlayerOffline />
    </div>
  );
};
