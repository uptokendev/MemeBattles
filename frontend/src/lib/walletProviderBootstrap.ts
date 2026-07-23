const EIP6963_REQUEST_EVENT = "eip6963:requestProvider";
const EIP6963_ANNOUNCE_EVENT = "eip6963:announceProvider";
const METAMASK_INITIALIZED_EVENT = "ethereum#initialized";
const DISCOVERY_DELAYS_MS = [0, 100, 250, 500, 1000, 2000, 4000, 7000, 10000];

type LegacyInjectedProvider = {
  request?: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isBinance?: boolean;
  isTrust?: boolean;
  isOkxWallet?: boolean;
};

function legacyProviderInfo(provider: LegacyInjectedProvider) {
  if (provider.isRabby) return { uuid: "mwz-legacy-rabby", name: "Rabby", rdns: "io.rabby", icon: "" };
  if (provider.isCoinbaseWallet) return { uuid: "mwz-legacy-coinbase", name: "Coinbase Wallet", rdns: "com.coinbase.wallet", icon: "" };
  if (provider.isBinance) return { uuid: "mwz-legacy-binance", name: "Binance Wallet", rdns: "com.binance.wallet", icon: "" };
  if (provider.isTrust) return { uuid: "mwz-legacy-trust", name: "Trust Wallet", rdns: "com.trustwallet.app", icon: "" };
  if (provider.isOkxWallet) return { uuid: "mwz-legacy-okx", name: "OKX Wallet", rdns: "com.okex.wallet", icon: "" };
  if (provider.isMetaMask) return { uuid: "mwz-legacy-metamask", name: "MetaMask", rdns: "io.metamask", icon: "" };
  return { uuid: "mwz-legacy-injected", name: "Injected EVM Wallet", rdns: "app.injected.wallet", icon: "" };
}

function announceLegacyProvider() {
  const provider = (window as Window & { ethereum?: LegacyInjectedProvider }).ethereum;
  if (!provider || typeof provider.request !== "function") return;

  window.dispatchEvent(
    new CustomEvent(EIP6963_ANNOUNCE_EVENT, {
      detail: {
        info: legacyProviderInfo(provider),
        provider,
      },
    }),
  );
}

function requestInjectedProviders() {
  try {
    window.dispatchEvent(new Event(EIP6963_REQUEST_EVENT));
  } catch {
    // Legacy providers are still exposed through window.ethereum.
  }

  announceLegacyProvider();
}

export function bootstrapWalletProviderDiscovery() {
  if (typeof window === "undefined") return () => undefined;

  const timers = DISCOVERY_DELAYS_MS.map((delay) =>
    window.setTimeout(requestInjectedProviders, delay),
  );

  const rediscover = () => requestInjectedProviders();

  window.addEventListener(METAMASK_INITIALIZED_EVENT, rediscover);
  window.addEventListener("focus", rediscover);
  window.addEventListener("pageshow", rediscover);
  document.addEventListener("visibilitychange", rediscover);

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    window.removeEventListener(METAMASK_INITIALIZED_EVENT, rediscover);
    window.removeEventListener("focus", rediscover);
    window.removeEventListener("pageshow", rediscover);
    document.removeEventListener("visibilitychange", rediscover);
  };
}

bootstrapWalletProviderDiscovery();
