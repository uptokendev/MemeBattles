import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { isEvmAddress, isSolanaAddress } from "@/lib/address";
import {
  BNB_TESTNET_CHAIN_ID,
  isEvmChainId,
  SOLANA_CHAIN_ID,
  type SupportedChainId,
} from "@/lib/chainConfig";
import { getActiveWalletKind } from "@/lib/activeWalletChain";
import { useSelectedFeedChainId } from "@/components/common/ChainFeedSwitch";

/**
 * Owner wallet for Command Center / Claims / profile.
 * Last connected wallet wins: Solana session beats leftover MetaMask unless
 * the user just connected a BNB wallet.
 */
export function useActiveFeedWallet() {
  const [feedChainId] = useSelectedFeedChainId();
  const evm = useWallet();
  const { solanaAccount, isSolanaConnected } = useSolanaWallet();

  const solanaAddr = isSolanaConnected && solanaAccount ? String(solanaAccount) : null;
  const evmAddr = evm.isConnected && isEvmAddress(evm.account) ? String(evm.account) : null;
  const kind = getActiveWalletKind();
  const preferSolana =
    kind === "solana" ||
    Number(feedChainId) === SOLANA_CHAIN_ID ||
    Boolean(solanaAddr && kind !== "bnb");
  const address = preferSolana ? solanaAddr || evmAddr : evmAddr || solanaAddr;
  const isSolana = isSolanaAddress(address);

  let chainId: SupportedChainId;
  if (isSolana) {
    chainId = SOLANA_CHAIN_ID;
  } else if (isEvmChainId(evm.chainId)) {
    chainId = evm.chainId as SupportedChainId;
  } else if (isEvmChainId(feedChainId)) {
    chainId = feedChainId;
  } else {
    chainId = BNB_TESTNET_CHAIN_ID;
  }

  return {
    address: address || null,
    chainId,
    isSolana,
    feedChainId,
    solanaAccount: solanaAddr,
    evmAccount: evmAddr,
  };
}
