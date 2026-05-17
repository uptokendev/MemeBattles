import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

import { useWallet } from "@/contexts/WalletContext";
import { fetchPrepareDraft, type PrepareDraftBundle } from "@/lib/draftApi";
import { resolveImageUri } from "@/lib/media";

function getPrepareSlug(pathname: string) {
  const match = pathname.match(/^\/prepare\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function findHeroChip() {
  return document.querySelector("main section .mwz-chip.mwz-chip-active") as HTMLElement | null;
}

function findHeroSection() {
  return findHeroChip()?.closest("section") as HTMLElement | null;
}

export function PrepareHeroImagePortal() {
  const location = useLocation();
  const wallet = useWallet();
  const slug = useMemo(() => getPrepareSlug(location.pathname), [location.pathname]);
  const [bundle, setBundle] = useState<PrepareDraftBundle | null>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBundle(null);

    if (!slug) return () => {
      cancelled = true;
    };

    void fetchPrepareDraft(slug, wallet.account)
      .then((data) => {
        if (!cancelled) setBundle(data);
      })
      .catch(() => {
        if (!cancelled) setBundle(null);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, wallet.account]);

  useEffect(() => {
    if (!slug || typeof document === "undefined") {
      setMount(null);
      return;
    }

    let cancelled = false;
    let localMount: HTMLElement | null = null;
    let heroSection: HTMLElement | null = null;
    let previousStyle = "";
    let observer: MutationObserver | null = null;

    const attach = () => {
      if (cancelled) return true;

      document
        .querySelectorAll("[data-mwz-prepare-hero-image-portal]")
        .forEach((node) => node.remove());

      const chip = findHeroChip();
      if (!chip?.parentElement) return false;

      heroSection = findHeroSection();
      if (heroSection) {
        previousStyle = heroSection.getAttribute("style") || "";
        heroSection.style.paddingTop = "1.25rem";
      }

      localMount = document.createElement("div");
      localMount.setAttribute("data-mwz-prepare-hero-image-portal", "true");
      chip.insertAdjacentElement("beforebegin", localMount);
      setMount(localMount);
      return true;
    };

    if (!attach()) {
      observer = new MutationObserver(() => {
        if (attach()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      localMount?.remove();
      if (heroSection) {
        if (previousStyle) heroSection.setAttribute("style", previousStyle);
        else heroSection.removeAttribute("style");
      }
      setMount(null);
    };
  }, [slug]);

  if (!slug || !mount || !bundle?.draft) return null;

  const imageUrl = resolveImageUri(bundle.draft.logoUrl) || "/placeholder.svg";
  const ticker = bundle.draft.ticker ? `$${bundle.draft.ticker}` : "Draft";

return createPortal(
  <div className="pointer-events-none absolute left-1/2 top-0 z-0 flex -translate-x-1/2 justify-center">
    <div className="relative h-[28rem] w-[28rem] overflow-hidden rounded-xl border border-orange-400/50 bg-black/25 shadow-[0_0_90px_rgba(255,153,0,0.28)] md:h-[28rem] md:w-[28rem] lg:h-[36rem] lg:w-[36rem]">
      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.05),transparent_45%,rgba(0,0,0,0.18))]" />
      <img
        src={imageUrl}
        alt={`${ticker} token image`}
        className="h-full w-full object-cover"
        draggable={false}
      />
    </div>
  </div>,
  mount,
);
}
