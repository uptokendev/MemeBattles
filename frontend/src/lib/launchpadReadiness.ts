import { getAllowedChainIds, getChainParams, getDefaultChainId, getFactoryAddress, isAllowedChainId, type SupportedChainId } from "@/lib/chainConfig";

export type LaunchpadWriteReadiness = {
  ready: boolean;
  reason: "ready" | "wallet_disconnected" | "wrong_chain" | "missing_factory";
  activeChainId: SupportedChainId;
  walletChainId?: number;
  factoryAddress: string;
  title: string;
  message: string;
  actionLabel?: string;
  targetChainId?: SupportedChainId;
};

export function getLaunchpadWriteReadiness({
  isConnected,
  walletChainId,
}: {
  isConnected: boolean;
  walletChainId?: number | null;
}): LaunchpadWriteReadiness {
  const defaultChainId = getDefaultChainId();
  const activeChainId = isAllowedChainId(walletChainId) ? (walletChainId as SupportedChainId) : defaultChainId;
  const factoryAddress = getFactoryAddress(activeChainId);

  if (!isConnected) {
    return {
      ready: false,
      reason: "wallet_disconnected",
      activeChainId,
      walletChainId: walletChainId || undefined,
      factoryAddress,
      title: "Connect wallet",
      message: "Connect your wallet before creating, buying, or selling campaigns.",
      actionLabel: "Connect wallet",
    };
  }

  if (!isAllowedChainId(walletChainId)) {
    const allowed = getAllowedChainIds().join(" or ");
    return {
      ready: false,
      reason: "wrong_chain",
      activeChainId,
      walletChainId: walletChainId || undefined,
      factoryAddress,
      title: "Wrong network",
      message: `Switch to a supported BNB Chain network before using launchpad actions. Supported chain IDs: ${allowed}.`,
      actionLabel: `Switch to ${getChainParams(defaultChainId).chainName}`,
      targetChainId: defaultChainId,
    };
  }

  if (!factoryAddress) {
    return {
      ready: false,
      reason: "missing_factory",
      activeChainId,
      walletChainId: walletChainId || undefined,
      factoryAddress,
      title: "Contracts not deployed for this network",
      message: `No LaunchFactory address is configured for chain ${activeChainId}. Deploy contracts and set VITE_FACTORY_ADDRESS_${activeChainId} before enabling launchpad writes.`,
    };
  }

  return {
    ready: true,
    reason: "ready",
    activeChainId,
    walletChainId: walletChainId || undefined,
    factoryAddress,
    title: "Launchpad ready",
    message: `Connected to chain ${activeChainId}.`,
  };
}

export async function requestWalletChainSwitch(provider: { send?: (method: string, params?: unknown[]) => Promise<unknown> } | null | undefined, chainId: SupportedChainId) {
  if (!provider?.send) throw new Error("Wallet provider is not available.");
  const params = getChainParams(chainId);

  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: params.chainId }]);
  } catch (error: any) {
    if (error?.code === 4902 || String(error?.message || "").toLowerCase().includes("unrecognized chain")) {
      await provider.send("wallet_addEthereumChain", [params]);
      return;
    }
    throw error;
  }
}

export function assertLaunchpadWriteReady(readiness: LaunchpadWriteReadiness) {
  if (readiness.ready) return;
  throw new Error(readiness.message || readiness.title || "Launchpad write action is not available.");
}
