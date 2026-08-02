import assert from "node:assert/strict";
import test from "node:test";
import {
  graduationLogChunkRanges,
  graduationLogSearchWindow,
} from "../graduationSearch.js";

test("unknown created_block never uses factory-scale lookback", () => {
  const window = graduationLogSearchWindow({
    finalizedHead: 122_700_000,
    createdBlock: 0,
    graduatedBlock: null,
    lookbackBlocks: 20_000,
    unknownCreatedLookbackBlocks: 12_000,
    logChunkSize: 2_000,
  });
  assert.equal(window.mode, "recent_unknown_created");
  assert.equal(window.fromBlock, 122_700_000 - 12_000);
  assert.equal(window.toBlock, 122_700_000);
  assert.ok(window.estimatedChunks <= 10);
  // Must not open a 250k window.
  assert.ok(window.toBlock - window.fromBlock <= 12_000);
});

test("known created_block uses max(created, head-lookback) not full life", () => {
  const window = graduationLogSearchWindow({
    finalizedHead: 122_700_000,
    createdBlock: 100_000_000, // ancient create
    graduatedBlock: null,
    lookbackBlocks: 20_000,
    unknownCreatedLookbackBlocks: 12_000,
    logChunkSize: 2_000,
  });
  assert.equal(window.mode, "created_and_recent");
  assert.equal(window.fromBlock, 122_700_000 - 20_000);
  assert.equal(window.toBlock, 122_700_000);
  assert.ok(window.toBlock - window.fromBlock <= 20_000);
});

test("recent create starts at created_block not head-lookback", () => {
  const window = graduationLogSearchWindow({
    finalizedHead: 122_700_000,
    createdBlock: 122_695_000,
    graduatedBlock: null,
    lookbackBlocks: 20_000,
    unknownCreatedLookbackBlocks: 12_000,
    logChunkSize: 2_000,
  });
  assert.equal(window.fromBlock, 122_695_000);
  assert.equal(window.toBlock, 122_700_000);
});

test("known graduated_block is exact ±1", () => {
  const window = graduationLogSearchWindow({
    finalizedHead: 122_700_000,
    createdBlock: 0,
    graduatedBlock: 122_650_000,
    lookbackBlocks: 20_000,
    unknownCreatedLookbackBlocks: 12_000,
    logChunkSize: 2_000,
  });
  assert.equal(window.mode, "exact_graduated_block");
  assert.equal(window.fromBlock, 122_649_999);
  assert.equal(window.toBlock, 122_650_001);
  assert.equal(window.estimatedChunks, 1);
});

test("chunk ranges walk newest-first and cover full span", () => {
  const ranges = [...graduationLogChunkRanges(100, 250, 100)];
  assert.deepEqual(ranges, [
    { start: 151, end: 250 },
    { start: 100, end: 150 },
  ]);
});
