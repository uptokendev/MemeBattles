/**
 * Print Railway create-auth env vars from on-chain active generation + local artifacts.
 * Run after every program upgrade or generation switch, then paste into Railway.
 *
 *   npm --prefix tests/solana run print:railway-create-auth
 *   # or
 *   node tests/solana/print-railway-create-auth-env.cjs
 */
const anchor = require("@coral-xyz/anchor");
const { AnchorProvider, Program, Wallet } = anchor;
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const SECRETS =
  process.env.SOLANA_OPERATOR_KEYPAIR ||
  `${process.env.HOME}/.config/memewarzone/solana-devnet/deployer.json`;

function loadKeypair(p) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

async function main() {
  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const programId = new PublicKey(
    process.env.SOLANA_LAUNCHPAD_PROGRAM_ID || "3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt",
  );
  const idlPath = path.join(ROOT, "target/idl/memewarzone_solana.json");
  const soPath = path.join(ROOT, "target/deploy/memewarzone_solana.so");
  if (!fs.existsSync(idlPath)) throw new Error(`Missing IDL: ${idlPath} (run anchor build)`);

  const operator = loadKeypair(SECRETS);
  const provider = new AnchorProvider(new Connection(rpc, "confirmed"), new Wallet(operator), {
    commitment: "confirmed",
  });
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new Program(idl, provider);

  const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from("global")], programId);
  const global = await program.account.globalConfig.fetch(globalConfig);
  const activeId = Buffer.from(global.activeGenerationId);
  const [generationConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("generation"), activeId],
    programId,
  );
  const gen = await program.account.generationConfig.fetch(generationConfig);
  const manifestHash = Buffer.from(gen.manifestHash).toString("hex");

  const idlSha = crypto.createHash("sha256").update(fs.readFileSync(idlPath)).digest("hex");
  let programSha = "(build target/deploy/memewarzone_solana.so first)";
  if (fs.existsSync(soPath)) {
    programSha = crypto.createHash("sha256").update(fs.readFileSync(soPath)).digest("hex");
  }

  const route =
    process.env.SOLANA_ROUTE_SIGNER_PUBLIC_KEY ||
    (() => {
      try {
        return require("child_process")
          .execSync(
            `solana-keygen pubkey ${process.env.HOME}/.config/memewarzone/solana-devnet/route-signer.json`,
          )
          .toString()
          .trim();
      } catch {
        return "<set SOLANA_ROUTE_SIGNER_PUBLIC_KEY>";
      }
    })();

  console.log("# Railway create-auth (from on-chain active generation) — paste into API service");
  console.log(`# generationConfig ${generationConfig.toBase58()}`);
  console.log(`# economicsVersion ${gen.economicsVersion}`);
  console.log(`# basePrice ${gen.basePriceLamports.toString()} slope ${gen.priceSlopeLamports.toString()} supply ${gen.tokenTotalSupply.toString()}`);
  console.log("");
  console.log("SOLANA_CREATE_AUTH_ENABLED=true");
  console.log("SOLANA_TRADE_AUTH_ENABLED=true");
  console.log("DRAFT_PUSH_LIVE_ENABLED=true");
  console.log(`SOLANA_RPC_URL=${rpc}`);
  console.log(`SOLANA_LAUNCHPAD_PROGRAM_ID=${programId.toBase58()}`);
  console.log(`SOLANA_ROUTE_SIGNER_PUBLIC_KEY=${route}`);
  console.log("# SOLANA_ROUTE_SIGNER_SECRET_KEY=<keep existing secret>");
  console.log(`SOLANA_GENERATION_MANIFEST_HASH=${manifestHash}`);
  console.log(`SOLANA_LAUNCHPAD_PROGRAM_SHA256=${programSha}`);
  console.log(`SOLANA_LAUNCHPAD_IDL_SHA256=${idlSha}`);
  console.log("");
  console.log("# After setting vars: redeploy Railway API, then Direct deploy a NEW mint.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
