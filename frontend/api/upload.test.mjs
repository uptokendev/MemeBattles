import assert from "node:assert/strict";
import test from "node:test";

import { buildUploadObjectName } from "./upload.js";

test("builds a Solana logo storage path with the parsed chain id", () => {
  assert.equal(
    buildUploadObjectName({
      kind: "logo",
      chainId: 101,
      address: "HuKfoFUuWxC5qFZXzr5dbaX4S7w4vJUW8AHV9LD4C2J9",
      uuid: "upload-id",
      ext: "png",
    }),
    "logos/101/upload-id.png",
  );
});

test("preserves a case-sensitive Solana address in avatar storage paths", () => {
  const address = "HuKfoFUuWxC5qFZXzr5dbaX4S7w4vJUW8AHV9LD4C2J9";
  assert.equal(
    buildUploadObjectName({
      kind: "avatar",
      chainId: 101,
      address,
      uuid: "upload-id",
      ext: "webp",
    }),
    `avatars/101/${address}/upload-id.webp`,
  );
});
