import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("meme_warzone_launchpad", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MemeWarzoneLaunchpad as Program;
  const admin = provider.wallet as anchor.Wallet;
  const creator = Keypair.generate();
  const buyer = Keypair.generate();
  const mint = Keypair.generate();
  const zeroClusterId = Buffer.alloc(32);

  const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from("global")], program.programId);
  const [creatorProfile] = PublicKey.findProgramAddressSync([Buffer.from("creator"), creator.publicKey.toBuffer()], program.programId);
  const [creatorRiskProfile] = PublicKey.findProgramAddressSync([Buffer.from("risk"), creator.publicKey.toBuffer()], program.programId);
  const [buyerRiskProfile] = PublicKey.findProgramAddressSync([Buffer.from("risk"), buyer.publicKey.toBuffer()], program.programId);
  const [zeroClusterProfile] = PublicKey.findProgramAddressSync([Buffer.from("cluster"), zeroClusterId], program.programId);
  const [campaignState] = PublicKey.findProgramAddressSync([Buffer.from("campaign"), mint.publicKey.toBuffer()], program.programId);
  const [feeVault] = PublicKey.findProgramAddressSync([Buffer.from("fee_vault"), mint.publicKey.toBuffer()], program.programId);

  before(async () => {
    for (const wallet of [creator.publicKey, buyer.publicKey]) {
      const sig = await provider.connection.requestAirdrop(wallet, 2 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
  });

  it("initializes global config, creator profile, risk profiles, and cluster profile", async () => {
    await program.methods
      .initializeGlobalConfig({
        pauser: admin.publicKey,
        riskAdmin: admin.publicKey,
        tierAdmin: admin.publicKey,
        feeAuthority: admin.publicKey,
        tradeFeeBps: 50,
        graduationFeeBps: 250,
      })
      .accounts({
        admin: admin.publicKey,
        globalConfig,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .initializeCreatorProfile()
      .accounts({
        creator: creator.publicKey,
        creatorProfile,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    await program.methods
      .initializeWalletRisk()
      .accounts({
        payer: admin.publicKey,
        wallet: creator.publicKey,
        riskProfile: creatorRiskProfile,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .initializeWalletRisk()
      .accounts({
        payer: admin.publicKey,
        wallet: buyer.publicKey,
        riskProfile: buyerRiskProfile,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .initializeClusterProfile([...zeroClusterId])
      .accounts({
        payer: admin.publicKey,
        clusterProfile: zeroClusterProfile,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const profile = await program.account.creatorProfile.fetch(creatorProfile);
    expect(profile.creatorWallet.toBase58()).to.eq(creator.publicKey.toBase58());
    expect(profile.tier).to.eq(1);
    expect(profile.liveBondingCount).to.eq(0);
  });

  it("creates a campaign with tier rules and initializes the fee vault", async () => {
    await program.methods
      .createCampaign({
        graduationTargetLamports: new anchor.BN(1_000_000),
        creatorBuyCapLamports: new anchor.BN(250_000_000),
        basePriceLamports: new anchor.BN(100),
        priceSlopeLamports: new anchor.BN(0),
      })
      .accounts({
        creator: creator.publicKey,
        globalConfig,
        creatorProfile,
        riskProfile: creatorRiskProfile,
        clusterProfile: zeroClusterProfile,
        mint: mint.publicKey,
        campaignState,
        feeVault,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const campaign = await program.account.campaignState.fetch(campaignState);
    const vault = await program.account.feeVault.fetch(feeVault);
    const profile = await program.account.creatorProfile.fetch(creatorProfile);
    expect(campaign.creator.toBase58()).to.eq(creator.publicKey.toBase58());
    expect(campaign.mint.toBase58()).to.eq(mint.publicKey.toBase58());
    expect(campaign.feeVault.toBase58()).to.eq(feeVault.toBase58());
    expect(campaign.creatorBuyCapLamports.toNumber()).to.eq(250_000_000);
    expect(vault.campaignState.toBase58()).to.eq(campaignState.toBase58());
    expect(vault.solVaultLamports.toNumber()).to.eq(0);
    expect(profile.liveBondingCount).to.eq(1);
    expect(profile.totalLaunches.toNumber()).to.eq(1);
  });

  it("moves SOL into the fee vault and records protocol fees on buy", async () => {
    await program.methods
      .buy(new anchor.BN(10_000))
      .accounts({
        trader: buyer.publicKey,
        globalConfig,
        campaignState,
        feeVault,
        riskProfile: buyerRiskProfile,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const campaign = await program.account.campaignState.fetch(campaignState);
    const vault = await program.account.feeVault.fetch(feeVault);
    expect(campaign.grossBuyLamports.toNumber()).to.eq(10_000);
    expect(campaign.soldAmount.toNumber()).to.eq(99);
    expect(vault.protocolFeeLamports.toNumber()).to.eq(50);
    expect(vault.solVaultLamports.toNumber()).to.eq(9_950);
  });

  it("blocks creator buys during the tier lock", async () => {
    try {
      await program.methods
        .buy(new anchor.BN(1_000_000))
        .accounts({
          trader: creator.publicKey,
          globalConfig,
          campaignState,
          feeVault,
          riskProfile: creatorRiskProfile,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
      expect.fail("creator buy should have been locked");
    } catch (error: any) {
      expect(String(error?.error?.errorCode?.code || error?.message)).to.contain("CreatorBuyLocked");
    }
  });
});
