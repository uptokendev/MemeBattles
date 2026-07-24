import { useCallback, useMemo } from "react";

import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { getActiveChainId } from "@/lib/chainConfig";
import { getSolanaProvider } from "@/lib/solanaWallet";

export type RecruiterWalletChain = "bnb" | "solana";

export type RecruiterWalletCandidate = {
  chain: RecruiterWalletChain;
  address: string;
  chainId: number;
  label: string;
  canSign: boolean;
};

export type RecruiterWalletController = {
  activeWallet: RecruiterWalletCandidate | null;
  connectedWallets: RecruiterWalletCandidate[];
  bnbAddress: string;
  solanaAddress: string;
  bnbChainId?: number;
  connecting: boolean;
  connect: (chain?: RecruiterWalletChain) => Promise<string>;
  disconnect: (chain?: RecruiterWalletChain) => Promise<void>;
  signMessage: (chain: RecruiterWalletChain, address: string, message: string) => Promise<string>;
};

function sameAddress(chain: RecruiterWalletChain, left?: string | null, right?: string | null): boolean {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  if (!a || !b) return false;
  return chain === "bnb" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function signSolanaMessage(message: string, expectedAddress?: string): Promise<string> {
  const provider = getSolanaProvider();
  if (!provider?.signMessage) throw new Error("This Solana wallet does not support message signing.");

  let publicKey = String(provider.publicKey?.toString?.() || "").trim();
  if (!publicKey && provider.connect) {
    const result = await provider.connect({ onlyIfTrusted: false } as any);
    publicKey = String(result?.publicKey?.toString?.() || provider.publicKey?.toString?.() || "").trim();
  }

  if (!publicKey) throw new Error("Solana wallet not connected.");
  if (expectedAddress && publicKey !== expectedAddress) throw new Error("Connected Solana wallet does not match the selected recruiter wallet.");

  const encoded = new TextEncoder().encode(message);
  const signed = await provider.signMessage(encoded, "utf8");
  const signature = signed instanceof Uint8Array ? signed : signed.signature;
  if (!signature?.length) throw new Error("Solana wallet did not return a signature.");
  return bytesToBase64(signature);
}

export function useRecruiterWallet(): RecruiterWalletController {
  const bnbWallet = useWallet();
  const solanaWallet = useSolanaWallet();

  const bnbAddress = String(bnbWallet.account || "").trim();
  const solanaAddress = String(solanaWallet.solanaAccount || "").trim();
  const bnbChainId = bnbWallet.chainId;

  const connectedWallets = useMemo<RecruiterWalletCandidate[]>(() => {
    const wallets: RecruiterWalletCandidate[] = [];
    if (solanaAddress) {
      wallets.push({
        chain: "solana",
        address: solanaAddress,
        chainId: 101,
        label: solanaWallet.solanaWalletName || "Solana",
        canSign: true,
      });
    }
    if (bnbAddress) {
      wallets.push({
        chain: "bnb",
        address: bnbAddress,
        chainId: getActiveChainId(bnbChainId),
        label: "BNB",
        canSign: Boolean(bnbWallet.signer),
      });
    }
    return wallets;
  }, [bnbAddress, bnbChainId, bnbWallet.signer, solanaAddress, solanaWallet.solanaWalletName]);

  const connect = useCallback(async (chain?: RecruiterWalletChain) => {
    if (chain === "solana") {
      const result = await solanaWallet.connectSolana();
      return result.publicKey;
    }
    return bnbWallet.connect();
  }, [bnbWallet, solanaWallet]);

  const disconnect = useCallback(async (chain?: RecruiterWalletChain) => {
    if (chain === "solana") {
      await solanaWallet.disconnectSolana();
      return;
    }
    if (chain === "bnb") {
      await bnbWallet.disconnect();
      return;
    }
    await Promise.allSettled([bnbWallet.disconnect(), solanaWallet.disconnectSolana()]);
  }, [bnbWallet, solanaWallet]);

  const signMessage = useCallback(async (chain: RecruiterWalletChain, address: string, message: string) => {
    if (chain === "solana") return signSolanaMessage(message, address);
    if (!bnbWallet.signer || !bnbAddress) throw new Error("Connect your BNB wallet before signing.");
    if (!sameAddress("bnb", bnbAddress, address)) throw new Error("Connected BNB wallet does not match the selected wallet.");
    return bnbWallet.signer.signMessage(message);
  }, [bnbAddress, bnbWallet.signer]);

  return {
    activeWallet: connectedWallets[0] || null,
    connectedWallets,
    bnbAddress,
    solanaAddress,
    bnbChainId,
    connecting: Boolean(bnbWallet.connecting || solanaWallet.connectingSolana),
    connect,
    disconnect,
    signMessage,
  };
}
