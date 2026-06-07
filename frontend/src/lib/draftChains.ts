export type DraftChainFamily = "evm" | "solana";

export type DraftChainOption = {
  id: number;
  label: string;
  shortLabel: string;
  family: DraftChainFamily;
  network: "mainnet" | "testnet" | "devnet";
  draftOnly?: boolean;
};

export const BSC_MAINNET_CHAIN_ID = 56;
export const BSC_TESTNET_CHAIN_ID = 97;
export const SOLANA_MAINNET_CHAIN_ID = 101;
export const SOLANA_DEVNET_CHAIN_ID = 102;

export const SOLANA_DRAFT_CHAIN_IDS = [SOLANA_MAINNET_CHAIN_ID, SOLANA_DEVNET_CHAIN_ID] as const;

export const DRAFT_CHAIN_OPTIONS: DraftChainOption[] = [
  {
    id: BSC_MAINNET_CHAIN_ID,
    label: "BNB Smart Chain",
    shortLabel: "BNB Chain",
    family: "evm",
    network: "mainnet",
  },
  {
    id: BSC_TESTNET_CHAIN_ID,
    label: "BNB Smart Chain Testnet",
    shortLabel: "BNB Testnet",
    family: "evm",
    network: "testnet",
  },
  {
    id: SOLANA_MAINNET_CHAIN_ID,
    label: "Solana draft-only",
    shortLabel: "Solana",
    family: "solana",
    network: "mainnet",
    draftOnly: true,
  },
  {
    id: SOLANA_DEVNET_CHAIN_ID,
    label: "Solana Devnet draft-only",
    shortLabel: "Solana Devnet",
    family: "solana",
    network: "devnet",
    draftOnly: true,
  },
];

export function getDraftChainOption(chainId?: number | null): DraftChainOption | null {
  if (!chainId) return null;
  return DRAFT_CHAIN_OPTIONS.find((chain) => chain.id === Number(chainId)) || null;
}

export function isSolanaDraftChainId(chainId?: number | null): boolean {
  return SOLANA_DRAFT_CHAIN_IDS.includes(Number(chainId) as (typeof SOLANA_DRAFT_CHAIN_IDS)[number]);
}

export function isEvmDraftChainId(chainId?: number | null): boolean {
  return getDraftChainOption(chainId)?.family === "evm";
}

export function getDraftChainLabel(chainId?: number | null): string {
  return getDraftChainOption(chainId)?.label || (chainId ? `Chain ${chainId}` : "Unknown chain");
}

export function getDefaultDraftChainId(): number {
  return BSC_TESTNET_CHAIN_ID;
}
