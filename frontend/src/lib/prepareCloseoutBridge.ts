import { toast } from "sonner";

import { armDraftNotifications, fetchPrepareDraft, followDraft, type CampaignDraft } from "@/lib/draftApi";
import { buildRealtimeApiUrl } from "@/lib/realtimeApi";

type Eip1193Provider = {
  request?: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  selectedAddress?: string | null;
  providers?: Eip1193Provider[];
  [key: string]: any;
};

type Eip6963ProviderDetail = {
  info?: { uuid?: string; name?: string; rdns?: string; icon?: string };
  provider?: Eip1193Provider;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

const NOTIFICATIONS_KEY = "mwz_prepare_notifications_v1";
const SELECTED_WALLET_KEY = "mwz:selected_wallet";
const EIP6963_PROVIDERS = new Map<string, Eip1193Provider>();
let installed = false;
let discoveryInstalled = false;
let discoveryRequested = false;
let arming = false;
let following = false;
let refreshingProfile = false;
let lastProfileRefresh = 0;
let lastFollowedDraftCount = 0;

function normalizeAddress(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(raw) ? raw : "";
}

function selectedWalletId() {
  try {
    return String(window.localStorage.getItem(SELECTED_WALLET_KEY) || "").toLowerCase();
  } catch {
    return "";
  }
}

function providerText(provider: Eip1193Provider) {
  const info = provider.__mwzEip6963Info || {};
  const parts = [
    info.name,
    info.rdns,
    provider.providerInfo?.name,
    provider.providerInfo?.rdns,
    provider.info?.name,
    provider.info?.rdns,
    provider.metadata?.name,
    provider.metadata?.rdns,
    provider.name,
    provider._walletName,
    provider.rdns,
    provider._rdns,
  ];
  return parts.map((item) => String(item || "").toLowerCase()).join(" ");
}

function isCryptoComProvider(provider: Eip1193Provider) {
  const text = providerText(provider);
  return Boolean(
    provider.isCryptoCom ||
      provider.isCryptoComWallet ||
      provider.isDefiWallet ||
      provider.isDeFiWallet ||
      provider.deficonnectProvider ||
      text.includes("crypto.com") ||
      text.includes("cryptocom") ||
      text.includes("crypto com") ||
      text.includes("defi wallet")
  );
}

function isMetaMaskProvider(provider: Eip1193Provider) {
  const text = providerText(provider);
  return Boolean(
    (provider.isMetaMask || provider._metamask || text.includes("metamask") || text.includes("io.metamask")) &&
      !isCryptoComProvider(provider)
  );
}

function startEip6963Discovery() {
  if (!discoveryInstalled) {
    window.addEventListener("eip6963:announceProvider", (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      const provider = detail?.provider;
      if (!provider?.request) return;

      try {
        provider.__mwzEip6963Info = detail.info || {};
      } catch {
        // ignore immutable provider wrappers
      }

      const info = detail.info || {};
      const key = info.uuid || info.rdns || info.name || String(EIP6963_PROVIDERS.size + 1);
      EIP6963_PROVIDERS.set(key, provider);
    });
    discoveryInstalled = true;
  }

  if (discoveryRequested) return;
  discoveryRequested = true;

  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  } catch {
    // Legacy detection still works.
  } finally {
    window.setTimeout(() => {
      discoveryRequested = false;
    }, 1000);
  }
}

function legacyProviders() {
  const eth = window.ethereum;
  const providers = eth ? (Array.isArray(eth.providers) ? eth.providers : [eth]) : [];
  return providers.filter((provider) => provider?.request);
}

function dedupeProviders(candidates: Array<Eip1193Provider | null | undefined>) {
  const seen = new Set<Eip1193Provider>();
  return candidates.filter((candidate): candidate is Eip1193Provider => {
    if (!candidate?.request || seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
}

async function providers() {
  startEip6963Discovery();
  await new Promise((resolve) => window.setTimeout(resolve, 125));
  return dedupeProviders([...EIP6963_PROVIDERS.values(), ...legacyProviders()]);
}

async function providerAccounts(provider: Eip1193Provider, request = false) {
  const selected = normalizeAddress(provider.selectedAddress || "");
  if (selected) return [selected];

  try {
    const accounts = await provider.request?.({ method: request ? "eth_requestAccounts" : "eth_accounts" });
    return Array.isArray(accounts) ? accounts.map((item) => normalizeAddress(String(item))).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function getConnectedAccount() {
  const selected = selectedWalletId();
  const all = await providers();

  const selectedMatches = all.filter((provider) => {
    if (selected.startsWith("metamask")) return isMetaMaskProvider(provider);
    if (selected.startsWith("cryptocom")) return isCryptoComProvider(provider);
    return selected ? providerText(provider).includes(selected) : false;
  });

  const preferred = [
    ...selectedMatches,
    ...(selected.startsWith("cryptocom") ? [] : all.filter(isMetaMaskProvider)),
    ...all.filter((provider) => !isCryptoComProvider(provider)),
    ...all,
  ];

  for (const provider of dedupeProviders(preferred)) {
    const accounts = await providerAccounts(provider, false);
    if (accounts[0]) return accounts[0];
  }

  return "";
}

function currentPrepareSlug() {
  const match = window.location.pathname.match(/^\/prepare\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : "";
}

async function handleArmNotificationClick(event: Event) {
  const slug = currentPrepareSlug();
  if (!slug || arming) return;

  event.preventDefault();
  event.stopPropagation();
  if (typeof (event as any).stopImmediatePropagation === "function") {
    (event as any).stopImmediatePropagation();
  }

  const wallet = await getConnectedAccount();
  if (!wallet) {
    toast.error("Connect wallet to arm notifications.");
    return;
  }

  arming = true;
  try {
    const bundle = await fetchPrepareDraft(slug, wallet);
    await armDraftNotifications(bundle.draft.id, wallet);
    toast.success("Notifications armed for this draft.");
    await refreshProfilePrepareNotifications(true);
  } catch (err: any) {
    toast.error(err?.message || "Failed to arm notifications");
  } finally {
    arming = false;
  }
}

async function handleFollowDraftClick(event: Event) {
  const slug = currentPrepareSlug();
  if (!slug || following) return;

  event.preventDefault();
  event.stopPropagation();
  if (typeof (event as any).stopImmediatePropagation === "function") {
    (event as any).stopImmediatePropagation();
  }

  const wallet = await getConnectedAccount();
  if (!wallet) {
    toast.error("Connect wallet to follow this draft.");
    return;
  }

  following = true;
  try {
    const bundle = await fetchPrepareDraft(slug, wallet);
    await followDraft(bundle.draft.id, wallet);
    toast.success("Draft followed.");
    window.dispatchEvent(new CustomEvent("mwz:draft-follows-changed"));
  } catch (err: any) {
    toast.error(err?.message || "Failed to follow draft");
  } finally {
    following = false;
  }
}

function renamePrepareFollowButtons() {
  if (!currentPrepareSlug()) return;

  document.querySelectorAll("button").forEach((button) => {
    const label = String(button.textContent || "").trim();
    if (/watchlist/i.test(label)) {
      button.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && /watchlist/i.test(node.textContent || "")) {
          node.textContent = String(node.textContent || "").replace(/watchlist/gi, "Follow");
        }
      });
      if (/watchlist/i.test(String(button.textContent || ""))) {
        button.innerHTML = button.innerHTML.replace(/Watchlist/g, "Follow").replace(/watchlist/g, "Follow");
      }
    }
  });
}

function installPrepareButtonInterceptors() {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest?.("button");
      const label = String(button?.textContent || "").toLowerCase();
      if (!button || !currentPrepareSlug()) return;

      if (label.includes("arm notification")) {
        void handleArmNotificationClick(event);
        return;
      }

      if (label.includes("watchlist") || /^\s*follow\s*$/.test(label)) {
        void handleFollowDraftClick(event);
      }
    },
    true,
  );

  const rename = () => renamePrepareFollowButtons();
  const observer = new MutationObserver(rename);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(rename, 250);
  window.setTimeout(rename, 1000);
}

function normalizeNotificationKind(kind: string) {
  if (["follow", "comment", "heat", "publish", "launch"].includes(kind)) return kind;
  if (kind === "armed") return "follow";
  return "publish";
}

async function refreshProfilePrepareNotifications(force = false) {
  if (refreshingProfile) return;
  if (!force && Date.now() - lastProfileRefresh < 3000) return;

  const wallet = await getConnectedAccount();
  if (!wallet) return;

  refreshingProfile = true;
  try {
    const res = await fetch(buildRealtimeApiUrl(`/api/prepare-notifications?wallet=${encodeURIComponent(wallet)}&limit=50`), {
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(json.items)) return;

    const items = json.items.map((item: any) => ({
      id: String(item.id),
      title: String(item.title || "Prepare Mode update"),
      body: String(item.body || ""),
      target: String(item.target || "/profile?tab=notifications"),
      createdAt: String(item.createdAt || new Date().toISOString()),
      read: Boolean(item.read),
      kind: normalizeNotificationKind(String(item.kind || item.eventType || "publish")),
    }));

    window.localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("mwz:notifications-changed"));
    lastProfileRefresh = Date.now();
  } catch {
    // Profile should still work with its local fallback.
  } finally {
    refreshingProfile = false;
  }
}

function escapeHtml(value: string) {
  return String(value || "").replace(/[&<>'"]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "'") return "&#39;";
    return "&quot;";
  });
}

function draftCard(draft: CampaignDraft) {
  const href = `/prepare/${encodeURIComponent(draft.slug)}`;
  return `
    <a href="${href}" class="mwz-button" style="display:block;padding:12px;margin-top:10px;text-decoration:none;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div>
          <div style="font-family:var(--font-retro,monospace);font-size:14px;color:#fff;text-transform:uppercase;">${escapeHtml(draft.name)} · $${escapeHtml(draft.ticker)}</div>
          <div style="margin-top:4px;font-size:11px;color:rgba(255,255,255,.58);text-transform:uppercase;letter-spacing:.12em;">${escapeHtml(draft.status.replace(/_/g, " "))}</div>
        </div>
        <div style="font-size:11px;color:#ffb347;text-transform:uppercase;letter-spacing:.12em;">Open</div>
      </div>
    </a>
  `;
}

function upsertProfileFollowingSummary(count: number) {
  if (!window.location.pathname.startsWith("/profile")) return;

  const root = document.querySelector("main") || document.getElementById("root") || document.body;
  let summary = document.getElementById("mwz-profile-following-count-bridge");
  if (!summary) {
    summary = document.createElement("section");
    summary.id = "mwz-profile-following-count-bridge";
    summary.className = "mwz-card";
    summary.style.maxWidth = "1120px";
    summary.style.margin = "12px auto";
    summary.style.padding = "12px 16px";
    summary.style.display = "flex";
    summary.style.justifyContent = "space-between";
    summary.style.alignItems = "center";
    summary.style.gap = "12px";
    root.prepend(summary);
  }

  summary.innerHTML = `
    <div>
      <div style="font-size:10px;color:#ffb347;text-transform:uppercase;letter-spacing:.18em;">// Following counter includes Prepare Mode</div>
      <div style="margin-top:4px;color:rgba(255,255,255,.74);font-size:13px;">${count} followed draft${count === 1 ? "" : "s"} from Prepare Mode are included below.</div>
    </div>
    <a href="/profile?tab=following" class="mwz-button" style="padding:8px 12px;text-decoration:none;font-size:12px;text-transform:uppercase;letter-spacing:.12em;">Open following</a>
  `;
}

async function refreshProfileFollowedDrafts() {
  if (!window.location.pathname.startsWith("/profile")) return;

  const wallet = await getConnectedAccount();
  if (!wallet) return;

  try {
    const res = await fetch(buildRealtimeApiUrl(`/api/drafts/followed?wallet=${encodeURIComponent(wallet)}`), {
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(json.items)) return;

    lastFollowedDraftCount = json.items.length;
    upsertProfileFollowingSummary(lastFollowedDraftCount);

    const tab = new URLSearchParams(window.location.search).get("tab") || "";
    const shouldShowPanel = !tab || tab === "following";
    const existing = document.getElementById("mwz-profile-followed-drafts-bridge");
    if (!shouldShowPanel) {
      existing?.remove();
      return;
    }

    const root = document.querySelector("main") || document.getElementById("root") || document.body;
    let panel = existing;
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "mwz-profile-followed-drafts-bridge";
      panel.className = "mwz-card";
      panel.style.maxWidth = "1120px";
      panel.style.margin = "16px auto";
      panel.style.padding = "16px";
      root.appendChild(panel);
    }

    panel.innerHTML = `
      <div style="font-size:11px;color:#ffb347;text-transform:uppercase;letter-spacing:.18em;">// Following · Prepare Drafts</div>
      <div style="margin-top:6px;font-family:var(--font-retro,monospace);font-size:24px;color:#fff;text-transform:uppercase;">Followed drafts</div>
      ${json.items.length ? json.items.map(draftCard).join("") : "<p style='margin-top:10px;color:rgba(255,255,255,.58);font-size:14px;'>No followed drafts yet.</p>"}
    `;
  } catch {
    // Non-blocking profile bridge.
  }
}

function installProfileRefreshers() {
  const refresh = () => {
    renamePrepareFollowButtons();
    void refreshProfilePrepareNotifications();
    void refreshProfileFollowedDrafts();
  };

  window.addEventListener("focus", refresh);
  window.addEventListener("popstate", refresh);
  window.addEventListener("mwz:notifications-changed", refreshProfileFollowedDrafts as EventListener);
  window.addEventListener("mwz:draft-follows-changed", refreshProfileFollowedDrafts as EventListener);
  window.setInterval(refresh, 15000);
  window.setTimeout(refresh, 750);
  window.setTimeout(refresh, 2500);
}

export function installPrepareCloseoutBridge() {
  if (installed || typeof window === "undefined" || typeof document === "undefined") return;
  installed = true;
  startEip6963Discovery();
  installPrepareButtonInterceptors();
  installProfileRefreshers();
}

installPrepareCloseoutBridge();
