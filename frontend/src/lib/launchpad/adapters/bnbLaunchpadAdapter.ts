import type { SupportedChainId } from "@/lib/chainConfig";
import type { LaunchpadSafetyStatus } from "./types";

export const BNB_LAUNCHPAD_ADAPTER_ID = "bnb" as const;

export function getBnbLaunchpadSafetyStatus(params: {
  chainId: SupportedChainId;
  factoryAddress: string;
  hasSigner: boolean;
  hasAccount: boolean;
}): LaunchpadSafetyStatus {
  return {
    adapterId: BNB_LAUNCHPAD_ADAPTER_ID,
    chainId: params.chainId,
    protocolStatus: params.factoryAddress ? "ready" : "unavailable",
    title: params.factoryAddress ? "BNB launch route ready" : "BNB factory missing",
    description: params.factoryAddress
      ? "BNB launches use route authorization, API preflight checks, and the configured LaunchFactory before any live action."
      : "Set the LaunchFactory address for this BNB chain before enabling direct deploy actions.",
    checks: [
      {
        id: "routeAuth",
        label: "Route authorization",
        state: "ready",
        detail: "Create, buy, and sell still request server authorization before contract writes.",
      },
      {
        id: "signer",
        label: "Wallet signer",
        state: params.hasSigner && params.hasAccount ? "ready" : "pending",
        detail: params.hasSigner && params.hasAccount ? "Signer connected." : "Connect a BNB-compatible wallet before launch actions.",
      },
      {
        id: "factory",
        label: "LaunchFactory",
        state: params.factoryAddress ? "ready" : "blocked",
        detail: params.factoryAddress || "Factory address is not configured for this chain.",
      },
      {
        id: "protocol",
        label: "Protocol adapter",
        state: "ready",
        detail: "BNB adapter uses the existing EVM launch contracts and security preflights.",
      },
    ],
  };
}
