import { useMemo } from "react";

import type { LaunchpadAdapter, LaunchpadChain } from "@/features/launchpad/adapters";
import { createBnbLaunchpadAdapter } from "@/features/launchpad/bnbAdapter";
import { createSolanaLaunchpadAdapter } from "@/features/launchpad/solanaAdapter";

function resolveLaunchpadChain(input?: { chain?: LaunchpadChain | string | null; chainId?: number | string | null }): LaunchpadChain {
  const explicit = String(input?.chain || "").trim().toLowerCase();
  if (explicit === "sol" || explicit === "solana") return "solana";
  if (explicit === "bnb" || explicit === "bsc") return "bnb";

  const chainId = Number(input?.chainId ?? 0);
  // Product Solana chain id is 101 (102 reserved/test aliases only if ever used).
  if (chainId === 101 || chainId === 102) return "solana";
  return "bnb";
}

export function getLaunchpadAdapter(input?: { chain?: LaunchpadChain | string | null; chainId?: number | string | null }): LaunchpadAdapter {
  const chain = resolveLaunchpadChain(input);
  return chain === "solana" ? createSolanaLaunchpadAdapter() : createBnbLaunchpadAdapter();
}

export function useLaunchpadAdapter(input?: { chain?: LaunchpadChain | string | null; chainId?: number | string | null }) {
  const chain = resolveLaunchpadChain(input);
  return useMemo(() => getLaunchpadAdapter({ chain }), [chain]);
}
