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

function findHeroSection() {
  const chip = document.querySelector("main section .mwz-chip.mwz-chip-active") as HTMLElement | null;
  return chip?.closest("section") as HTMLElement | null;
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

      const heroSection = findHeroSection();
      if (!heroSection) return false;

      localMount = document.createElement("div");
      localMount.setAttribute("data-mwz-prepare-hero-image-portal", "true");
      heroSection.insertBefore(localMount, heroSection.firstChild);
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

  if (!slug || !mount || !bundle?.draft?.logoUrl) return null;

  const imageUrl = resolveImageUri(bundle.draft.logoUrl);
  if (!imageUrl) return null;

  return createPortal(
    <div className="pointer-events-none absolute left-1/2 top-0 z-0 h-[410px] w-[min(820px,86vw)] -translate-x-1/2 overflow-hidden opacity-45 md:h-[440px] lg:h-[470px]">
      <img
        src={imageUrl}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-contain drop-shadow-[0_0_80px_rgba(255,153,0,0.35)]"
        draggable={false}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(26,8,2,0.58)_78%,rgba(26,8,2,0.92)_100%)]" />
    </div>,
    mount,
  );
}
