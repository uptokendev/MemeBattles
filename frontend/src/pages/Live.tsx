// frontend/src/pages/Live.tsx
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { useWallet } from "@/contexts/WalletContext";
import { fetchWalletAttributionState } from "@/lib/recruiterApi";
import { LivestreamPlayer } from "@/components/live/LivestreamPlayer";
import { LiveChat } from "@/components/live/LiveChat";
import { LiveChatInput } from "@/components/live/LiveChatInput";
import { ViewerCount } from "@/components/live/ViewerCount";
import { useLiveChannel } from "@/hooks/useLiveChannel";
import NotFound from "./NotFound";

const PLAYBACK_ID = String(import.meta.env.VITE_MUX_PLAYBACK_ID || "").trim();
const CHAT_CHANNEL = String(import.meta.env.VITE_LIVE_CHAT_CHANNEL || "live:launch-party").trim();
const PAGE_ENABLED = String(import.meta.env.VITE_LIVE_PAGE_ENABLED || "true").trim() === "true";

const Live = () => {
  // Hooks must be called unconditionally on every render (Rules of Hooks).
  // Side-effects are gated via `enabled` so they no-op until the wallet is connected.
  const wallet = useWallet();
  const account = wallet.account || "";
  const ready = PAGE_ENABLED && wallet.isConnected && account.length > 0;

  const { data: attribution } = useQuery({
    queryKey: ["wallet-attribution", account.toLowerCase()],
    queryFn: () => fetchWalletAttributionState(account),
    staleTime: Infinity,
    enabled: ready,
  });
  // recruiterDisplayName is part of WalletAttributionPublicState (recruiterApi.ts:146-155).
  const squadCallsign = attribution?.recruiterCode ?? null;
  const handle = attribution?.recruiterDisplayName ?? null;

  const { messages, publish, presenceCount } = useLiveChannel({
    channelName: CHAT_CHANNEL,
    clientId: account,
    enabled: ready,
  });

  // Render branches AFTER all hooks have been called.
  if (!PAGE_ENABLED) return <NotFound />;

  if (!wallet.isConnected || !account) {
    return (
      <div className="mx-auto w-full max-w-3xl py-10">
        <Card className="flex flex-col items-center gap-4 border-border/60 bg-card/65 p-6 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Restricted Channel
            </div>
            <div className="mt-1 font-retro text-2xl md:text-4xl">
              Connect to watch the launch party
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              The stream is gated to wallet-connected soldiers.
            </div>
          </div>
          <ConnectWalletButton />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl py-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-3">
          <LivestreamPlayer playbackId={PLAYBACK_ID} />
          <div className="flex items-center justify-between">
            <ViewerCount count={presenceCount} />
          </div>
        </div>
        <Card className="flex h-[480px] flex-col gap-3 border-border/60 bg-card/65 p-3 md:h-[640px]">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Comms Channel
          </div>
          <div className="min-h-0 flex-1">
            <LiveChat messages={messages} />
          </div>
          <LiveChatInput
            wallet={account}
            handle={handle}
            squadCallsign={squadCallsign}
            onSend={publish}
          />
        </Card>
      </div>
    </div>
  );
};

export default Live;
