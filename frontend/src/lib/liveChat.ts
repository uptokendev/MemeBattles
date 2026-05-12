// frontend/src/lib/liveChat.ts

export type LiveChatMessage = {
  id: string;
  wallet: string;
  handle: string | null;
  squadCallsign: string | null;
  text: string;
  ts: number;
};

export type LiveChatDelete = {
  type: "delete";
  msgId: string;
  ts: number;
};

const URL_REGEX = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
// ASCII C0 controls (\x00 through \x1F) plus DEL (\x7F). Use explicit hex to avoid
// the range silently being interpreted as printable space-to-hyphen if the source
// is reflowed or copy-pasted through tools that strip control characters.
const CONTROL_REGEX = /[\x00-\x1F\x7F]/g;

export const MAX_CHAT_LENGTH = 200;
export const MIN_CHAT_INTERVAL_MS = 2000;

export function sanitizeChatText(input: string): string {
  // strip control chars, strip URLs, collapse whitespace, hard cap
  const noControl = input.replace(CONTROL_REGEX, " ");
  const noUrl = noControl.replace(URL_REGEX, "");
  const collapsed = noUrl.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_CHAT_LENGTH);
}

export function isModerator(wallet: string, moderatorList: string[]): boolean {
  if (!wallet) return false;
  const target = wallet.toLowerCase();
  return moderatorList.some((m) => m.trim().toLowerCase() === target);
}

export function parseModeratorEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function shortWallet(wallet: string): string {
  if (!wallet || wallet.length < 11) return wallet || "0x?";
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

export function newMessageId(): string {
  // ULID-ish: base36 timestamp + 12 random hex chars (6 bytes × 2 hex/byte) —
  // sortable, collision-resistant enough for a single launch event without
  // pulling in a dep.
  const ts = Date.now().toString(36);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${ts}-${rand}`;
}
