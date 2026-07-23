const EIP6963_REQUEST_EVENT = "eip6963:requestProvider";
const METAMASK_INITIALIZED_EVENT = "ethereum#initialized";
const DISCOVERY_DELAYS_MS = [0, 100, 250, 500, 1000, 2000, 4000, 7000, 10000];

function requestInjectedProviders() {
  try {
    window.dispatchEvent(new Event(EIP6963_REQUEST_EVENT));
  } catch {
    // Legacy providers are still exposed through window.ethereum.
  }
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
