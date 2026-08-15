#!/usr/bin/env node
/**
 * Convert a base58 Solana private key (Phantom-style export) into a CLI keypair JSON file.
 *
 * Usage (interactive — paste key when prompted, not in chat):
 *   node scripts/solana/private-key-to-keypair.mjs
 *
 * Or pipe (still local only):
 *   node scripts/solana/private-key-to-keypair.mjs --outfile ~/.config/memewarzone/solana-devnet/deployer.json
 *
 * Never commit the outfile. Never paste the private key into chat/git.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { Keypair } = require(path.join(root, "tests/solana/node_modules/@solana/web3.js"));

// Minimal base58 decode (Bitcoin alphabet) — avoids extra deps
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(str) {
  const bytes = [0];
  for (const c of str.trim()) {
    const val = ALPHABET.indexOf(c);
    if (val < 0) throw new Error("Invalid base58 character in private key");
    let carry = val;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // leading zeros
  for (const c of str.trim()) {
    if (c !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

function parseArgs(argv) {
  let outfile = path.join(
    process.env.HOME || "",
    ".config/memewarzone/solana-devnet/deployer.json"
  );
  let expect = process.env.EXPECT_PUBKEY || "";
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--outfile" && argv[i + 1]) outfile = argv[++i];
    else if (argv[i] === "--expect" && argv[i + 1]) expect = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(`Usage: node private-key-to-keypair.mjs [--outfile PATH] [--expect PUBKEY]`);
      process.exit(0);
    }
  }
  return { outfile, expect };
}

function keypairFromSecretInput(raw) {
  const s = raw.trim().replace(/^\[/, "").replace(/\]$/, "").trim();

  // JSON byte array: [1,2,3,...,64]
  if (s.includes(",")) {
    const arr = JSON.parse(s.startsWith("[") ? s : `[${s}]`);
    if (!Array.isArray(arr)) throw new Error("Expected JSON array of bytes");
    const secret = Uint8Array.from(arr);
    if (secret.length === 64) return Keypair.fromSecretKey(secret);
    if (secret.length === 32) return Keypair.fromSeed(secret);
    throw new Error(`Byte array length must be 32 or 64, got ${secret.length}`);
  }

  // base58 secret (Phantom export)
  const decoded = decodeBase58(s);
  if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
  if (decoded.length === 32) return Keypair.fromSeed(decoded);
  throw new Error(
    `Decoded key length must be 32 or 64 bytes, got ${decoded.length}. ` +
      `If this is a seed phrase (12/24 words), use: solana-keygen recover ASK -o <file>`
  );
}

async function readSecret() {
  if (!process.stdin.isTTY) {
    // piped input
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return Buffer.concat(chunks).toString("utf8");
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      "Paste private key (base58 or [byte,array]), then Enter.\n" +
        "Input is only used locally. Do not share it.\n> ",
      (answer) => {
        rl.close();
        resolve(answer);
      }
    );
  });
}

const { outfile, expect } = parseArgs(process.argv);
const raw = await readSecret();
if (!raw || !raw.trim()) {
  console.error("No key provided.");
  process.exit(1);
}

const kp = keypairFromSecretInput(raw);
const pubkey = kp.publicKey.toBase58();
const secretArr = Array.from(kp.secretKey);

fs.mkdirSync(path.dirname(outfile), { recursive: true });
fs.writeFileSync(outfile, JSON.stringify(secretArr), { mode: 0o600 });
fs.chmodSync(outfile, 0o600);

console.log("");
console.log("Wrote keypair file:", outfile);
console.log("Public key:       ", pubkey);
if (expect) {
  if (pubkey === expect) console.log("Match: YES — matches expected address");
  else {
    console.error("Match: NO — expected", expect);
    process.exit(2);
  }
}
console.log("");
console.log("Next:");
console.log(`  solana-keygen pubkey ${outfile}`);
console.log(`  solana config set --url https://api.devnet.solana.com --keypair ${outfile}`);
console.log(`  solana balance`);
