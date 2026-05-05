import { buildRealtimeApiUrl } from "@/lib/realtimeApi";

type Eip1193Provider = {
  request?: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  selectedAddress?: string | null;
  providers?: Eip1193Provider[];
  [key: string]: any;
};

const PATCH_ID = "mwz-profile-draft-follow-count-patch";
let installed = false;
let lastRun = 0;

function normalizeAddress(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(raw) ? raw : "";
}

async function getConnectedAccount() {
  const eth = window.ethereum as Eip1193Provider | undefined;
  const providers = eth ? (Array.isArray(eth.providers) ? eth.providers : [eth]) : [];

  for (const provider of providers) {
    const selected = normalizeAddress(provider?.selectedAddress || "");
    if (selected) return selected;

    try {
      const accounts = await provider?.request?.({ method: "eth_accounts" });
      if (Array.isArray(accounts)) {
        const account = accounts.map((item) => normalizeAddress(String(item))).find(Boolean);
        if (account) return account;
      }
    } catch {
      // try next provider
    }
  }

  return "";
}

async function fetchDraftFollowCount(wallet: string) {
  const res = await fetch(buildRealtimeApiUrl(`/api/drafts/followed?wallet=${encodeURIComponent(wallet)}`), {
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(json.items)) return 0;
  return json.items.length;
}

function ownText(el: HTMLElement) {
  return Array.from(el.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function exactText(el: HTMLElement) {
  return String(el.textContent || "").replace(/\s+/g, " ").trim();
}

function isFollowingLabel(el: HTMLElement) {
  const text = exactText(el).toLowerCase();
  const own = ownText(el).toLowerCase();
  return text === "following" || own === "following" || /^following$/i.test(text);
}

function numberFromElement(el: HTMLElement) {
  const text = exactText(el).replace(/,/g, "");
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function numericDescendants(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("*"))
    .filter((el) => !el.closest("#mwz-profile-followed-drafts-bridge"))
    .map((el) => ({ el, value: numberFromElement(el) }))
    .filter((item): item is { el: HTMLElement; value: number } => item.value !== null);
}

function findNearestCountElement(label: HTMLElement) {
  const previous = label.previousElementSibling as HTMLElement | null;
  if (previous && numberFromElement(previous) !== null) return previous;

  const next = label.nextElementSibling as HTMLElement | null;
  if (next && numberFromElement(next) !== null) return next;

  let scope: HTMLElement | null = label.parentElement;
  for (let depth = 0; scope && depth < 5; depth += 1, scope = scope.parentElement) {
    if (scope.closest("#mwz-profile-followed-drafts-bridge")) continue;

    const directChildren = Array.from(scope.children) as HTMLElement[];
    const directNumber = directChildren.find((child) => child !== label && numberFromElement(child) !== null);
    if (directNumber) return directNumber;

    const numbers = numericDescendants(scope).filter((item) => item.el !== label && !item.el.contains(label));
    if (numbers.length) return numbers[0].el;
  }

  return null;
}

function patchCombinedTextElement(labelOrCombined: HTMLElement, draftCount: number) {
  const text = exactText(labelOrCombined);
  const match = text.match(/^(\d+)\s+following$/i) || text.match(/^following\s+(\d+)$/i);
  if (!match) return false;

  const displayed = Number(match[1]);
  if (!Number.isFinite(displayed)) return false;

  const base = Number(labelOrCombined.dataset.mwzBaseFollowingCount || displayed);
  labelOrCombined.dataset.mwzBaseFollowingCount = String(base);
  const next = base + draftCount;
  labelOrCombined.textContent = /^\d/.test(text) ? `${next} Following` : `Following ${next}`;
  labelOrCombined.setAttribute("data-mwz-draft-follow-count-patched", "true");
  return true;
}

function patchFollowingCount(draftCount: number) {
  document.getElementById("mwz-profile-following-count-bridge")?.remove();
  if (!window.location.pathname.startsWith("/profile")) return;

  const all = Array.from(document.querySelectorAll<HTMLElement>("body *"))
    .filter((el) => !el.closest("#mwz-profile-followed-drafts-bridge"));

  for (const el of all) {
    if (patchCombinedTextElement(el, draftCount)) return;
  }

  const labels = all.filter(isFollowingLabel);
  for (const label of labels) {
    const countEl = findNearestCountElement(label);
    if (!countEl) continue;

    const displayed = numberFromElement(countEl);
    if (displayed === null) continue;

    const base = Number(countEl.dataset.mwzBaseFollowingCount || displayed);
    countEl.dataset.mwzBaseFollowingCount = String(base);
    countEl.textContent = String(base + draftCount);
    countEl.setAttribute("data-mwz-draft-follow-count-patched", "true");
    return;
  }
}

async function refresh() {
  if (!window.location.pathname.startsWith("/profile")) return;
  if (Date.now() - lastRun < 700) return;
  lastRun = Date.now();

  const wallet = await getConnectedAccount();
  if (!wallet) return;

  const draftCount = await fetchDraftFollowCount(wallet);
  patchFollowingCount(draftCount);
}

export function installProfileDraftFollowingCountPatch() {
  if (installed || typeof window === "undefined" || typeof document === "undefined") return;
  installed = true;

  document.documentElement.setAttribute(`data-${PATCH_ID}`, "true");

  const run = () => void refresh();
  window.addEventListener("focus", run);
  window.addEventListener("popstate", run);
  window.addEventListener("mwz:draft-follows-changed", run as EventListener);
  window.addEventListener("mwz:notifications-changed", run as EventListener);

  new MutationObserver(() => run()).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.setTimeout(run, 250);
  window.setTimeout(run, 1000);
  window.setTimeout(run, 2500);
  window.setInterval(run, 10000);
}

installProfileDraftFollowingCountPatch();
