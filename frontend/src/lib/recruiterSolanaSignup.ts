import { getSolanaProvider } from "@/lib/solanaWallet";

export const SOLANA_RECRUITER_CHAIN_ID = 101;

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export async function signRecruiterSolanaMessage(message: string): Promise<string> {
  const provider = getSolanaProvider();
  if (!provider?.signMessage) {
    throw new Error("This Solana wallet does not support message signing.");
  }
  const signed = await provider.signMessage(new TextEncoder().encode(message), "utf8");
  const signature = signed instanceof Uint8Array ? signed : signed.signature;
  return bytesToBase64(signature);
}
