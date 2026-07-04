import type {
  CampaignActivity,
  CampaignCardStats,
  CampaignInfo,
  CampaignMetrics,
  CampaignSummary,
  CreateCampaignParams,
  FetchCampaignPageOptions,
  LaunchpadAdapter,
  LaunchpadSafetyStatus,
  LaunchpadTxReceipt,
} from "./types";
import { getPublicRpcUrl, SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { getSolanaProvider, type SolanaProvider } from "@/lib/solanaWallet";

export const SOLANA_LAUNCHPAD_ADAPTER_ID = "solana" as const;

const PLACEHOLDER_PROGRAM_ID = "11111111111111111111111111111111";
const PROGRAM_PENDING_MESSAGE =
  "Solana launchpad actions need VITE_SOLANA_LAUNCHPAD_PROGRAM_ID set to the deployed Anchor program before create, buy, sell, graduate, and claim can run.";
const WALLET_PENDING_MESSAGE = "Connect a Solana wallet that supports transaction signing.";
const WEB3_URL = "https://esm.sh/@solana/web3.js@1.95.3?bundle";
const SPL_TOKEN_URL = "https://esm.sh/@solana/spl-token@0.4.9?bundle";
const TOKEN_PROGRAM_ID_BASE58 = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const MINT_SIZE = 82;

type SolanaRuntime = {
  web3: any;
  splToken: any;
  connection: any;
  programId: any;
  provider: SolanaProvider;
  walletPublicKey: any;
};

type CampaignAccount = {
  publicKey: any;
  creator: any;
  recruiter: any;
  squadTreasury: any;
  mint: any;
  feeVault: any;
  launchTimestamp: bigint;
  creatorBuyLockUntil: bigint;
  creatorBuyCapLamports: bigint;
  creatorBoughtLamports: bigint;
  soldAmount: bigint;
  grossBuyLamports: bigint;
  grossSellLamports: bigint;
  graduationTargetLamports: bigint;
  basePriceLamports: bigint;
  priceSlopeLamports: bigint;
  graduated: boolean;
  paused: boolean;
  buyPaused: boolean;
  sellPaused: boolean;
  graduationPaused: boolean;
  bump: number;
};

type FeeVaultAccount = {
  publicKey: any;
  campaignState: any;
  mint: any;
  solVaultLamports: bigint;
  graduationLiquidityLamports: bigint;
  protocolFeeLamports: bigint;
  creatorFeeLamports: bigint;
  recruiterFeeLamports: bigint;
  squadFeeLamports: bigint;
  bump: number;
};

function getSolanaProgramId(): string {
  return String(import.meta.env.VITE_SOLANA_LAUNCHPAD_PROGRAM_ID || "").trim();
}

function isProgramConfigured(programId = getSolanaProgramId()) {
  return Boolean(programId && programId !== PLACEHOLDER_PROGRAM_ID);
}

export function createSolanaProtocolPendingError(): Error {
  return new Error(PROGRAM_PENDING_MESSAGE);
}

function createSolanaWalletPendingError(): Error {
  return new Error(WALLET_PENDING_MESSAGE);
}

function formatSol(lamports: bigint): string {
  const sign = lamports < 0n ? "-" : "";
  const value = lamports < 0n ? -lamports : lamports;
  const whole = value / 1_000_000_000n;
  const frac = (value % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return `${sign}${whole.toString()}${frac ? `.${frac}` : ""} SOL`;
}

function toSafeU64(value: bigint | number | undefined, fallback = 0n): bigint {
  const raw = value == null ? fallback : BigInt(value);
  if (raw < 0n || raw > 18_446_744_073_709_551_615n) throw new Error("Solana launchpad amount is outside u64 range.");
  return raw;
}

function readBigUInt64LE(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true);
}

function readBigInt64LE(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset + offset, 8).getBigInt64(0, true);
}

function writeU16LE(out: number[], value: number) {
  out.push(value & 0xff, (value >> 8) & 0xff);
}

function writeU64LE(out: number[], value: bigint) {
  let next = toSafeU64(value);
  for (let i = 0; i < 8; i += 1) {
    out.push(Number(next & 0xffn));
    next >>= 8n;
  }
}

async function instructionDiscriminator(name: string): Promise<number[]> {
  const bytes = new TextEncoder().encode(`global:${name}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest.slice(0, 8));
}

async function buildData(name: string, encode?: (out: number[]) => void): Promise<Uint8Array> {
  const out = await instructionDiscriminator(name);
  encode?.(out);
  return new Uint8Array(out);
}

function pushPubkey(out: number[], publicKey: any) {
  out.push(...Array.from(publicKey.toBytes()));
}

async function loadRuntime(hasSolanaWallet?: boolean): Promise<SolanaRuntime> {
  if (!isProgramConfigured()) throw createSolanaProtocolPendingError();
  if (!hasSolanaWallet) throw createSolanaWalletPendingError();

  const provider = getSolanaProvider();
  if (!provider) throw createSolanaWalletPendingError();

  let walletAddress = provider.publicKey?.toString?.() || "";
  if (!walletAddress && provider.connect) {
    const result = await provider.connect({ onlyIfTrusted: false } as any);
    walletAddress = result?.publicKey?.toString?.() || provider.publicKey?.toString?.() || "";
  }
  if (!walletAddress) throw createSolanaWalletPendingError();

  const [web3, splToken] = await Promise.all([
    import(/* @vite-ignore */ WEB3_URL),
    import(/* @vite-ignore */ SPL_TOKEN_URL),
  ]);
  const connection = new web3.Connection(getPublicRpcUrl(SOLANA_CHAIN_ID), "confirmed");
  return {
    web3,
    splToken,
    connection,
    programId: new web3.PublicKey(getSolanaProgramId()),
    provider,
    walletPublicKey: new web3.PublicKey(walletAddress),
  };
}

function pda(web3: any, programId: any, seed: string, publicKeyOrBytes?: any): any {
  const seeds = [new TextEncoder().encode(seed)];
  if (publicKeyOrBytes) {
    seeds.push(publicKeyOrBytes.toBuffer ? publicKeyOrBytes.toBuffer() : new Uint8Array(publicKeyOrBytes));
  }
  return web3.PublicKey.findProgramAddressSync(seeds, programId)[0];
}

async function accountExists(connection: any, publicKey: any): Promise<boolean> {
  return Boolean(await connection.getAccountInfo(publicKey, "confirmed"));
}

function ix(web3: any, programId: any, keys: any[], data: Uint8Array) {
  return new web3.TransactionInstruction({ programId, keys, data });
}

function systemProgram(web3: any) {
  return web3.SystemProgram.programId;
}

function tokenProgram(web3: any) {
  return new web3.PublicKey(TOKEN_PROGRAM_ID_BASE58);
}

async function ensureRecentBlockhash(runtime: SolanaRuntime, tx: any) {
  const latest = await runtime.connection.getLatestBlockhash("confirmed");
  tx.feePayer = runtime.walletPublicKey;
  tx.recentBlockhash = latest.blockhash;
}

async function sendTransaction(runtime: SolanaRuntime, tx: any, signers: any[] = [], kind = "solana"): Promise<LaunchpadTxReceipt> {
  await ensureRecentBlockhash(runtime, tx);
  if (signers.length) tx.partialSign(...signers);

  let signature = "";
  const walletProvider = runtime.provider as any;
  if (typeof walletProvider.signAndSendTransaction === "function") {
    const result = await walletProvider.signAndSendTransaction(tx);
    signature = typeof result === "string" ? result : String(result?.signature || "");
  } else if (typeof walletProvider.signTransaction === "function") {
    const signed = await walletProvider.signTransaction(tx);
    signature = await runtime.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  } else {
    throw createSolanaWalletPendingError();
  }

  if (!signature) throw new Error("Solana wallet did not return a transaction signature.");
  const confirmation = await runtime.connection.confirmTransaction(signature, "confirmed");
  return { hash: signature, transactionHash: signature, receipt: confirmation, raw: { signature, kind } };
}

async function initializeMissingAccounts(runtime: SolanaRuntime, tx: any, opts: { creator?: any; trader?: any; zeroCluster?: boolean }) {
  const globalConfig = pda(runtime.web3, runtime.programId, "global");
  if (!(await accountExists(runtime.connection, globalConfig))) {
    tx.add(ix(runtime.web3, runtime.programId, [
      { pubkey: runtime.walletPublicKey, isSigner: true, isWritable: true },
      { pubkey: globalConfig, isSigner: false, isWritable: true },
      { pubkey: systemProgram(runtime.web3), isSigner: false, isWritable: false },
    ], await buildData("initialize_global_config", (out) => {
      pushPubkey(out, runtime.walletPublicKey);
      pushPubkey(out, runtime.walletPublicKey);
      pushPubkey(out, runtime.walletPublicKey);
      pushPubkey(out, runtime.walletPublicKey);
      writeU16LE(out, 50);
      writeU16LE(out, 250);
    })));
  }

  if (opts.creator) {
    const creatorProfile = pda(runtime.web3, runtime.programId, "creator", opts.creator);
    if (!(await accountExists(runtime.connection, creatorProfile))) {
      tx.add(ix(runtime.web3, runtime.programId, [
        { pubkey: opts.creator, isSigner: true, isWritable: true },
        { pubkey: creatorProfile, isSigner: false, isWritable: true },
        { pubkey: systemProgram(runtime.web3), isSigner: false, isWritable: false },
      ], await buildData("initialize_creator_profile")));
    }
  }

  const riskWallet = opts.trader || opts.creator;
  if (riskWallet) {
    const riskProfile = pda(runtime.web3, runtime.programId, "risk", riskWallet);
    if (!(await accountExists(runtime.connection, riskProfile))) {
      tx.add(ix(runtime.web3, runtime.programId, [
        { pubkey: runtime.walletPublicKey, isSigner: true, isWritable: true },
        { pubkey: riskWallet, isSigner: false, isWritable: false },
        { pubkey: riskProfile, isSigner: false, isWritable: true },
        { pubkey: systemProgram(runtime.web3), isSigner: false, isWritable: false },
      ], await buildData("initialize_wallet_risk")));
    }
  }

  if (opts.zeroCluster) {
    const zeroClusterId = new Uint8Array(32);
    const clusterProfile = pda(runtime.web3, runtime.programId, "cluster", zeroClusterId);
    if (!(await accountExists(runtime.connection, clusterProfile))) {
      tx.add(ix(runtime.web3, runtime.programId, [
        { pubkey: runtime.walletPublicKey, isSigner: true, isWritable: true },
        { pubkey: clusterProfile, isSigner: false, isWritable: true },
        { pubkey: systemProgram(runtime.web3), isSigner: false, isWritable: false },
      ], await buildData("initialize_cluster_profile", (out) => out.push(...Array.from(zeroClusterId)))));
    }
  }
}

function decodeCampaign(data: Uint8Array, publicKey: any, web3: any): CampaignAccount {
  let o = 8;
  const pub = () => {
    const key = new web3.PublicKey(data.slice(o, o + 32));
    o += 32;
    return key;
  };
  const u64 = () => {
    const value = readBigUInt64LE(data, o);
    o += 8;
    return value;
  };
  const i64 = () => {
    const value = readBigInt64LE(data, o);
    o += 8;
    return value;
  };
  const bool = () => Boolean(data[o++]);
  const campaign: CampaignAccount = {
    publicKey,
    creator: pub(),
    recruiter: pub(),
    squadTreasury: pub(),
    mint: pub(),
    feeVault: pub(),
    launchTimestamp: i64(),
    creatorBuyLockUntil: i64(),
    creatorBuyCapLamports: u64(),
    creatorBoughtLamports: u64(),
    soldAmount: u64(),
    grossBuyLamports: u64(),
    grossSellLamports: u64(),
    graduationTargetLamports: u64(),
    basePriceLamports: u64(),
    priceSlopeLamports: u64(),
    graduated: bool(),
    paused: bool(),
    buyPaused: bool(),
    sellPaused: bool(),
    graduationPaused: bool(),
    bump: data[o],
  };
  return campaign;
}

function decodeFeeVault(data: Uint8Array, publicKey: any, web3: any): FeeVaultAccount {
  let o = 8;
  const pub = () => {
    const key = new web3.PublicKey(data.slice(o, o + 32));
    o += 32;
    return key;
  };
  const u64 = () => {
    const value = readBigUInt64LE(data, o);
    o += 8;
    return value;
  };
  return {
    publicKey,
    campaignState: pub(),
    mint: pub(),
    solVaultLamports: u64(),
    graduationLiquidityLamports: u64(),
    protocolFeeLamports: u64(),
    creatorFeeLamports: u64(),
    recruiterFeeLamports: u64(),
    squadFeeLamports: u64(),
    bump: data[o],
  };
}

async function fetchCampaignAccount(runtime: SolanaRuntime, address: string): Promise<CampaignAccount | null> {
  if (!address) return null;
  const direct = new runtime.web3.PublicKey(address);
  let info = await runtime.connection.getAccountInfo(direct, "confirmed");
  if (info?.owner?.equals?.(runtime.programId)) return decodeCampaign(info.data, direct, runtime.web3);

  const derived = pda(runtime.web3, runtime.programId, "campaign", direct);
  info = await runtime.connection.getAccountInfo(derived, "confirmed");
  if (!info?.owner?.equals?.(runtime.programId)) return null;
  return decodeCampaign(info.data, derived, runtime.web3);
}

async function fetchFeeVaultAccount(runtime: SolanaRuntime, campaign: CampaignAccount): Promise<FeeVaultAccount | null> {
  const info = await runtime.connection.getAccountInfo(campaign.feeVault, "confirmed");
  if (!info?.owner?.equals?.(runtime.programId)) return null;
  return decodeFeeVault(info.data, campaign.feeVault, runtime.web3);
}

function mapCampaign(campaign: CampaignAccount, idx = 0): CampaignInfo {
  return {
    id: 200000 + idx,
    campaign: campaign.publicKey.toBase58(),
    token: campaign.mint.toBase58(),
    creator: campaign.creator.toBase58(),
    name: "Solana Launch",
    symbol: "SOL",
    logoURI: "/placeholder.svg",
    metadataURI: "",
    xAccount: "",
    website: "",
    extraLink: "",
    createdAt: Number(campaign.launchTimestamp || 0n) || undefined,
  };
}

function mapMetrics(campaign: CampaignAccount, vault?: FeeVaultAccount | null): CampaignMetrics {
  const currentPrice = campaign.basePriceLamports + campaign.priceSlopeLamports * campaign.soldAmount;
  return {
    sold: campaign.soldAmount,
    curveSupply: campaign.soldAmount,
    liquiditySupply: vault?.graduationLiquidityLamports ?? 0n,
    creatorReserve: campaign.creatorBuyCapLamports > campaign.creatorBoughtLamports ? campaign.creatorBuyCapLamports - campaign.creatorBoughtLamports : 0n,
    basePrice: campaign.basePriceLamports,
    priceSlope: campaign.priceSlopeLamports,
    graduationTarget: campaign.graduationTargetLamports,
    liquidityBps: 0n,
    protocolFeeBps: 0n,
    currentPrice,
    launched: campaign.graduated,
    finalizedAt: campaign.graduated ? campaign.launchTimestamp : 0n,
  };
}

function mapStats(campaign: CampaignAccount): CampaignCardStats {
  const currentPrice = campaign.basePriceLamports + campaign.priceSlopeLamports * campaign.soldAmount;
  const marketCapLamports = currentPrice * campaign.soldAmount;
  return {
    holders: "-",
    volume: formatSol(campaign.grossBuyLamports + campaign.grossSellLamports),
    marketCap: formatSol(marketCapLamports),
    marketCapBnb: Number(marketCapLamports) / 1_000_000_000,
  };
}

async function buildCreateTransaction(runtime: SolanaRuntime, params: CreateCampaignParams) {
  const tx = new runtime.web3.Transaction();
  const mint = runtime.web3.Keypair.generate();
  const campaignState = pda(runtime.web3, runtime.programId, "campaign", mint.publicKey);
  const feeVault = pda(runtime.web3, runtime.programId, "fee_vault", mint.publicKey);
  const globalConfig = pda(runtime.web3, runtime.programId, "global");
  const creatorProfile = pda(runtime.web3, runtime.programId, "creator", runtime.walletPublicKey);
  const riskProfile = pda(runtime.web3, runtime.programId, "risk", runtime.walletPublicKey);
  const zeroClusterId = new Uint8Array(32);
  const zeroClusterProfile = pda(runtime.web3, runtime.programId, "cluster", zeroClusterId);
  const recruiter = new runtime.web3.PublicKey(
    String(import.meta.env.VITE_SOLANA_DEFAULT_RECRUITER || params.lpReceiver || runtime.walletPublicKey.toBase58()),
  );
  const squadTreasury = new runtime.web3.PublicKey(
    String(import.meta.env.VITE_SOLANA_DEFAULT_SQUAD_TREASURY || params.lpReceiver || runtime.walletPublicKey.toBase58()),
  );

  await initializeMissingAccounts(runtime, tx, { creator: runtime.walletPublicKey, zeroCluster: true });

  const rent = await runtime.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  tx.add(
    runtime.web3.SystemProgram.createAccount({
      fromPubkey: runtime.walletPublicKey,
      newAccountPubkey: mint.publicKey,
      lamports: rent,
      space: MINT_SIZE,
      programId: tokenProgram(runtime.web3),
    }),
    runtime.splToken.createInitializeMintInstruction(mint.publicKey, 0, campaignState, null, tokenProgram(runtime.web3)),
    ix(runtime.web3, runtime.programId, [
      { pubkey: runtime.walletPublicKey, isSigner: true, isWritable: true },
      { pubkey: globalConfig, isSigner: false, isWritable: false },
      { pubkey: creatorProfile, isSigner: false, isWritable: true },
      { pubkey: riskProfile, isSigner: false, isWritable: false },
      { pubkey: zeroClusterProfile, isSigner: false, isWritable: false },
      { pubkey: mint.publicKey, isSigner: false, isWritable: true },
      { pubkey: campaignState, isSigner: false, isWritable: true },
      { pubkey: feeVault, isSigner: false, isWritable: true },
      { pubkey: systemProgram(runtime.web3), isSigner: false, isWritable: false },
    ], await buildData("create_campaign", (out) => {
      writeU64LE(out, toSafeU64(params.graduationTargetWei, 1_000_000_000n));
      writeU64LE(out, 250_000_000n);
      writeU64LE(out, toSafeU64(params.basePriceWei, 1_000_000n));
      writeU64LE(out, toSafeU64(params.priceSlopeWei, 1_000n));
      pushPubkey(out, recruiter);
      pushPubkey(out, squadTreasury);
    })),
  );

  return { tx, mint };
}

async function buildTradeTransaction(runtime: SolanaRuntime, campaignAddress: string, amount: bigint, side: "buy" | "sell") {
  const campaign = await fetchCampaignAccount(runtime, campaignAddress);
  if (!campaign) throw new Error("Solana campaign account was not found.");

  const tx = new runtime.web3.Transaction();
  await initializeMissingAccounts(runtime, tx, { trader: runtime.walletPublicKey });

  const traderTokenAccount = runtime.splToken.getAssociatedTokenAddressSync(campaign.mint, runtime.walletPublicKey);
  if (!(await accountExists(runtime.connection, traderTokenAccount))) {
    tx.add(runtime.splToken.createAssociatedTokenAccountInstruction(
      runtime.walletPublicKey,
      traderTokenAccount,
      runtime.walletPublicKey,
      campaign.mint,
    ));
  }

  const globalConfig = pda(runtime.web3, runtime.programId, "global");
  const riskProfile = pda(runtime.web3, runtime.programId, "risk", runtime.walletPublicKey);
  tx.add(ix(runtime.web3, runtime.programId, [
    { pubkey: runtime.walletPublicKey, isSigner: true, isWritable: true },
    { pubkey: globalConfig, isSigner: false, isWritable: false },
    { pubkey: campaign.publicKey, isSigner: false, isWritable: true },
    { pubkey: campaign.mint, isSigner: false, isWritable: true },
    { pubkey: campaign.feeVault, isSigner: false, isWritable: true },
    { pubkey: traderTokenAccount, isSigner: false, isWritable: true },
    { pubkey: riskProfile, isSigner: false, isWritable: false },
    { pubkey: tokenProgram(runtime.web3), isSigner: false, isWritable: false },
    { pubkey: systemProgram(runtime.web3), isSigner: false, isWritable: false },
  ], await buildData(side, (out) => writeU64LE(out, amount))));

  return tx;
}

async function buildGraduateTransaction(runtime: SolanaRuntime, campaignAddress: string) {
  const campaign = await fetchCampaignAccount(runtime, campaignAddress);
  if (!campaign) throw new Error("Solana campaign account was not found.");
  const tx = new runtime.web3.Transaction();
  const globalConfig = pda(runtime.web3, runtime.programId, "global");
  const creatorProfile = pda(runtime.web3, runtime.programId, "creator", campaign.creator);
  tx.add(ix(runtime.web3, runtime.programId, [
    { pubkey: runtime.walletPublicKey, isSigner: true, isWritable: false },
    { pubkey: globalConfig, isSigner: false, isWritable: false },
    { pubkey: campaign.publicKey, isSigner: false, isWritable: true },
    { pubkey: campaign.feeVault, isSigner: false, isWritable: true },
    { pubkey: creatorProfile, isSigner: false, isWritable: true },
  ], await buildData("graduate")));
  return tx;
}

async function buildClaimTransaction(runtime: SolanaRuntime, campaignAddress: string, instructionName: string) {
  const campaign = await fetchCampaignAccount(runtime, campaignAddress);
  if (!campaign) throw new Error("Solana campaign account was not found.");
  const tx = new runtime.web3.Transaction();
  const globalConfig = pda(runtime.web3, runtime.programId, "global");
  tx.add(ix(runtime.web3, runtime.programId, [
    { pubkey: runtime.walletPublicKey, isSigner: true, isWritable: true },
    { pubkey: globalConfig, isSigner: false, isWritable: false },
    { pubkey: campaign.publicKey, isSigner: false, isWritable: false },
    { pubkey: campaign.feeVault, isSigner: false, isWritable: true },
  ], await buildData(instructionName)));
  return tx;
}

export function getSolanaLaunchpadSafetyStatus(params: {
  hasSolanaWallet?: boolean;
  solanaWalletName?: string;
} = {}): LaunchpadSafetyStatus {
  const signerReady = Boolean(params.hasSolanaWallet);
  const programId = getSolanaProgramId();
  const programReady = isProgramConfigured(programId);
  const protocolReady = signerReady && programReady;
  return {
    adapterId: SOLANA_LAUNCHPAD_ADAPTER_ID,
    chainId: SOLANA_CHAIN_ID,
    chainLabel: "Solana Mainnet",
    protocolStatus: programReady ? "ready" : "protocol_pending",
    title: protocolReady ? "Solana launch route ready" : "Solana launch route pending",
    primaryActionLabel: protocolReady ? "Solana Live Route" : "Solana Program Required",
    description: protocolReady
      ? "Solana launch actions use the deployed Anchor launchpad program, derived PDAs, SPL mint/vault accounts, and the connected Solana wallet."
      : PROGRAM_PENDING_MESSAGE,
    checks: [
      {
        id: "routeAuth",
        label: "Draft authorization",
        state: "ready",
        detail: "Nonce-backed Solana draft signatures remain available for Prepare Mode.",
      },
      {
        id: "signer",
        label: "Wallet signer",
        state: signerReady ? "ready" : "pending",
        detail: signerReady ? `${params.solanaWalletName || "Solana wallet"} connected for Solana launch transactions.` : WALLET_PENDING_MESSAGE,
      },
      {
        id: "program",
        label: "Launch program",
        state: programReady ? "ready" : "blocked",
        detail: programReady ? programId : PROGRAM_PENDING_MESSAGE,
      },
      {
        id: "protocol",
        label: "Protocol adapter",
        state: programReady ? "ready" : "blocked",
        detail: programReady
          ? "Adapter derives Anchor PDAs and sends create, buy, sell, graduate, and reward claim instructions."
          : PROGRAM_PENDING_MESSAGE,
      },
    ],
    milestones: [
      {
        id: "wallets",
        label: "Wallet connect",
        state: "ready",
        detail: "Solana wallet detection and manual connection are available in the launch flow.",
      },
      {
        id: "program",
        label: "Anchor program",
        state: programReady ? "ready" : "blocked",
        detail: programReady ? "Program ID configured for frontend transaction building." : "Set VITE_SOLANA_LAUNCHPAD_PROGRAM_ID after deploy.",
      },
      {
        id: "trading",
        label: "Buy/sell/finalize",
        state: protocolReady ? "ready" : "pending",
        detail: protocolReady ? "Transactions are routed to the Anchor launchpad program." : "Waiting for wallet and deployed program configuration.",
      },
    ],
  };
}

const emptyStats: CampaignCardStats = {
  holders: "-",
  volume: "-",
  marketCap: "-",
};

export function createSolanaLaunchpadAdapter(params: {
  fetchCampaigns: () => Promise<CampaignInfo[]>;
  walletProvider: unknown;
  hasSolanaWallet?: boolean;
  solanaWalletName?: string;
  solanaAccount?: string;
}): LaunchpadAdapter {
  const protocolStatus = isProgramConfigured() ? "ready" : "protocol_pending";

  return {
    adapterId: SOLANA_LAUNCHPAD_ADAPTER_ID,
    protocolStatus,
    fetchCampaignsCount: async () => (await params.fetchCampaigns()).length,
    fetchCampaignPage: async (offset: number, limit: number, opts?: FetchCampaignPageOptions) => {
      const campaigns = await params.fetchCampaigns();
      const page = campaigns.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit));
      return opts?.newestFirst === false ? page : page.slice().reverse();
    },
    fetchCampaigns: params.fetchCampaigns,
    fetchCampaignLogoURI: async (_campaignAddress: string) => null,
    fetchCampaignMetrics: async (campaignAddress: string): Promise<CampaignMetrics | null> => {
      const runtime = await loadRuntime(params.hasSolanaWallet);
      const campaign = await fetchCampaignAccount(runtime, campaignAddress);
      if (!campaign) return null;
      const vault = await fetchFeeVaultAccount(runtime, campaign);
      return mapMetrics(campaign, vault);
    },
    fetchCampaignCardStats: async (campaign: CampaignInfo) => {
      const runtime = await loadRuntime(params.hasSolanaWallet);
      const account = await fetchCampaignAccount(runtime, campaign.campaign || campaign.token);
      return account ? mapStats(account) : emptyStats;
    },
    fetchCampaignActivity: async (campaignAddress: string): Promise<CampaignActivity | null> => {
      const runtime = await loadRuntime(params.hasSolanaWallet);
      const campaign = await fetchCampaignAccount(runtime, campaignAddress);
      if (!campaign) return null;
      return {
        buyers: 0,
        sellers: 0,
        buyVolumeWei: campaign.grossBuyLamports,
        sellVolumeWei: campaign.grossSellLamports,
        fromBlock: 0,
        toBlock: 0,
      };
    },
    fetchCampaignSummary: async (campaign: CampaignInfo): Promise<CampaignSummary> => {
      const runtime = await loadRuntime(params.hasSolanaWallet);
      const account = await fetchCampaignAccount(runtime, campaign.campaign || campaign.token);
      if (!account) return { campaign, metrics: null, stats: emptyStats };
      const vault = await fetchFeeVaultAccount(runtime, account);
      return { campaign: { ...campaign, ...mapCampaign(account) }, metrics: mapMetrics(account, vault), stats: mapStats(account) };
    },
    createCampaign: async (createParams: CreateCampaignParams) => {
      const runtime = await loadRuntime(params.hasSolanaWallet);
      const { tx, mint } = await buildCreateTransaction(runtime, createParams);
      return sendTransaction(runtime, tx, [mint], "create");
    },
    buyTokens: async (campaignAddress: string, amountLamports: bigint, _maxCostLamports: bigint) => {
      const runtime = await loadRuntime(params.hasSolanaWallet);
      const tx = await buildTradeTransaction(runtime, campaignAddress, toSafeU64(amountLamports), "buy");
      return sendTransaction(runtime, tx, [], "buy");
    },
    sellTokens: async (campaignAddress: string, tokenAmount: bigint, _minLamports: bigint) => {
      const runtime = await loadRuntime(params.hasSolanaWallet);
      const tx = await buildTradeTransaction(runtime, campaignAddress, toSafeU64(tokenAmount), "sell");
      return sendTransaction(runtime, tx, [], "sell");
    },
    finalizeCampaign: async (campaignAddress: string, _minTokens: bigint, _minBnb: bigint) => {
      const runtime = await loadRuntime(params.hasSolanaWallet);
      const tx = await buildGraduateTransaction(runtime, campaignAddress);
      return sendTransaction(runtime, tx, [], "graduate");
    },
    claimCreatorRewards: async (campaignAddress: string) => {
      const runtime = await loadRuntime(params.hasSolanaWallet);
      const tx = await buildClaimTransaction(runtime, campaignAddress, "claim_creator_rewards");
      return sendTransaction(runtime, tx, [], "claim_creator_rewards");
    },
    claimRecruiterRewards: async (campaignAddress: string) => {
      const runtime = await loadRuntime(params.hasSolanaWallet);
      const tx = await buildClaimTransaction(runtime, campaignAddress, "claim_recruiter_rewards");
      return sendTransaction(runtime, tx, [], "claim_recruiter_rewards");
    },
    claimSquadRewards: async (campaignAddress: string) => {
      const runtime = await loadRuntime(params.hasSolanaWallet);
      const tx = await buildClaimTransaction(runtime, campaignAddress, "claim_squad_rewards");
      return sendTransaction(runtime, tx, [], "claim_squad_rewards");
    },
    claimProtocolRewards: async (campaignAddress: string) => {
      const runtime = await loadRuntime(params.hasSolanaWallet);
      const tx = await buildClaimTransaction(runtime, campaignAddress, "claim_protocol_rewards");
      return sendTransaction(runtime, tx, [], "claim_protocol_rewards");
    },
    getSafetyStatus: () => getSolanaLaunchpadSafetyStatus({
      hasSolanaWallet: params.hasSolanaWallet,
      solanaWalletName: params.solanaWalletName,
    }),
    walletProvider: params.walletProvider,
    activeChainId: SOLANA_CHAIN_ID,
    factoryAddress: getSolanaProgramId(),
  } as LaunchpadAdapter;
}
