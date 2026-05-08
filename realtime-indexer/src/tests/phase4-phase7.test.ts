import test from "node:test";
import assert from "node:assert/strict";
import { buildAirdropDrawPlan } from "../rewards/airdrops.js";
import { evaluateTraderAirdropProgram } from "../rewards/eligibility.js";
import { computeSquadAllocationModel } from "../rewards/squads.js";
import { runPhase7SyntheticSimulation } from "../rewards/phase7Simulation.js";

const BNB = 10n ** 18n;

test("airdrop draw replay is deterministic and weighted", () => {
  const candidates = [
    { walletAddress: "0x1111111111111111111111111111111111111111", score: 15n * BNB, metadata: {} },
    { walletAddress: "0x2222222222222222222222222222222222222222", score: 10n * BNB, metadata: {} },
    { walletAddress: "0x3333333333333333333333333333333333333333", score: 5n * BNB, metadata: {} },
  ];

  const planA = buildAirdropDrawPlan({
    poolAmount: 2n * BNB,
    candidates,
    seed: "phase4-draw-seed",
    winnerCountOverride: 2,
  });
  const planB = buildAirdropDrawPlan({
    poolAmount: 2n * BNB,
    candidates,
    seed: "phase4-draw-seed",
    winnerCountOverride: 2,
  });

  assert.deepEqual(planA, planB);
  assert.equal(planA.winners.length, 2);
  assert.ok(planA.winners.every((winner) => winner.weightTier >= 1));
});

test("airdrop eligibility applies recruiter, cooldown, battle league, and abuse rules", () => {
  const walletAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const result = evaluateTraderAirdropProgram({
    walletAddress,
    tradeMetrics: {
      tradeVolumeRaw: 6n * BNB,
      tradeCount: 4,
      activeDays: 2,
      ownCampaignTradeCount: 0,
    },
    recruiterByWallet: new Map([[walletAddress, { id: 1, code: "og-alpha", status: "active", isOg: true }]]),
    flagsByWallet: new Map([[
      walletAddress,
      [{
        id: 1,
        walletAddress,
        epochId: 1,
        program: "airdrop_trader",
        flagType: "WALLET_SPLITTING",
        severity: "review",
        detailsJson: {},
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
        metadata: {},
        updatedAt: new Date().toISOString(),
      }],
    ]]),
    recentAirdropWinnerWallets: new Set([walletAddress]),
    activeBattleLeagueWinnerWallets: new Set([walletAddress]),
  });

  assert.equal(result.isEligible, false);
  assert.ok(result.reasonCodes.includes("RECRUITER_DIRECT_WIN_EXCLUDED"));
  assert.ok(result.reasonCodes.includes("REPEAT_WINNER_COOLDOWN"));
  assert.ok(result.reasonCodes.includes("BATTLE_LEAGUE_ACTIVE_WINNER"));
  assert.ok(result.reasonCodes.includes("REVIEW_REQUIRED"));
});

test("squad allocation applies global caps, member caps, and deterministic carryover", () => {
  const members = [
    {
      walletAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb01",
      recruiterId: 1,
      recruiterCode: "alpha",
      recruiterDisplayName: "Alpha",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 100n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb02",
      recruiterId: 1,
      recruiterCode: "alpha",
      recruiterDisplayName: "Alpha",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 10n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xcccccccccccccccccccccccccccccccccccccc01",
      recruiterId: 2,
      recruiterCode: "bravo",
      recruiterDisplayName: "Bravo",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 80n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xdddddddddddddddddddddddddddddddddddddd01",
      recruiterId: 3,
      recruiterCode: "charlie",
      recruiterDisplayName: "Charlie",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 70n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee01",
      recruiterId: 4,
      recruiterCode: "delta",
      recruiterDisplayName: "Delta",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 60n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xfffffffffffffffffffffffffffffffffffffff1",
      recruiterId: 5,
      recruiterCode: "echo",
      recruiterDisplayName: "Echo",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 50n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xfffffffffffffffffffffffffffffffffffffff2",
      recruiterId: 6,
      recruiterCode: "foxtrot",
      recruiterDisplayName: "Foxtrot",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 40n * BNB,
      createdAt: null,
      updatedAt: null,
    },
    {
      walletAddress: "0xfffffffffffffffffffffffffffffffffffffff3",
      recruiterId: 7,
      recruiterCode: "golf",
      recruiterDisplayName: "Golf",
      recruiterStatus: "active",
      recruiterIsOg: false,
      isEligible: true,
      reasonCodes: [],
      score: 30n * BNB,
      createdAt: null,
      updatedAt: null,
    },
  ];

  const model = computeSquadAllocationModel(140n * BNB, members);
  const globalCap = (140n * BNB * 1500n) / 10000n;

  assert.ok(model.squads.every((squad) => squad.estimatedAllocationAmount <= globalCap));
  assert.ok(
    model.squads.every((squad) =>
      squad.members.every((member) => member.memberCapAmount === 0n || member.estimatedPayoutAmount <= member.memberCapAmount),
    ),
  );
  assert.ok(model.carryoverAmount >= 0n);
});

test("phase 7 synthetic simulation stays green across launch scenarios", () => {
  const result = runPhase7SyntheticSimulation();
  for (const [check, passed] of Object.entries(result.checks)) {
    assert.equal(passed, true, `Expected ${check} to pass`);
  }
});
