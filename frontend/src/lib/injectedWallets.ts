export type InjectedWalletKind = "metamask" | "cryptocom";

export type Eip1193Provider = {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;

  on?: (event: string, listener: (...args: unknown[]) => void) => void;

  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void
  ) => void;

  isMetaMask?: boolean;
  isCryptoCom?: boolean;
  isBraveWallet?: boolean;

  providers?: Eip1193Provider[];
};

type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: Eip1193Provider;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function discoverInjectedWallets(
  timeoutMs = 500
): Promise<Eip6963ProviderDetail[]> {
  if (typeof window === "undefined") {
    return [];
  }

  const providers = new Map<string, Eip6963ProviderDetail>();

  const onAnnounceProvider = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;

    if (detail?.info?.uuid && detail?.provider?.request) {
      providers.set(detail.info.uuid, detail);
    }
  };

  window.addEventListener(
    "eip6963:announceProvider",
    onAnnounceProvider as EventListener
  );

  window.dispatchEvent(new Event("eip6963:requestProvider"));

  await wait(timeoutMs);

  window.removeEventListener(
    "eip6963:announceProvider",
    onAnnounceProvider as EventListener
  );

  return Array.from(providers.values());
}

function getLegacyInjectedProviders(): Eip1193Provider[] {
  if (typeof window === "undefined") {
    return [];
  }

  const ethereum = window.ethereum;

  if (!ethereum) {
    return [];
  }

  if (Array.isArray(ethereum.providers)) {
    return ethereum.providers.filter(Boolean);
  }

  return [ethereum];
}

function isMetaMaskProvider(wallet: Eip6963ProviderDetail): boolean {
  const rdns = wallet.info.rdns.toLowerCase();
  const name = wallet.info.name.toLowerCase();

  return rdns === "io.metamask" || name.includes("metamask");
}

function isCryptoComProvider(wallet: Eip6963ProviderDetail): boolean {
  const rdns = wallet.info.rdns.toLowerCase();
  const name = wallet.info.name.toLowerCase();

  return (
    rdns.includes("crypto.com") ||
    rdns.includes("cryptocom") ||
    rdns.includes("com.crypto") ||
    name.includes("crypto.com") ||
    name.includes("crypto com")
  );
}

export async function getInjectedProvider(
  walletKind: InjectedWalletKind
): Promise<Eip1193Provider> {
  const discoveredWallets = await discoverInjectedWallets();

  if (walletKind === "metamask") {
    const eip6963MetaMask = discoveredWallets.find(isMetaMaskProvider);

    if (eip6963MetaMask) {
      return eip6963MetaMask.provider;
    }

    const legacyMetaMask = getLegacyInjectedProviders().find((provider) => {
      return (
        provider.isMetaMask === true &&
        provider.isCryptoCom !== true &&
        provider.isBraveWallet !== true
      );
    });

    if (legacyMetaMask) {
      return legacyMetaMask;
    }

    throw new Error(
      "MetaMask provider not found. Install MetaMask or disable competing injected wallet extensions."
    );
  }

  if (walletKind === "cryptocom") {
    const eip6963CryptoCom = discoveredWallets.find(isCryptoComProvider);

    if (eip6963CryptoCom) {
      return eip6963CryptoCom.provider;
    }

    const legacyCryptoCom = getLegacyInjectedProviders().find((provider) => {
      return provider.isCryptoCom === true;
    });

    if (legacyCryptoCom) {
      return legacyCryptoCom;
    }

    throw new Error("Crypto.com wallet provider not found.");
  }

  throw new Error(`Unsupported wallet kind: ${walletKind}`);
}