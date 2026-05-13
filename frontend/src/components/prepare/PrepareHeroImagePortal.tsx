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
    let observer: MutationObserver | null = null;

    const attach = () => {
      if (cancelled) return true;

      document
        .querySelectorAll("[data-mwz-prepare-hero-image-portal]")
        .forEach((node) => node.remove());

      const chip = findHeroChip();
      if (!chip?.parentElement) return false;

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
      setMount(null);
    };
  }, [slug]);

  if (!slug || !mount || !bundle?.draft) return null;

  const imageUrl = resolveImageUri(bundle.draft.logoUrl) || "/placeholder.svg";
  const ticker = bundle.draft.ticker ? `$${bundle.draft.ticker}` : "Draft";

  return createPortal(
    <div className="mx-auto mt-2 flex w-full justify-center px-4 md:mt-4">
      <div className="relative h-36 w-36 overflow-hidden rounded-xl border border-orange-400/60 bg-black/55 shadow-[0_0_55px_rgba(255,153,0,0.20)] md:h-48 md:w-48 lg:h-56 lg:w-56">
        <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(255,153,0,0.08),transparent_45%,rgba(0,0,0,0.20))]" />
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
