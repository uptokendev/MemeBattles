export type SocialLinkKind = "x" | "telegram" | "discord" | "website" | "other";

function stripCommonSocialPrefix(value: string, kind: SocialLinkKind) {
  let cleaned = value.trim();

  cleaned = cleaned.replace(/^@+/, "").replace(/^\/+/, "");

  if (kind === "x") {
    cleaned = cleaned
      .replace(/^https?:\/\/(www\.)?/i, "")
      .replace(/^(twitter\.com|x\.com)\//i, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0];
  }

  if (kind === "telegram") {
    cleaned = cleaned
      .replace(/^https?:\/\/(www\.)?/i, "")
      .replace(/^(t\.me|telegram\.me|telegram\.dog)\//i, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0];
  }

  return cleaned;
}

export function normalizeSocialUrl(raw: string | null | undefined, kind: SocialLinkKind) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  if (kind === "x") {
    const handle = stripCommonSocialPrefix(value, "x");
    return handle ? `https://x.com/${handle}` : "";
  }

  if (kind === "telegram") {
    const handle = stripCommonSocialPrefix(value, "telegram");
    return handle ? `https://t.me/${handle}` : "";
  }

  if (kind === "discord") {
    const cleaned = value.replace(/^\/+/, "");
    if (/^(discord\.gg|discord\.com|discordapp\.com)\//i.test(cleaned)) return `https://${cleaned}`;
    return cleaned;
  }

  return `https://${value.replace(/^\/+/, "")}`;
}
