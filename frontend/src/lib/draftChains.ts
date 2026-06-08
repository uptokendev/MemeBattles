export const SOLANA_MAINNET_CHAIN_ID = 101;
// Devnet (102) no longer supported. Only Solana mainnet (101) for drafts.
export const SOLANA_DEVNET_CHAIN_ID = 102; // legacy const only - not in supported list

export const SOLANA_DRAFT_CHAIN_IDS = [SOLANA_MAINNET_CHAIN_ID] as const;

export function isSolanaDraftChainId(chainId: number | string | undefined): boolean {
  const n = Number(chainId);
  return SOLANA_DRAFT_CHAIN_IDS.includes(n as (typeof SOLANA_DRAFT_CHAIN_IDS)[number]);
}

export function getDraftChainLabel(chainId: number): string {
  if (chainId === SOLANA_MAINNET_CHAIN_ID) return "Solana";
  if (chainId === 56) return "BNB";
  // Legacy testnet/devnet labels for display of old data only
  if (chainId === SOLANA_DEVNET_CHAIN_ID) return "Solana Devnet (legacy)";
  if (chainId === 97) return "BNB Testnet (legacy)";
  return `Chain ${chainId}`;
}

export type DraftChainPill = {
  label: string;
  className: string;
};

/** Returns styling + label for a small chain pill for draft cards.
 *  Yellow/amber "BNB" for BNB mainnet (56), purple/violet "Solana" for Solana mainnet (101).
 *  Testnet/devnet no longer supported for new drafts.
 */
export function getDraftChainPill(chainId: number | string | undefined): DraftChainPill {
  const isSol = isSolanaDraftChainId(chainId);
  if (isSol) {
    return {
      label: "Solana",
      className: "border-violet-400/60 bg-violet-400/10 text-violet-300",
    };
  }
  return {
    label: "BNB",
    className: "border-amber-400/60 bg-amber-400/10 text-amber-300",
  };
}
