import type { CreateTokenInput, LaunchpadAdapter, QuoteInput, QuoteResult, TokenState, TradeInput, TxResult } from "@/lib/launchpadAdapter";
import type { LaunchpadPreflight } from "@/lib/recruiterApi";

function notReady(): never {
  throw new Error("Solana launchpad program transactions are not available yet. Solana wallet connection is supported; protocol actions require the Anchor program build.");
}

export function createSolanaLaunchpadAdapter(): LaunchpadAdapter {
  return {
    chain: "solana",

    async createToken(_input: CreateTokenInput): Promise<TxResult> {
      return notReady();
    },

    async buy(_input: TradeInput): Promise<TxResult> {
      return notReady();
    },

    async sell(_input: TradeInput): Promise<TxResult> {
      return notReady();
    },

    async getTokenState(_tokenId: string): Promise<TokenState> {
      return { campaign: null, metrics: null };
    },

    async getCreatorProfile(_wallet: string) {
      return null;
    },

    async getLaunchEligibility(wallet: string): Promise<LaunchpadPreflight> {
      return {
        allowed: false,
        reasons: ["Solana program launch eligibility is waiting on the Anchor program and indexer."],
        warnings: [`Wallet ${wallet} can connect, but Solana protocol actions are not enabled yet.`],
        schemaReady: false,
      };
    },

    async getQuote(_input: QuoteInput): Promise<QuoteResult> {
      return { amountWei: 0n, warnings: ["Solana quotes require the launchpad program client."] };
    },

    async graduate(_tokenId: string): Promise<TxResult> {
      return notReady();
    },
  };
}
