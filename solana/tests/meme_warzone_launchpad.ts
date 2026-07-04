import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

describe("meme_warzone_launchpad", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MemeWarzoneLaunchpad as Program;
  const admin = provider.wallet as anchor.Wallet;
  const creator = Keypair.generate();
  const buyer = Keypair.generate();
  const recruiter = Keypair.generate();
  const squadTreasury = Keypair.generate();
  const mint = Keypair.generate();
  const zeroClusterId = Buffer.alloc(32);

  const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from("global")], program.programId);
  const [creatorProfile] = PublicKey.findProgramAddressSync([Buffer.from("creator"), creator.publicKey.toBuffer()], program.programId);
  const [creatorRiskProfile] = PublicKey.findProgramAddressSync([Buffer.from("risk"), creator.publicKey.toBuffer()], program.programId);
  const [buyerRiskProfile] = PublicKey.findProgramAddressSync([Buffer.from("risk"), buyer.publicKey.toBuffer()], program.programId);
  const [zeroClusterProfile] = PublicKey.findProgramAddressSync([Buffer.from("cluster"), zeroClusterId], program.programId);
  const [campaignState] = PublicKey.findProgramAddressSync([Buffer.from("campaign"), mint.publicKey.toBuffer()], program.programId);
  const [feeVault] = PublicKey.findProgramAddressSync([Buffer.from("fee_vault"), mint.publicKey.toBuffer()], program.programId);
  const buyerTokenAccount = getAssociatedTokenAddressSync(mint.publicKey, buyer.publicKey);
  const creatorTokenAccount = getAssociatedTokenAddressSync(mint.publicKey, creator.publicKey);

  before(async () => {
    for (const wallet of [creator.publicKey, buyer.publicKey]) {
      const sig = await provider.connection.requestAirdrop(wallet, 2 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    const mintRent = await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: admin.publicKey,
          newAccountPubkey: mint.publicKey,
          lamports: mintRent,
          space: MINT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(mint.publicKey, 0, campaignState, null, TOKEN_PROGRAM_ID),
        createAssociatedTokenAccountInstruction(admin.publicKey, buyerTokenAccount, buyer.publicKey, mint.publicKey),
        createAssociatedTokenAccountInstruction(admin.publicKey, creatorTokenAccount, creator.publicKey, mint.publicKey),
      ),
      [mint],
    );
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

  it("creates a campaign with tier rules, fee recipients, a valid SPL mint, and initializes the fee vault", async () => {
    await program.methods
      .createCampaign({
        graduationTargetLamports: new anchor.BN(1_000_000),
        creatorBuyCapLamports: new anchor.BN(250_000_000),
        basePriceLamports: new anchor.BN(100),
        priceSlopeLamports: new anchor.BN(1),
        recruiter: recruiter.publicKey,
        squadTreasury: squadTreasury.publicKey,
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
    const mintState = await getMint(provider.connection, mint.publicKey);
    expect(campaign.creator.toBase58()).to.eq(creator.publicKey.toBase58());
    expect(campaign.recruiter.toBase58()).to.eq(recruiter.publicKey.toBase58());
    expect(campaign.squadTreasury.toBase58()).to.eq(squadTreasury.publicKey.toBase58());
    expect(campaign.mint.toBase58()).to.eq(mint.publicKey.toBase58());
    expect(campaign.feeVault.toBase58()).to.eq(feeVault.toBase58());
    expect(campaign.creatorBuyCapLamports.toNumber()).to.eq(250_000_000);
    expect(campaign.priceSlopeLamports.toNumber()).to.eq(1);
    expect(mintState.mintAuthority?.toBase58()).to.eq(campaignState.toBase58());
    expect(mintState.freezeAuthority).to.eq(null);
    expect(vault.campaignState.toBase58()).to.eq(campaignState.toBase58());
    expect(vault.solVaultLamports.toNumber()).to.eq(0);
    expect(profile.liveBondingCount).to.eq(1);
    expect(profile.totalLaunches.toNumber()).to.eq(1);
  });

  it("moves SOL into the fee vault, mints campaign tokens through the curve, and splits fees on buy", async () => {
    await program.methods
      .buy(new anchor.BN(10_000))
      .accounts({
        trader: buyer.publicKey,
        globalConfig,
        campaignState,
        feeVault,
        mint: mint.publicKey,
        traderTokenAccount: buyerTokenAccount,
        riskProfile: buyerRiskProfile,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const campaign = await program.account.campaignState.fetch(campaignState);
    const vault = await program.account.feeVault.fetch(feeVault);
    const buyerTokens = await getAccount(provider.connection, buyerTokenAccount);
    const mintState = await getMint(provider.connection, mint.publicKey);
    expect(campaign.grossBuyLamports.toNumber()).to.eq(10_000);
    expect(campaign.soldAmount.toNumber()).to.eq(73);
    expect(vault.protocolFeeLamports.toNumber()).to.eq(20);
    expect(vault.creatorFeeLamports.toNumber()).to.eq(20);
    expect(vault.recruiterFeeLamports.toNumber()).to.eq(5);
    expect(vault.squadFeeLamports.toNumber()).to.eq(5);
    expect(vault.solVaultLamports.toNumber()).to.eq(9_950);
    expect(Number(buyerTokens.amount)).to.eq(73);
    expect(Number(mintState.supply)).to.eq(73);
  });

  it("burns campaign tokens, releases curve-priced SOL from the fee vault, and splits sell fees", async () => {
    await program.methods
      .sell(new anchor.BN(25))
      .accounts({
        trader: buyer.publicKey,
        globalConfig,
        campaignState,
        feeVault,
        mint: mint.publicKey,
        traderTokenAccount: buyerTokenAccount,
        riskProfile: buyerRiskProfile,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const campaign = await program.account.campaignState.fetch(campaignState);
    const vault = await program.account.feeVault.fetch(feeVault);
    const buyerTokens = await getAccount(provider.connection, buyerTokenAccount);
    const mintState = await getMint(provider.connection, mint.publicKey);
    expect(campaign.soldAmount.toNumber()).to.eq(48);
    expect(campaign.grossSellLamports.toNumber()).to.eq(4_000);
    expect(vault.protocolFeeLamports.toNumber()).to.eq(28);
    expect(vault.creatorFeeLamports.toNumber()).to.eq(28);
    expect(vault.recruiterFeeLamports.toNumber()).to.eq(7);
    expect(vault.squadFeeLamports.toNumber()).to.eq(7);
    expect(vault.solVaultLamports.toNumber()).to.eq(5_950);
    expect(Number(buyerTokens.amount)).to.eq(48);
    expect(Number(mintState.supply)).to.eq(48);
  });

  it("lets every entitled recipient claim their fee bucket", async () => {
    await program.methods
      .claimCreatorRewards()
      .accounts({
        claimant: creator.publicKey,
        globalConfig,
        campaignState,
        feeVault,
      })
      .signers([creator])
      .rpc();

    await program.methods
      .claimRecruiterRewards()
      .accounts({
        claimant: recruiter.publicKey,
        globalConfig,
        campaignState,
        feeVault,
      })
      .signers([recruiter])
      .rpc();

    await program.methods
      .claimSquadRewards()
      .accounts({
        claimant: squadTreasury.publicKey,
        globalConfig,
        campaignState,
        feeVault,
      })
      .signers([squadTreasury])
      .rpc();

    await program.methods
      .claimProtocolRewards()
      .accounts({
        claimant: admin.publicKey,
        globalConfig,
        campaignState,
        feeVault,
      })
      .rpc();

    const vault = await program.account.feeVault.fetch(feeVault);
    expect(vault.protocolFeeLamports.toNumber()).to.eq(0);
    expect(vault.creatorFeeLamports.toNumber()).to.eq(0);
    expect(vault.recruiterFeeLamports.toNumber()).to.eq(0);
    expect(vault.squadFeeLamports.toNumber()).to.eq(0);
    expect(vault.solVaultLamports.toNumber()).to.eq(5_950);
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
          mint: mint.publicKey,
          traderTokenAccount: creatorTokenAccount,
          riskProfile: creatorRiskProfile,
          tokenProgram: TOKEN_PROGRAM_ID,
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
