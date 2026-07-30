export type SocialLinkKind = "x" | "telegram" | "discord" | "website" | "other";

function stripProtocolAndHost(value: string, hosts: RegExp) {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, "")
    .replace(hosts, "")
    .replace(/^@+/, "")
    .replace(/^\/+/, "")
    .split(/[/?#]/)[0];
}

function stripCommonSocialPrefix(value: string, kind: SocialLinkKind) {
  if (kind === "x") {
    return stripProtocolAndHost(value, /^(twitter\.com|x\.com)\//i);
  }

  if (kind === "telegram") {
    return stripProtocolAndHost(value, /^(t\.me|telegram\.me|telegram\.dog)\//i);
  }

  if (kind === "discord") {
    return stripProtocolAndHost(value, /^(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\//i);
  }

  return value.trim().replace(/^\/+/, "");
}

export function normalizeSocialUrl(raw: string | null | undefined, kind: SocialLinkKind) {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (kind === "x") {
    const handle = stripCommonSocialPrefix(value, "x");
    return handle ? `https://x.com/${handle}` : "";
  }

  if (kind === "telegram") {
    const handle = stripCommonSocialPrefix(value, "telegram");
    return handle ? `https://t.me/${handle}` : "";
  }

  if (kind === "discord") {
    const invite = stripCommonSocialPrefix(value, "discord");
    return invite ? `https://discord.gg/${invite}` : "";
  }

  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/+/, "")}`;
}
