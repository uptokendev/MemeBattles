// frontend/src/components/live/LivestreamPlayer.tsx
import { LiveBadge } from "./LiveBadge";
import { PlayerOffline } from "./PlayerOffline";

type Props = {
  playbackId: string;
};

export const LivestreamPlayer = (_props: Props) => {
  return (
    <div className="relative w-full">
      <div className="absolute right-3 top-3 z-10">
        <LiveBadge isLive={false} />
      </div>
      <PlayerOffline />
    </div>
  );
};
