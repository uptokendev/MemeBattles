import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";

import { TokenSafetyStatusButton } from "@/components/token/TokenSafetyStatusButton";
import { TokenTradeSafetyPanel } from "@/components/token/TokenTradeSafetyPanel";
import { useWallet } from "@/contexts/WalletContext";
import { getActiveChainId } from "@/lib/chainConfig";

function findTokenHeaderActionRow(): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const headings = Array.from(document.querySelectorAll("h1"));
  for (const heading of headings) {
    const text = String(heading.textContent || "").trim();
    if (!text || text === "Token") continue;

    const row = heading.closest("div.flex.flex-wrap.items-center") as HTMLElement | null;
    if (row?.querySelector("button[title='Copy contract address']")) return row;
  }

  return null;
}

function findTradeTabsRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const buttons = Array.from(document.querySelectorAll("button"));
  const buyTab = buttons.find((button) => String(button.textContent || "").trim().toLowerCase() === "buy");
  const sellTab = buttons.find((button) => String(button.textContent || "").trim().toLowerCase() === "sell");
  if (!buyTab || !sellTab) return null;
  const shared = buyTab.closest("div")?.parentElement as HTMLElement | null;
  return shared || null;
}

function ensureTradeSafetyMount(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById("mwz-token-trade-safety-mount");
  if (existing) return existing;

  const root = findTradeTabsRoot();
  const parent = root?.parentElement;
  if (!root || !parent) return null;

  const mount = document.createElement("div");
  mount.id = "mwz-token-trade-safety-mount";
  mount.setAttribute("data-token-safety", "trade-panel");
  mount.className = "mb-3";
  parent.insertBefore(mount, root);
  return mount;
}

function isTokenTradeButton(target: EventTarget | null): HTMLButtonElement | null {
  const button = target instanceof Element ? target.closest("button") as HTMLButtonElement | null : null;
  if (!button) return null;
  if (button.closest("[data-token-safety]")) return null;
  if (button.getAttribute("title") === "Trading safety status") return null;
  const text = String(button.textContent || "").trim().toLowerCase();
  if (text === "buy" || text === "sell") return button;
  return null;
}

export function TokenSafetyRouteOverlay() {
  const { campaignAddress = "" } = useParams();
  const wallet = useWallet();
  const chainId = getActiveChainId(wallet.chainId);
  const [headerRow, setHeaderRow] = useState<HTMLElement | null>(null);
  const [tradeSafetyMount, setTradeSafetyMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const updateTarget = () => {
      setHeaderRow(findTokenHeaderActionRow());
      setTradeSafetyMount(ensureTradeSafetyMount());
    };
    updateTarget();

    if (typeof document === "undefined") return;
    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(updateTarget, 750);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [campaignAddress]);

  useEffect(() => {
    if (!campaignAddress || typeof window === "undefined") return;

    const onClick = (event: MouseEvent) => {
      const button = isTokenTradeButton(event.target);
      if (!button) return;

      const safety = window.__mwzTokenSafetyState;
      const safetyCampaign = String(safety?.campaignAddress || "").toLowerCase();
      const routeCampaign = String(campaignAddress || "").toLowerCase();
      if (!safety || safetyCampaign !== routeCampaign) return;

      const text = String(button.textContent || "").trim().toLowerCase();
      const sideBlocked = text === "buy" ? !safety.buyAllowed : text === "sell" ? !safety.sellAllowed : false;
      if (!safety.blocked && !sideBlocked) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent("mwz:openTokenSafety"));
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [campaignAddress]);

  useEffect(() => {
    return () => {
      const mount = document.getElementById("mwz-token-trade-safety-mount");
      mount?.remove();
    };
  }, [campaignAddress]);

  if (!campaignAddress) return null;

  const button = (
    <div className="ml-auto shrink-0" data-token-safety>
      <TokenSafetyStatusButton campaignAddress={campaignAddress} chainId={chainId} />
    </div>
  );

  return (
    <>
      {headerRow ? createPortal(button, headerRow) : (
        <div className="pointer-events-none fixed right-4 top-[5.4rem] z-50 hidden xl:block">
          <div className="pointer-events-auto">
            {button}
          </div>
        </div>
      )}
      {tradeSafetyMount ? createPortal(<TokenTradeSafetyPanel />, tradeSafetyMount) : null}
    </>
  );
}
