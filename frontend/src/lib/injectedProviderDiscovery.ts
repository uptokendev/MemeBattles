export const INITIAL_PROVIDER_DISCOVERY_DELAYS_MS = [
  100,
  250,
  500,
  1_000,
  2_000,
  4_000,
  7_000,
  10_000,
  15_000,
  30_000,
] as const;

export const WAKE_PROVIDER_DISCOVERY_DELAYS_MS = [
  0,
  100,
  500,
  1_500,
  4_000,
  10_000,
] as const;

type DiscoveryOptions = {
  windowObject?: Window;
  documentObject?: Document;
  initialDelays?: readonly number[];
  wakeDelays?: readonly number[];
};

/**
 * Rechecks injected providers during initial extension startup and whenever the
 * browser wakes/restores the page. Some Chromium variants expose
 * `window.ethereum` several seconds after React has mounted.
 */
export function watchInjectedProviderAvailability(
  onCheck: () => void,
  options: DiscoveryOptions = {},
) {
  if (typeof window === "undefined" && !options.windowObject) {
    return () => undefined;
  }

  const windowObject = options.windowObject ?? window;
  const documentObject = options.documentObject ?? document;
  const initialDelays =
    options.initialDelays ?? INITIAL_PROVIDER_DISCOVERY_DELAYS_MS;
  const wakeDelays = options.wakeDelays ?? WAKE_PROVIDER_DISCOVERY_DELAYS_MS;
  const timers = new Set<number>();
  let stopped = false;

  const check = () => {
    if (!stopped) onCheck();
  };

  const schedule = (delays: readonly number[]) => {
    delays.forEach((delay) => {
      const timer = windowObject.setTimeout(() => {
        timers.delete(timer);
        check();
      }, delay);
      timers.add(timer);
    });
  };

  const wake = () => schedule(wakeDelays);
  const onVisibilityChange = () => {
    if (documentObject.visibilityState !== "hidden") wake();
  };

  windowObject.addEventListener("ethereum#initialized", wake);
  windowObject.addEventListener("focus", wake);
  windowObject.addEventListener("pageshow", wake);
  documentObject.addEventListener("visibilitychange", onVisibilityChange);

  check();
  schedule(initialDelays);

  return () => {
    stopped = true;
    timers.forEach((timer) => windowObject.clearTimeout(timer));
    timers.clear();
    windowObject.removeEventListener("ethereum#initialized", wake);
    windowObject.removeEventListener("focus", wake);
    windowObject.removeEventListener("pageshow", wake);
    documentObject.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
