import {
  assertSolanaV4AuthorizationResponse,
  type SolanaV4CreateAccounts,
  type SolanaV4CreateArgs,
  type SolanaV4CreateAuthorizationResponse,
} from "@/lib/solanaCreateAuthorizationV4";

export type SolanaV4Ed25519VerificationPlan = {
  publicKey: string;
  message: Uint8Array;
  signature: Uint8Array;
  messageLength: 32;
};

export type SolanaV4GeneratedIdlInvocationPlan = {
  schemaVersion: 4;
  programId: string;
  cluster: string;
  ed25519Verification: SolanaV4Ed25519VerificationPlan;
  createCampaign: {
    instructionName: "createCampaign";
    args: SolanaV4CreateArgs;
    accounts: SolanaV4CreateAccounts;
    mustImmediatelyFollowEd25519Verification: true;
  };
  transactionPolicy: {
    feePayer: "creator";
    requiredTransactionSigners: ["creator"];
    railwayTransactionSigner: false;
  };
};

function decodeBase64(value: string, expectedLength: number, label: string) {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error(`${label} is not valid base64.`);
  }
  if (binary.length !== expectedLength) {
    throw new Error(`${label} must decode to exactly ${expectedLength} bytes.`);
  }
  const output = new Uint8Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

/**
 * Converts the validated Railway response into the exact handoff required by
 * a generated Anchor-IDL client and a Solana wallet adapter.
 *
 * This function deliberately does not construct a transaction. The wallet
 * layer must create a native Ed25519 verification instruction from the
 * returned bytes, place it immediately before createCampaign, choose a recent
 * blockhash, set the creator as fee payer, and request the creator signature.
 */
export function buildSolanaCreateCampaignV4Plan(
  response: SolanaV4CreateAuthorizationResponse,
): SolanaV4GeneratedIdlInvocationPlan {
  assertSolanaV4AuthorizationResponse(response);

  return {
    schemaVersion: 4,
    programId: response.programId,
    cluster: response.cluster,
    ed25519Verification: {
      publicKey: response.authorization.routeSigner,
      message: decodeBase64(response.authorization.digestBase64, 32, "authorization digest"),
      signature: decodeBase64(response.authorization.signatureBase64, 64, "authorization signature"),
      messageLength: 32,
    },
    createCampaign: {
      instructionName: "createCampaign",
      args: response.createArgs,
      accounts: response.accounts,
      mustImmediatelyFollowEd25519Verification: true,
    },
    transactionPolicy: {
      feePayer: "creator",
      requiredTransactionSigners: ["creator"],
      railwayTransactionSigner: false,
    },
  };
}
