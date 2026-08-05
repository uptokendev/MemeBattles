/**
 * Standard X / Twitter share copy for Prepare Mode promotion pages.
 * Keep blank lines — they render as paragraph breaks in the compose box.
 */
export function buildPrepareTweetText(input: {
  name?: string | null;
  shareMessage?: string | null;
}): string {
  const name = String(input.name || "this campaign").trim() || "this campaign";
  const standard =
    `Incoming transmission from the Warzone:\n\n` +
    `${name} is preparing for war on MemeWarzone.\n\n` +
    `Follow the signal → @memewarzone`;

  const custom = String(input.shareMessage || "").trim();
  if (!custom) return standard;

  // Replace known auto-generated legacy templates so contest posts use the new standard.
  const legacyExact = new Set([
    `Incoming transmission: ${name} is preparing for war on MemeWarzone.`,
    `Incoming transmission: this draft is preparing for war on MemeWarzone.`,
    `Incoming transmission: this campaign is preparing for war on MemeWarzone.`,
    `${name} is preparing to launch on MemeWarzone.`,
  ]);
  if (legacyExact.has(custom)) return standard;
  if (/^Incoming transmission:\s/i.test(custom) && /preparing for war on MemeWarzone\.?$/i.test(custom)) {
    return standard;
  }
  if (/^Prepare Mode dossier for \$/i.test(custom)) return standard;

  return custom;
}

/** Short OG/twitter description (single line; meta tags ignore multi-line formatting). */
export function buildPrepareOgDescription(input: {
  name?: string | null;
  shareMessage?: string | null;
  description?: string | null;
}): string {
  const name = String(input.name || "this campaign").trim() || "this campaign";
  const fromShare = String(input.shareMessage || "").trim();
  if (fromShare && !/^Incoming transmission:\s/i.test(fromShare) && !/^Prepare Mode dossier/i.test(fromShare)) {
    return fromShare.slice(0, 200);
  }
  const fromDesc = String(input.description || "").trim();
  if (fromDesc) return fromDesc.slice(0, 200);
  return `Incoming transmission from the Warzone: ${name} is preparing for war on MemeWarzone. Follow @memewarzone`.slice(
    0,
    200,
  );
}
