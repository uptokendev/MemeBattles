import { useParams } from "react-router-dom";

import { TokenSafetyStatusButton } from "@/components/token/TokenSafetyStatusButton";
import { useWallet } from "@/contexts/WalletContext";
import { getActiveChainId } from "@/lib/chainConfig";

export function TokenSafetyRouteOverlay() {
  const { campaignAddress = "" } = useParams();
  const wallet = useWallet();
  const chainId = getActiveChainId(wallet.chainId);

  if (!campaignAddress) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-[5.4rem] z-50 hidden xl:block">
      <div className="pointer-events-auto">
        <TokenSafetyStatusButton campaignAddress={campaignAddress} chainId={chainId} />
      </div>
    </div>
  );
}
