import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { transform } from "esbuild";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Ed25519Program,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import * as web3 from "@solana/web3.js";

const sourceUrl = new URL("./solanaV0Transaction.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = await transform(source, {
  format: "esm",
  loader: "ts",
  target: "es2022",
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`;
const {
  SOLANA_RELEASE_MAX_BYTES,
  assertLaunchpadV0Intent,
  assertLookupTableContains,
  buildLaunchpadV0Transaction,
  inspectLaunchpadV0Envelope,
} = await import(moduleUrl);

const PROGRAM_ID = new PublicKey("3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt");
const BLOCKHASH = Keypair.generate().publicKey.toBase58();
const U64_MAX = (1n << 64n) - 1n;

function randomKeys(count) {
  return Array.from({ length: count }, () => Keypair.generate().publicKey);
}

function makeLookupTable(addresses) {
  return new AddressLookupTableAccount({
    key: Keypair.generate().publicKey,
    state: {
      deactivationSlot: U64_MAX,
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: Keypair.generate().publicKey,
      addresses,
    },
  });
}

function makeEd25519Instruction() {
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: Keypair.generate().publicKey.toBytes(),
    message: Uint8Array.from({ length: 32 }, (_, index) => index + 1),
    signature: Uint8Array.from({ length: 64 }, (_, index) => (index + 7) & 0xff),
  });
}

function legacyBytes(payer, instructions) {
  const tx = new Transaction({ feePayer: payer, recentBlockhash: BLOCKHASH }).add(...instructions);
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
}

function makeCreateFixture() {
  const payer = Keypair.generate().publicKey;
  const staticAccounts = randomKeys(8);
  const dynamicAccounts = randomKeys(5);
  const ed25519Instruction = makeEd25519Instruction();
  const programInstruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      ...staticAccounts.map((pubkey, index) => ({
        pubkey,
        isSigner: false,
        isWritable: index % 2 === 0,
      })),
      ...dynamicAccounts.map((pubkey, index) => ({
        pubkey,
        isSigner: false,
        isWritable: index % 2 === 1,
      })),
    ],
    data: Buffer.alloc(232, 0x5a),
  });
  const lookupTable = makeLookupTable(staticAccounts);
  return { payer, staticAccounts, ed25519Instruction, programInstruction, lookupTable };
}

function makeTradeFixture(extraSigner = false) {
  const payer = Keypair.generate().publicKey;
  const staticAccounts = randomKeys(10);
  const dynamicAccounts = randomKeys(8);
  const extraSignerKey = Keypair.generate().publicKey;
  const ed25519Instruction = makeEd25519Instruction();
  const programInstruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      ...staticAccounts.map((pubkey, index) => ({
        pubkey,
        isSigner: false,
        isWritable: index >= 4,
      })),
      ...dynamicAccounts.map((pubkey, index) => ({
        pubkey,
        isSigner: extraSigner && index === 0,
        isWritable: index % 2 === 0,
      })),
      ...(extraSigner ? [{ pubkey: extraSignerKey, isSigner: true, isWritable: false }] : []),
    ],
    data: Buffer.alloc(73, 0x33),
  });
  const lookupTable = makeLookupTable(staticAccounts);
  const computeInstruction = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
  return { payer, staticAccounts, ed25519Instruction, programInstruction, computeInstruction, lookupTable };
}

test("CREATE-like V0+ALT envelope stays comfortably below legacy size and preserves auth adjacency", () => {
  const fixture = makeCreateFixture();
  const instructions = [fixture.ed25519Instruction, fixture.programInstruction];
  const legacy = legacyBytes(fixture.payer, instructions);
  const transaction = buildLaunchpadV0Transaction(web3, {
    payer: fixture.payer,
    recentBlockhash: BLOCKHASH,
    instructions,
    lookupTableAccounts: [fixture.lookupTable],
  });
  const stats = assertLaunchpadV0Intent(web3, transaction, {
    payer: fixture.payer,
    ed25519Instruction: fixture.ed25519Instruction,
    programInstruction: fixture.programInstruction,
    lookupTableAccounts: [fixture.lookupTable],
  });

  assert.equal(stats.requiredSigners, 1);
  assert.equal(stats.instructionCount, 2);
  assert.ok(stats.lookupReadonlyCount + stats.lookupWritableCount >= 6);
  assert.ok(stats.serializedBytes <= SOLANA_RELEASE_MAX_BYTES);
  assert.ok(stats.serializedBytes < legacy, `${stats.serializedBytes} must be smaller than legacy ${legacy}`);
});

test("BUY/SELL-like V0+ALT envelope keeps one signer and meaningful packet headroom", () => {
  const fixture = makeTradeFixture();
  const instructions = [
    fixture.computeInstruction,
    fixture.ed25519Instruction,
    fixture.programInstruction,
  ];
  const legacy = legacyBytes(fixture.payer, instructions);
  const transaction = buildLaunchpadV0Transaction(web3, {
    payer: fixture.payer,
    recentBlockhash: BLOCKHASH,
    instructions,
    lookupTableAccounts: [fixture.lookupTable],
  });
  const stats = assertLaunchpadV0Intent(web3, transaction, {
    payer: fixture.payer,
    ed25519Instruction: fixture.ed25519Instruction,
    programInstruction: fixture.programInstruction,
    lookupTableAccounts: [fixture.lookupTable],
  });

  assert.equal(stats.requiredSigners, 1);
  assert.equal(stats.instructionCount, 3);
  assert.ok(stats.lookupReadonlyCount + stats.lookupWritableCount >= 8);
  assert.ok(stats.serializedBytes <= SOLANA_RELEASE_MAX_BYTES);
  assert.ok(legacy - stats.serializedBytes >= 150, `expected >=150 bytes saved; saved ${legacy - stats.serializedBytes}`);
});

test("wallet assertions may be appended but cannot break Ed25519 -> MemeWarzone adjacency", () => {
  const fixture = makeTradeFixture();
  const walletAssertion = new TransactionInstruction({
    programId: Keypair.generate().publicKey,
    keys: [],
    data: Buffer.from([1, 2, 3, 4]),
  });

  const safe = buildLaunchpadV0Transaction(web3, {
    payer: fixture.payer,
    recentBlockhash: BLOCKHASH,
    instructions: [
      fixture.computeInstruction,
      fixture.ed25519Instruction,
      fixture.programInstruction,
      walletAssertion,
    ],
    lookupTableAccounts: [fixture.lookupTable],
  });
  assert.doesNotThrow(() => assertLaunchpadV0Intent(web3, safe, {
    payer: fixture.payer,
    ed25519Instruction: fixture.ed25519Instruction,
    programInstruction: fixture.programInstruction,
    lookupTableAccounts: [fixture.lookupTable],
  }));

  const unsafe = buildLaunchpadV0Transaction(web3, {
    payer: fixture.payer,
    recentBlockhash: BLOCKHASH,
    instructions: [
      fixture.computeInstruction,
      fixture.ed25519Instruction,
      walletAssertion,
      fixture.programInstruction,
    ],
    lookupTableAccounts: [fixture.lookupTable],
  });
  assert.throws(() => assertLaunchpadV0Intent(web3, unsafe, {
    payer: fixture.payer,
    ed25519Instruction: fixture.ed25519Instruction,
    programInstruction: fixture.programInstruction,
    lookupTableAccounts: [fixture.lookupTable],
  }), /immediately before MemeWarzone/i);
});

test("V0 gate rejects a transaction that gains a second required signer", () => {
  const fixture = makeTradeFixture(true);
  const transaction = buildLaunchpadV0Transaction(web3, {
    payer: fixture.payer,
    recentBlockhash: BLOCKHASH,
    instructions: [fixture.computeInstruction, fixture.ed25519Instruction, fixture.programInstruction],
    lookupTableAccounts: [fixture.lookupTable],
  });
  const stats = inspectLaunchpadV0Envelope(web3, transaction, [fixture.lookupTable]);
  assert.ok(stats.requiredSigners > 1);
  assert.throws(() => assertLaunchpadV0Intent(web3, transaction, {
    payer: fixture.payer,
    ed25519Instruction: fixture.ed25519Instruction,
    programInstruction: fixture.programInstruction,
    lookupTableAccounts: [fixture.lookupTable],
    releaseMaxBytes: null,
  }), /exactly one signer/i);
});

test("ALT verification fails closed when a required static address is missing", () => {
  const addresses = randomKeys(5);
  const lookupTable = makeLookupTable(addresses);
  assert.doesNotThrow(() => assertLookupTableContains(lookupTable, addresses));
  assert.throws(
    () => assertLookupTableContains(lookupTable, [...addresses, Keypair.generate().publicKey]),
    /missing required addresses/i,
  );
});
