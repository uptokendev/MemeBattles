import test from "node:test";
import assert from "node:assert/strict";

import {
  augmentDraftLifecycle,
  canonicalDraftTimestamps,
} from "./scheduled-lifecycle.js";

const draftCreatedAt = "2026-07-20T10:00:00.000Z";
const contractDeployedAt = "2026-07-28T10:00:00.000Z";

test("scheduled drafts preserve draft age while exposing all lifecycle clocks", () => {
  const scheduledLaunchAt = new Date(Date.now() + 60_000).toISOString();
  const draft = augmentDraftLifecycle(
    {
      id: "draft-1",
      status: "scheduled",
      campaignAddress: "0x0000000000000000000000000000000000000001",
      createdAt: draftCreatedAt,
      deployedAt: contractDeployedAt,
    },
    { created_at: draftCreatedAt, deployed_at: contractDeployedAt, scheduled_launch_at: scheduledLaunchAt },
  );

  assert.equal(draft.status, "scheduled");
  assert.equal(draft.createdAt, draftCreatedAt);
  assert.equal(draft.draftCreatedAt, draftCreatedAt);
  assert.equal(draft.contractDeployedAt, contractDeployedAt);
  assert.equal(draft.scheduledLaunchAt, scheduledLaunchAt);
  assert.equal(draft.tradingLaunchAt, scheduledLaunchAt);
});

test("a due scheduled draft transitions to deployed without changing draft creation time", () => {
  const scheduledLaunchAt = new Date(Date.now() - 60_000).toISOString();
  const draft = augmentDraftLifecycle(
    {
      id: "draft-2",
      status: "scheduled",
      campaignAddress: "0x0000000000000000000000000000000000000002",
      createdAt: draftCreatedAt,
      deployedAt: contractDeployedAt,
    },
    { created_at: draftCreatedAt, deployed_at: contractDeployedAt, scheduled_launch_at: scheduledLaunchAt },
  );

  assert.equal(draft.status, "deployed");
  assert.equal(draft.draftCreatedAt, draftCreatedAt);
  assert.equal(draft.contractDeployedAt, contractDeployedAt);
  assert.equal(draft.tradingLaunchAt, scheduledLaunchAt);
});

test("immediate campaigns use contract deployment as the trading launch time", () => {
  const timestamps = canonicalDraftTimestamps(
    { createdAt: draftCreatedAt, deployedAt: contractDeployedAt },
    null,
  );

  assert.equal(timestamps.draftCreatedAt, draftCreatedAt);
  assert.equal(timestamps.contractDeployedAt, contractDeployedAt);
  assert.equal(timestamps.scheduledLaunchAt, null);
  assert.equal(timestamps.tradingLaunchAt, contractDeployedAt);
});
