import { useCallback, useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { isSolanaAddress } from "@/lib/address";
import { isSolanaChainId } from "@/lib/chainConfig";
import { signSolanaMessage } from "@/lib/solanaWallet";
import {
  clearAbuseSession,
  openAbuseSession,
  readStoredAbuseSession,
  signAbuseSession,
} from "@/lib/abuseApi";

export function useAbuseReporterSession(walletAddress: string, chainId?: number) {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);

  const ensureSession = useCallback(async () => {
    const numericChainId = Number(chainId);
    if (!walletAddress || !Number.isFinite(numericChainId)) {
      throw new Error("Connect the Command Center wallet first.");
    }

    const existing = readStoredAbuseSession(walletAddress, numericChainId);
    if (existing) return existing;

    setBusy(true);
    try {
      const solana = isSolanaChainId(numericChainId) || isSolanaAddress(walletAddress);
      const auth = await signAbuseSession({
        walletAddress,
        chainId: numericChainId,
        walletType: solana ? "solana" : "evm",
        signMessage: solana
          ? async (message) => (await signSolanaMessage(message, walletAddress)).signature
          : undefined,
        signer: solana ? undefined : wallet.signer,
      });
      return await openAbuseSession({ walletAddress, chainId: numericChainId, auth });
    } catch (error) {
      clearAbuseSession(walletAddress, numericChainId);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [chainId, wallet.signer, walletAddress]);

  const withSession = useCallback(async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
    const token = await ensureSession();
    try {
      return await fn(token);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "ABUSE_SESSION_REQUIRED") throw error;
      clearAbuseSession(walletAddress, Number(chainId));
      const next = await ensureSession();
      return fn(next);
    }
  }, [chainId, ensureSession, walletAddress]);

  return { busy, ensureSession, withSession };
}
