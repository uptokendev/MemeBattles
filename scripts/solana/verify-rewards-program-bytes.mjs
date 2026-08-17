#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";

const RPC = String(process.env.SOLANA_REWARDS_RPC_URL || "https://api.devnet.solana.com").trim();
const PROGRAM_ID = String(
  process.env.SOLANA_REWARDS_TREASURY_PROGRAM_ID || "2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX",
).trim();
const ARTIFACT = process.env.SOLANA_REWARDS_TREASURY_SO || "target/deploy/mwz_rewards_treasury.so";
const UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function fail(message) {
  throw new Error(`[solana-rewards-byte-proof] ${message}`);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function base58Encode(bytes) {
  if (!bytes.length) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      const value = digits[i] * 256 + carry;
      digits[i] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros += 1;
  let out = "1".repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += BASE58_ALPHABET[digits[i]];
  return out;
}

async function rpc(method, params) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: attempt, method, params }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (body.error) throw new Error(JSON.stringify(body.error));
      return body.result;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function getAccount(address) {
  const result = await rpc("getAccountInfo", [address, { encoding: "base64", commitment: "confirmed" }]);
  if (!result?.value) fail(`account is missing: ${address}`);
  const value = result.value;
  return {
    ...value,
    dataBytes: Buffer.from(value.data[0], "base64"),
  };
}

async function main() {
  if (!fs.existsSync(ARTIFACT)) fail(`missing build artifact ${ARTIFACT}`);
  const localProgram = fs.readFileSync(ARTIFACT);
  if (!localProgram.length) fail(`build artifact ${ARTIFACT} is empty`);

  const program = await getAccount(PROGRAM_ID);
  if (!program.executable) fail(`program ${PROGRAM_ID} is not executable`);
  if (program.owner !== UPGRADEABLE_LOADER) {
    fail(`program owner ${program.owner} is not ${UPGRADEABLE_LOADER}`);
  }
  if (program.dataBytes.length < 36 || program.dataBytes.readUInt32LE(0) !== 2) {
    fail("program account is not an upgradeable-loader Program state");
  }

  const programDataAddress = base58Encode(program.dataBytes.subarray(4, 36));
  const programData = await getAccount(programDataAddress);
  if (programData.owner !== UPGRADEABLE_LOADER) {
    fail(`ProgramData owner ${programData.owner} is not ${UPGRADEABLE_LOADER}`);
  }
  if (programData.dataBytes.length < 45 || programData.dataBytes.readUInt32LE(0) !== 3) {
    fail("ProgramData account is malformed or too small");
  }

  const deploymentSlot = programData.dataBytes.readBigUInt64LE(4).toString();
  const authorityOption = programData.dataBytes[12];
  let upgradeAuthority = null;
  if (authorityOption === 1) upgradeAuthority = base58Encode(programData.dataBytes.subarray(13, 45));
  else if (authorityOption !== 0) fail(`unexpected ProgramData authority option ${authorityOption}`);

  const deployedPrefix = programData.dataBytes.subarray(45, 45 + localProgram.length);
  if (deployedPrefix.length !== localProgram.length) {
    fail(`deployed program bytes are shorter than local artifact: ${deployedPrefix.length} < ${localProgram.length}`);
  }

  const localHash = sha256(localProgram);
  const deployedPrefixHash = sha256(deployedPrefix);
  if (!deployedPrefix.equals(localProgram)) {
    fail(
      `deployed rewards treasury does not match branch build: local=${localHash} deployedPrefix=${deployedPrefixHash}`,
    );
  }

  console.log(JSON.stringify({
    ok: true,
    cluster: "devnet",
    programId: PROGRAM_ID,
    programDataAddress,
    deploymentSlot,
    upgradeAuthority,
    localProgramBytes: localProgram.length,
    localSha256: localHash,
    deployedPrefixSha256: deployedPrefixHash,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
