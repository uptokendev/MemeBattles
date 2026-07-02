import { useParams } from "react-router-dom";

import { TokenSafetyPanel } from "@/components/token/TokenSafetyPanel";
import { useWallet } from "@/contexts/WalletContext";
import { getActiveChainId } from "@/lib/chainConfig";

export function TokenSafetyRouteOverlay() {
  const { campaignAddress = "" } = useParams();
  const wallet = useWallet();
  const chainId = getActiveChainId(wallet.chainId);

  if (!campaignAddress) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 left-4 z-40 hidden w-[min(92vw,25rem)] xl:block">
      <div className="pointer-events-auto">
        <TokenSafetyPanel campaignAddress={campaignAddress} chainId={chainId} />
      </div>
    </div>
  );
}
