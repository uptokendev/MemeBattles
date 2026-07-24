import assert from "node:assert/strict";
import test from "node:test";

import { initialPromotionFromCreateInput } from "./drafts.js";

test("seeds promotion social fields inside the signed draft creation request", () => {
  const promotion = initialPromotionFromCreateInput(
    "draft-id",
    {
      websiteUrl: "https://memewar.zone",
      xUrl: "https://x.com/memewarzone",
      telegramUrl: "https://t.me/memewarzone",
      discordUrl: "https://discord.gg/memewarzone",
      docs: ["https://docs.memewar.zone"],
    },
    "2026-07-24T00:00:00.000Z",
  );

  assert.equal(promotion.draftId, "draft-id");
  assert.equal(promotion.websiteUrl, "https://memewar.zone/");
  assert.equal(promotion.xUrl, "https://x.com/memewarzone");
  assert.equal(promotion.telegramUrl, "https://t.me/memewarzone");
  assert.equal(promotion.discordUrl, "https://discord.gg/memewarzone");
  assert.deepEqual(promotion.docs, ["https://docs.memewar.zone"]);
  assert.equal(promotion.createdAt, "2026-07-24T00:00:00.000Z");
});
