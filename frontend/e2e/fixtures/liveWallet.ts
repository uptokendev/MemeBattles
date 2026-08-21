import type { Page } from "@playwright/test";

export type LiveRpcHandler = (method: string, params: any[]) => Promise<any>;

/**
 * Injects a MetaMask-shaped EIP-1193 provider. `request` is fulfilled in Node
 * so Token Details can run the real topazV2Trade path against BSC testnet
 * without putting a private key in the page.
 */
export async function injectLiveWallet(
  page: Page,
  options: { address: string; chainId?: 97; handler: LiveRpcHandler },
) {
  const chainId = options.chainId ?? 97;
  await page.exposeFunction("__mwzNodeRpc", async (payload: { method: string; params?: any[] }) => {
    return options.handler(payload.method, payload.params || []);
  });

  await page.addInitScript(
    ({ address, chainId: evmChainId }) => {
      localStorage.removeItem("mwz:wallet:disconnected");
      localStorage.setItem("mwz:active_wallet_kind", "bnb");
      localStorage.setItem("mwz:selected_feed_chain_id", String(evmChainId));
      localStorage.setItem("mwz:last_featured_chain_id", String(evmChainId));
      localStorage.setItem("mwz:last_evm_chain_id", String(evmChainId));
      localStorage.setItem("mwz:token_details_chain_id", String(evmChainId));
      localStorage.setItem("mwz:selected_wallet", "metamask");
      const listeners = new Map<string, Function[]>();
      const provider = {
        isMetaMask: true,
        isPhantom: false,
        selectedAddress: address,
        request: async ({ method, params }: { method: string; params?: any[] }) =>
          (window as any).__mwzNodeRpc({ method, params }),
        on: (eventName: string, listener: Function) => {
          const list = listeners.get(eventName) || [];
          list.push(listener);
          listeners.set(eventName, list);
        },
        removeListener: (eventName: string, listener: Function) => {
          listeners.set(eventName, (listeners.get(eventName) || []).filter((fn) => fn !== listener));
        },
      };
      (window as any).ethereum = provider;
      window.addEventListener("eip6963:requestProvider", () => {
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: { uuid: "mwz-live-metamask", name: "MetaMask", icon: "data:image/svg+xml,<svg/>", rdns: "io.metamask" },
              provider,
            },
          }),
        );
      });
    },
    { address: options.address, chainId },
  );
}
