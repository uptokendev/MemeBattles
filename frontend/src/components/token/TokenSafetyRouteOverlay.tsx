import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";

import { TokenSafetyStatusButton } from "@/components/token/TokenSafetyStatusButton";
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

export function TokenSafetyRouteOverlay() {
  const { campaignAddress = "" } = useParams();
  const wallet = useWallet();
  const chainId = getActiveChainId(wallet.chainId);
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

  if (!campaignAddress) return null;

  const button = (
    <div className="ml-auto shrink-0">
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
