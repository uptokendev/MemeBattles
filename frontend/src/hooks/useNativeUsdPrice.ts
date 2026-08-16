import { isSolanaChainId } from "@/lib/chainConfig";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useSolUsdPrice } from "@/hooks/useSolUsdPrice";

/** USD per native coin for the campaign chain. Never price SOL with BNB/USD. */
export function useNativeUsdPrice(chainId?: number | null) {
  const solana = isSolanaChainId(Number(chainId));
  const bnb = useBnbUsdPrice(!solana);
  const sol = useSolUsdPrice(solana);
  return solana ? sol : bnb;
}
