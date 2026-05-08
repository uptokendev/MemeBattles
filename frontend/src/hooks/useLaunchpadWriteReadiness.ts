import { useMemo } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { getLaunchpadWriteReadiness } from "@/lib/launchpadReadiness";

export function useLaunchpadWriteReadiness() {
  const wallet = useWallet();

  return useMemo(
    () =>
      getLaunchpadWriteReadiness({
        isConnected: wallet.isConnected,
        walletChainId: wallet.chainId,
      }),
    [wallet.isConnected, wallet.chainId],
  );
}
