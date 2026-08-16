import assert from "node:assert/strict";
import test from "node:test";

function parseRawAmount(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw || raw === "0") return 0n;
  const intish = raw.match(/^(\d+)(?:\.0+)?$/);
  if (intish) return BigInt(intish[1]);
  return 0n;
}

function maxPlausibleScaled(decimals) {
  if (decimals <= 6) return 10n ** 15n;
  if (decimals <= 9) return 10n ** 12n;
  return 10n ** 24n;
}

function parseHumanAmountToRaw(value, decimals) {
  const text = String(value ?? "").trim();
  if (!text || text === "0") return 0n;
  if (/^\d+$/.test(text)) {
    const asInt = BigInt(text);
    const scale = 10n ** BigInt(Math.max(0, decimals));
    if (asInt * scale > maxPlausibleScaled(decimals)) return asInt;
    return asInt * scale;
  }
  const [whole, frac = ""] = text.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

function parseRawOrHumanAmount(rawValue, humanValue, decimals) {
  const rawText = String(rawValue ?? "").trim();
  if (rawText !== "") {
    const parsed = parseRawAmount(rawText);
    if (parsed > 0n || /^0+(?:\.0+)?$/.test(rawText)) return parsed;
  }
  return parseHumanAmountToRaw(humanValue, decimals);
}

test("Solana 0.01 SOL stays 10_000_000 lamports", () => {
  assert.equal(parseRawOrHumanAmount("10000000", "0.01", 9), 10_000_000n);
  assert.equal(parseRawOrHumanAmount("10000000.000000", null, 9), 10_000_000n);
  assert.equal(parseRawOrHumanAmount(null, "0.01", 9), 10_000_000n);
  // Human column accidentally holds lamports
  assert.equal(parseRawOrHumanAmount(null, "10000000", 9), 10_000_000n);
});

test("Solana 1.45M tokens is not 1.45T", () => {
  assert.equal(parseRawOrHumanAmount("1450000000000", "1450000", 6), 1_450_000_000_000n);
  assert.equal(parseRawOrHumanAmount(null, "1450000", 6), 1_450_000_000_000n);
  assert.equal(parseRawOrHumanAmount(null, "1450000000000", 6), 1_450_000_000_000n);
});

test("EVM 1 BNB human and wei raw both work", () => {
  assert.equal(parseRawOrHumanAmount("1000000000000000000", "1", 18), 10n ** 18n);
  assert.equal(parseRawOrHumanAmount(null, "1", 18), 10n ** 18n);
});
