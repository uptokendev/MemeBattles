import assert from "node:assert/strict";
import test from "node:test";

import { detectEvidenceType, safeEvidenceFilename } from "./abuseEvidence.js";

test("accepts real image and PDF signatures", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
  const pdf = Buffer.from("%PDF-1.7\n%");

  assert.equal(detectEvidenceType(jpeg, "image/jpeg")?.mime, "image/jpeg");
  assert.equal(detectEvidenceType(png, "image/png")?.mime, "image/png");
  assert.equal(detectEvidenceType(webp, "image/webp")?.mime, "image/webp");
  assert.equal(detectEvidenceType(pdf, "application/pdf")?.mime, "application/pdf");
});

test("rejects a fake jpg that is actually executable data", () => {
  const fake = Buffer.from("MZ\x90\x00this is not a jpeg");
  assert.equal(detectEvidenceType(fake, "image/jpeg"), null);
  assert.equal(detectEvidenceType(Buffer.from("hello"), "application/pdf"), null);
});

test("strips path characters from evidence names", () => {
  assert.equal(safeEvidenceFilename("../../etc/passwd", "png"), "passwd.png");
  assert.equal(safeEvidenceFilename("Patrick proof scammer.png", "png"), "Patrick-proof-scammer.png");
});
