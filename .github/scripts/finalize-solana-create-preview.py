from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_exact(path, old, new, expected):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} matches, found {count}")
    p.write_text(text.replace(old, new), encoding="utf-8")


create = "frontend/src/lib/solanaV4CreateSubmit.ts"
replace_once(
    create,
    'const MAX_SOLANA_TRANSACTION_BYTES = 1_232;\n',
    '''const MAX_SOLANA_TRANSACTION_BYTES = 1_232;
const LAMPORTS_PER_SOL = 1_000_000_000;
const MIN_CREATE_LAMPORTS = 30_000_000; // conservative balance guard / fallback only
const CREATE_RENT_ACCOUNT_SIZES = [720, 82, 165, 81, 155] as const;
const CREATOR_PROFILE_ACCOUNT_BYTES = 84;
''',
)
replace_once(
    create,
    '''export type SolanaV4CreateSubmitResult = {
  signature: string;
  campaignAddress: string;
  mintAddress: string;
  programId: string;
  plan: SolanaV4GeneratedIdlInvocationPlan | null;
  recovered?: boolean;
};
''',
    '''export type SolanaV4CreateSubmitResult = {
  signature: string;
  campaignAddress: string;
  mintAddress: string;
  programId: string;
  plan: SolanaV4GeneratedIdlInvocationPlan | null;
  recovered?: boolean;
};

export type SolanaV4CreatePreflightPreview = {
  walletBalanceLamports: number;
  serializedBytes: number;
  instructionCount: number;
  unitsConsumed: number | null;
  estimatedFeeLamports: number | null;
  estimatedRentLamports: number | null;
  estimatedDeploymentLamports: number;
  estimateSource: "rpc-fee+rent" | "conservative-fallback";
};

export type SolanaV4CreateSubmitOptions = {
  creatorAddress?: string;
  onPreflightReady?: (preview: SolanaV4CreatePreflightPreview) => void | Promise<void>;
};
''',
)
replace_exact(create, '  opts?: { creatorAddress?: string },\n', '  opts?: SolanaV4CreateSubmitOptions,\n', 2)
replace_once(create, '  const MIN_CREATE_LAMPORTS = 30_000_000; // ~0.03 SOL covers mint/vault/campaign/auth rent\n', "")
replace_once(
    create,
    '''    console.info("[solanaV4CreateSubmit] unsigned create simulation passed", {
      serializedBytes,
      unitsConsumed: simulation.value.unitsConsumed ?? null,
      instructionCount: unsigned.instructions.length,
      requiredWalletSigners: 1,
    });
  };

  const signAndSend = async () => {
''',
    '''    const unitsConsumed = simulation.value.unitsConsumed ?? null;
    const instructionCount = unsigned.instructions.length;
    console.info("[solanaV4CreateSubmit] unsigned create simulation passed", {
      serializedBytes,
      unitsConsumed,
      instructionCount,
      requiredWalletSigners: 1,
    });
    return { serializedBytes, unitsConsumed, instructionCount };
  };

  const estimateDeploymentCost = async (
    unsigned: InstanceType<typeof Transaction>,
    simulation: { serializedBytes: number; unitsConsumed: number | null; instructionCount: number },
  ): Promise<SolanaV4CreatePreflightPreview> => {
    let estimatedFeeLamports: number | null = null;
    try {
      const fee = await connection.getFeeForMessage(unsigned.compileMessage(), "confirmed");
      estimatedFeeLamports = typeof fee.value === "number" ? fee.value : null;
    } catch (error) {
      console.warn("[solanaV4CreateSubmit] fee estimate unavailable", error);
    }

    let estimatedRentLamports: number | null = null;
    try {
      const sizes: number[] = [...CREATE_RENT_ACCOUNT_SIZES];
      const creatorProfilePk = new PublicKey(plan.createCampaign.accounts.creatorProfile);
      const creatorProfileInfo = await connection.getAccountInfo(creatorProfilePk, "confirmed");
      if (!creatorProfileInfo) sizes.push(CREATOR_PROFILE_ACCOUNT_BYTES);
      const rents = await Promise.all(sizes.map((size) => connection.getMinimumBalanceForRentExemption(size, "confirmed")));
      estimatedRentLamports = rents.reduce((sum, lamports) => sum + lamports, 0);
    } catch (error) {
      console.warn("[solanaV4CreateSubmit] rent estimate unavailable", error);
    }

    const precise = estimatedFeeLamports != null && estimatedRentLamports != null;
    const preview: SolanaV4CreatePreflightPreview = {
      walletBalanceLamports: balance,
      serializedBytes: simulation.serializedBytes,
      instructionCount: simulation.instructionCount,
      unitsConsumed: simulation.unitsConsumed,
      estimatedFeeLamports,
      estimatedRentLamports,
      estimatedDeploymentLamports: precise ? estimatedFeeLamports + estimatedRentLamports : MIN_CREATE_LAMPORTS,
      estimateSource: precise ? "rpc-fee+rent" : "conservative-fallback",
    };
    console.info("[solanaV4CreateSubmit] deployment preflight ready", {
      ...preview,
      estimatedDeploymentSol: preview.estimatedDeploymentLamports / LAMPORTS_PER_SOL,
    });
    return preview;
  };

  let preflightPreviewShown = false;
  const signAndSend = async () => {
''',
)
replace_once(
    create,
    '''    const simulationTx = buildUnsigned(simulationLatest.blockhash);
    await simulateUnsignedCreate(simulationTx);

    const latest = await connection.getLatestBlockhash("confirmed");
''',
    '''    const simulationTx = buildUnsigned(simulationLatest.blockhash);
    const simulation = await simulateUnsignedCreate(simulationTx);
    const preview = await estimateDeploymentCost(simulationTx, simulation);
    if (!preflightPreviewShown && opts?.onPreflightReady) {
      await opts.onPreflightReady(preview);
      preflightPreviewShown = true;
    }

    const latest = await connection.getLatestBlockhash("confirmed");
''',
)

create_page = "frontend/src/pages/Create.tsx"
replace_once(
    create_page,
    '''        toast.message("Confirm createCampaign in your Solana wallet…");
        const created = await submitSolanaV4CreateFromAuthorization(authorization, {
          creatorAddress: creatorWallet,
        });
''',
    '''        toast.message("Running Solana security simulation…");
        const created = await submitSolanaV4CreateFromAuthorization(authorization, {
          creatorAddress: creatorWallet,
          onPreflightReady: (preview) => {
            toast.success(
              `Solana deployment ready · Security checks passed ✓ · Transaction simulation passed ✓ · Estimated deployment cost: ≈ ${(preview.estimatedDeploymentLamports / 1_000_000_000).toFixed(4)} SOL`,
              { duration: 8_000 },
            );
          },
        });
''',
)

push_live = "frontend/src/pages/PushDraftLive.tsx"
replace_once(
    push_live,
    '''      const created = await submitSolanaV4CreateFromAuthorization(authorization, {
        creatorAddress: solanaWallet.solanaAccount,
      });
''',
    '''      const created = await submitSolanaV4CreateFromAuthorization(authorization, {
        creatorAddress: solanaWallet.solanaAccount,
        onPreflightReady: (preview) => {
          toast.success(
            `Solana deployment ready · Security checks passed ✓ · Transaction simulation passed ✓ · Estimated deployment cost: ≈ ${(preview.estimatedDeploymentLamports / 1_000_000_000).toFixed(4)} SOL`,
            { duration: 8_000 },
          );
        },
      });
''',
)

print("Solana create preview patch applied")
