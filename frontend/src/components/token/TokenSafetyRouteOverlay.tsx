import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";

import { TokenSafetyStatusButton } from "@/components/token/TokenSafetyStatusButton";
import { useWallet } from "@/contexts/WalletContext";
import { getActiveChainId, getEvmReadChainIdForTokenPage, isSolanaChainId, SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { isEvmAddress, isSolanaAddress } from "@/lib/address";

const SAFETY_STATE_MAX_AGE_MS = 15_000;

function sameCampaignAddress(a?: string | null, b?: string | null) {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  if (!left || !right) return false;
  if (left === right) return true;
  // Recovery for lowercased Solana URLs from older grid builds.
  return left.toLowerCase() === right.toLowerCase();
}

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

function isTokenTradeButton(target: EventTarget | null): HTMLButtonElement | null {
  const button = target instanceof Element ? target.closest("button") as HTMLButtonElement | null : null;
  if (!button) return null;
  if (button.closest("[data-token-safety]")) return null;
  if (button.getAttribute("title") === "Trading safety status") return null;
  const text = String(button.textContent || "").trim().toLowerCase();
  if (text === "buy" || text === "sell") return button;
  return null;
}

function blockAndOpenSafety(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  window.dispatchEvent(new CustomEvent("mwz:openTokenSafety"));
  window.dispatchEvent(new CustomEvent("mwz:refreshTokenSafety"));
}

export function TokenSafetyRouteOverlay() {
  const { campaignAddress = "" } = useParams();
  const wallet = useWallet();
  // Prefer the token in the URL over the last-connected wallet / feed latch.
  const chainId = (() => {
    if (isEvmAddress(campaignAddress)) return getEvmReadChainIdForTokenPage();
    try {
      const q = Number(new URLSearchParams(window.location.search).get("chainId") || 0);
      if (isSolanaChainId(q)) return SOLANA_CHAIN_ID;
    } catch {
      /* ignore */
    }
    if (isSolanaAddress(campaignAddress)) return SOLANA_CHAIN_ID;
    const damaged = String(campaignAddress || "").trim();
    if (
      damaged &&
      !damaged.startsWith("0x") &&
      damaged.length >= 32 &&
      damaged.length <= 48 &&
      /^[0-9A-Za-z]+$/.test(damaged)
    ) {
      return SOLANA_CHAIN_ID;
    }
    return getActiveChainId(wallet.chainId);
  })();
  const [headerRow, setHeaderRow] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const updateTarget = () => setHeaderRow(findTokenHeaderActionRow());
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

      const text = String(button.textContent || "").trim().toLowerCase();
      const safety = window.__mwzTokenSafetyState;
      const safetyCampaign = String(safety?.campaignAddress || "").trim();
      const routeCampaign = String(campaignAddress || "").trim();
      const stale = !safety?.updatedAt || Date.now() - Number(safety.updatedAt) > SAFETY_STATE_MAX_AGE_MS;

      if (!safety || !sameCampaignAddress(safetyCampaign, routeCampaign) || stale) {
        blockAndOpenSafety(event);
        return;
      }

      const sideBlocked = text === "buy" ? !safety.buyAllowed : text === "sell" ? !safety.sellAllowed : false;
      if (!safety.blocked && !sideBlocked) return;

      blockAndOpenSafety(event);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [campaignAddress]);

  useEffect(() => {
    const mount = document.getElementById("mwz-token-trade-safety-mount");
    mount?.remove();
  }, [campaignAddress]);

  if (!campaignAddress) return null;

  const button = (
    <div className="ml-auto shrink-0" data-token-safety>
      <TokenSafetyStatusButton campaignAddress={campaignAddress} chainId={chainId} />
    </div>
  );

  if (headerRow) return createPortal(button, headerRow);

  return (
    <div className="pointer-events-none fixed right-4 top-[5.4rem] z-50 hidden xl:block">
      <div className="pointer-events-auto">
        {button}
      </div>
    </div>
  );
}
