import { expect } from "chai";

const { buildMonitoringSummary, classifyCampaignSnapshot, ratioBps } = require("../scripts/lib/monitoringSnapshot.cjs");

const BASE = {
  id: 0,
  campaign: "0x0000000000000000000000000000000000000001",
  token: "0x0000000000000000000000000000000000000002",
  creator: "0x0000000000000000000000000000000000000003",
  launched: false,
  paused: false,
  buyPaused: false,
  sellPaused: false,
  graduationPaused: false,
  requireAuthorizedTrading: false,
  sold: "100",
  curveSupply: "1000",
  nativeBalance: "10",
  nativeTarget: "100",
  dexPair: "0x0000000000000000000000000000000000000000",
};

describe("monitoring snapshot classifier", function () {
  it("calculates capped basis-point ratios", async () => {
    expect(ratioBps(50n, 100n)).to.eq(5_000n);
    expect(ratioBps(101n, 100n)).to.eq(10_000n);
    expect(ratioBps(1n, 0n)).to.eq(0n);
  });

  it("classifies ordinary bonding and near-graduation campaigns", async () => {
    const bonding = classifyCampaignSnapshot(BASE);
    const nearBySold = classifyCampaignSnapshot({ ...BASE, sold: "950", nativeBalance: "10" });
    const nearByNative = classifyCampaignSnapshot({ ...BASE, sold: "100", nativeBalance: "95" });

    expect(bonding.status).to.eq("bonding");
    expect(bonding.soldBps).to.eq("1000");
    expect(bonding.nativeProgressBps).to.eq("1000");
    expect(bonding.remainingNativeToTarget).to.eq("90");
    expect(nearBySold.status).to.eq("near-graduation");
    expect(nearByNative.status).to.eq("near-graduation");
  });

  it("marks campaigns ready to graduate when native target is reached", async () => {
    const ready = classifyCampaignSnapshot({ ...BASE, nativeBalance: "100" });

    expect(ready.status).to.eq("ready-to-graduate");
    expect(ready.remainingNativeToTarget).to.eq("0");
  });

  it("flags paused and authorization-only campaigns for operator attention", async () => {
    const blocked = classifyCampaignSnapshot({
      ...BASE,
      paused: true,
      buyPaused: true,
      sellPaused: true,
      graduationPaused: true,
      requireAuthorizedTrading: true,
    });

    expect(blocked.status).to.eq("blocked");
    expect(blocked.alerts).to.deep.eq([
      "campaign paused",
      "graduation paused",
      "buys paused",
      "sells paused",
      "authorized trading required",
    ]);
  });

  it("flags sellout campaigns that cannot reach graduation", async () => {
    const stalled = classifyCampaignSnapshot({ ...BASE, sold: "1000", nativeBalance: "99" });

    expect(stalled.status).to.eq("cannot-graduate-at-sellout");
    expect(stalled.alerts).to.deep.eq(["curve supply sold out before native graduation target"]);
  });

  it("classifies graduated campaigns and missing DEX pair anomalies", async () => {
    const graduated = classifyCampaignSnapshot({
      ...BASE,
      launched: true,
      dexPair: "0x0000000000000000000000000000000000000004",
    });
    const missingPair = classifyCampaignSnapshot({ ...BASE, launched: true });

    expect(graduated.status).to.eq("graduated");
    expect(missingPair.status).to.eq("graduated-missing-pair");
    expect(missingPair.alerts).to.deep.eq(["graduated campaign has no recorded DEX pair"]);
  });

  it("surfaces oracle errors before normal readiness states", async () => {
    const oracleError = classifyCampaignSnapshot({ ...BASE, nativeBalance: "100", oracleError: "StalePrice" });

    expect(oracleError.status).to.eq("oracle-error");
    expect(oracleError.alerts).to.deep.eq(["oracle: StalePrice"]);
  });

  it("summarizes campaigns needing operator attention", async () => {
    const classified = [
      classifyCampaignSnapshot(BASE),
      classifyCampaignSnapshot({ ...BASE, id: 1, nativeBalance: "100" }),
      classifyCampaignSnapshot({ ...BASE, id: 2, paused: true }),
      classifyCampaignSnapshot({ ...BASE, id: 3, launched: true, dexPair: "0x0000000000000000000000000000000000000004" }),
    ];
    const summary = buildMonitoringSummary(classified);

    expect(summary.totalCampaigns).to.eq(4);
    expect(summary.counts).to.deep.eq({ bonding: 1, "ready-to-graduate": 1, blocked: 1, graduated: 1 });
    expect(summary.attentionCount).to.eq(2);
    expect(summary.attention.map((entry: { id: number }) => entry.id)).to.deep.eq([1, 2]);
  });
});
