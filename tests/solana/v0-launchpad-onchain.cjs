"use strict";

const assert = require("assert");
const {
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");
const web3 = require("@solana/web3.js");
const { AnchorProvider } = require("@coral-xyz/anchor");

async function loadV0() {
  const { loadSolanaV0Module } = await import("../../frontend/scripts/load-solana-v0-module.mjs");
  return loadSolanaV0Module();
}

async function sendLegacy(connection, payer, ixs) {
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: latest.blockhash }).add(...ixs);
  tx.sign(payer);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  const confirmation = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (confirmation.value.err) throw new Error(JSON.stringify(confirmation.value.err));
}

describe("shared V0/ALT launchpad helper on local validator", function () {
  this.timeout(180_000);

  it("creates a static launchpad ALT and compiles CREATE/BUY through the shared helper", async function () {
    const v0 = await loadV0();
    const provider = AnchorProvider.env();
    const connection = provider.connection;
    const payer = provider.wallet.payer;
    assert.ok(payer?.secretKey, "local validator wallet must be a Keypair");

    const plan = v0.buildLaunchpadAltPlan(web3);
    const slot = await connection.getSlot("confirmed");
    const [createIx, lookupTable] = AddressLookupTableProgram.createLookupTable({
      authority: payer.publicKey,
      payer: payer.publicKey,
      recentSlot: Math.max(0, slot - 1),
    });
    await sendLegacy(connection, payer, [createIx]);
    for (let i = 0; i < plan.length; i += 20) {
      await sendLegacy(connection, payer, [
        AddressLookupTableProgram.extendLookupTable({
          payer: payer.publicKey,
          authority: payer.publicKey,
          lookupTable,
          addresses: plan.slice(i, i + 20).map((entry) => entry.address),
        }),
      ]);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const table = await v0.fetchAndVerifyLaunchpadLookupTable(web3, connection, {
      address: lookupTable.toBase58(),
      requiredAddresses: plan.map((entry) => entry.address),
      expectedAuthority: payer.publicKey,
    });

    const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: Keypair.generate().publicKey.toBytes(),
      message: Uint8Array.from({ length: 32 }, (_, index) => index + 1),
      signature: Uint8Array.from({ length: 64 }, (_, index) => (index + 9) & 0xff),
    });
    const programId = new PublicKey(v0.SOLANA_LAUNCHPAD_PROGRAM_ID);
    const createInstruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        ...plan.slice(0, 8).map((entry, index) => ({
          pubkey: entry.address,
          isSigner: false,
          isWritable: index === 0,
        })),
      ],
      data: Buffer.alloc(232, 0x5a),
    });
    const tradeInstruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        ...plan.map((entry, index) => ({
          pubkey: entry.address,
          isSigner: false,
          isWritable: index >= 9,
        })),
      ],
      data: Buffer.alloc(73, 0x33),
    });

    const latest = await connection.getLatestBlockhash("confirmed");
    const createV0 = v0.compileAndAssertLaunchpadV0(
      web3,
      {
        payer: payer.publicKey,
        recentBlockhash: latest.blockhash,
        instructions: [ed25519Instruction, createInstruction],
        lookupTableAccounts: [table],
      },
      { payer: payer.publicKey, ed25519Instruction, programInstruction: createInstruction },
    );
    const tradeV0 = v0.compileAndAssertLaunchpadV0(
      web3,
      {
        payer: payer.publicKey,
        recentBlockhash: latest.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          ed25519Instruction,
          tradeInstruction,
        ],
        lookupTableAccounts: [table],
      },
      { payer: payer.publicKey, ed25519Instruction, programInstruction: tradeInstruction },
    );

    console.info("[v0-onchain] CREATE", createV0.stats);
    console.info("[v0-onchain] BUY/SELL", tradeV0.stats);
    assert.equal(createV0.stats.requiredSigners, 1);
    assert.equal(tradeV0.stats.requiredSigners, 1);
    assert.ok(createV0.stats.serializedBytes <= v0.SOLANA_RELEASE_MAX_BYTES);
    assert.ok(tradeV0.stats.serializedBytes <= v0.SOLANA_RELEASE_MAX_BYTES);

    const createSim = await v0.simulateLaunchpadV0Transaction(connection, createV0.transaction);
    const tradeSim = await v0.simulateLaunchpadV0Transaction(connection, tradeV0.transaction);
    const createLogs = (createSim.value.logs || []).join("\n");
    const tradeLogs = (tradeSim.value.logs || []).join("\n");
    assert.equal(/Access violation|stack frame|Program failed to complete/i.test(createLogs), false, createLogs);
    assert.equal(/Access violation|stack frame|Program failed to complete/i.test(tradeLogs), false, tradeLogs);
  });
});
