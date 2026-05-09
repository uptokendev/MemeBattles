import { useEffect } from "react";
import { createPageTooltipCopy, promotionEditTooltipCopy, promotionTooltipCopy } from "@/lib/infoTooltipCopy";

const INFO_MARK_ATTR = "data-mwz-info-tooltip";
const INFO_TARGET_ATTR = "data-mwz-info-tooltip-target";

const routeMatchers = ["/drafts/", "/prepare/"];

function isPromotionRoute(pathname: string) {
  return routeMatchers.some((part) => pathname.includes(part));
}

function makeTooltipContent(lines: readonly string[]) {
  return lines.join("\n");
}

function findByText(root: ParentNode, selector: string, text: string) {
  const normalized = text.trim().toLowerCase();
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    if (element.closest(`[${INFO_MARK_ATTR}]`)) return false;
    return (element.textContent || "").trim().toLowerCase().includes(normalized);
  });
}

function getFocusableInfoButton(label: string) {
  const info = document.createElement("span");
  info.setAttribute(INFO_MARK_ATTR, "true");
  info.setAttribute("role", "button");
  info.setAttribute("tabindex", "0");
  info.setAttribute("aria-label", label);
  info.textContent = "i";
  info.className = [
    "ml-2 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-accent/70",
    "text-[10px] font-mono leading-none text-accent align-middle transition-colors hover:bg-accent/10",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  ].join(" ");
  return info;
}

function createTooltipBox() {
  const tooltip = document.createElement("div");
  tooltip.setAttribute("role", "tooltip");
  tooltip.className = [
    "pointer-events-none fixed z-[9999] hidden max-w-[260px] whitespace-pre-line rounded-md border border-border",
    "bg-popover px-3 py-2 text-left font-retro text-xs leading-relaxed text-popover-foreground shadow-md",
  ].join(" ");
  document.body.appendChild(tooltip);
  return tooltip;
}

function placeTooltip(anchor: HTMLElement, tooltip: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const gap = 8;
  tooltip.style.left = `${Math.min(window.innerWidth - 280, Math.max(8, rect.left))}px`;
  tooltip.style.top = `${Math.min(window.innerHeight - 80, rect.bottom + gap)}px`;
}

function attachInfo(element: HTMLElement, label: string, lines: readonly string[], tooltip: HTMLElement) {
  if (element.hasAttribute(INFO_TARGET_ATTR)) return;
  element.setAttribute(INFO_TARGET_ATTR, "true");

  const info = getFocusableInfoButton(label);
  const content = makeTooltipContent(lines);
  let open = false;

  const show = () => {
    tooltip.textContent = content;
    tooltip.classList.remove("hidden");
    placeTooltip(info, tooltip);
    open = true;
  };
  const hide = () => {
    tooltip.classList.add("hidden");
    open = false;
  };
  const toggle = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    open ? hide() : show();
  };

  info.addEventListener("mouseenter", show);
  info.addEventListener("mouseleave", hide);
  info.addEventListener("focus", show);
  info.addEventListener("blur", hide);
  info.addEventListener("click", toggle);
  info.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") toggle(event);
    if (event.key === "Escape") hide();
  });

  element.appendChild(info);
}

function wireTooltips(tooltip: HTMLElement) {
  const pathname = window.location.pathname;

  if (pathname === "/create") {
    findByText(document, "button", "Create Draft").forEach((element) => {
      attachInfo(element, createPageTooltipCopy.createDraft.ariaLabel, createPageTooltipCopy.createDraft.lines, tooltip);
    });
  }

  if (!isPromotionRoute(pathname)) return;

  findByText(document, "button", "Get notified on launch").forEach((element) => {
    attachInfo(element, promotionTooltipCopy.armNotification.ariaLabel, promotionTooltipCopy.armNotification.lines, tooltip);
  });
  findByText(document, "button", "Notification armed").forEach((element) => {
    attachInfo(element, promotionTooltipCopy.armNotification.ariaLabel, promotionTooltipCopy.armNotification.lines, tooltip);
  });

  findByText(document, "div,h2,p", "Recon Signal").forEach((element) => {
    attachInfo(element, promotionTooltipCopy.promotionCard.ariaLabel, promotionTooltipCopy.promotionCard.lines, tooltip);
  });
  findByText(document, "div,p", "Draft traffic").forEach((element) => {
    attachInfo(element, promotionTooltipCopy.promotionCard.ariaLabel, promotionTooltipCopy.promotionCard.lines, tooltip);
  });

  findByText(document, "span,h2", "Identity").forEach((element) => {
    attachInfo(element, promotionEditTooltipCopy.identity.ariaLabel, promotionEditTooltipCopy.identity.lines, tooltip);
  });
  findByText(document, "span,h2", "Mission Statement").forEach((element) => {
    attachInfo(element, promotionEditTooltipCopy.mission.ariaLabel, promotionEditTooltipCopy.mission.lines, tooltip);
  });
  findByText(document, "span,h2", "Launch Strategy").forEach((element) => {
    attachInfo(element, promotionEditTooltipCopy.launchStrategy.ariaLabel, promotionEditTooltipCopy.launchStrategy.lines, tooltip);
  });
  findByText(document, "span,h2", "Comms Channels").forEach((element) => {
    attachInfo(element, promotionEditTooltipCopy.comms.ariaLabel, promotionEditTooltipCopy.comms.lines, tooltip);
  });
  findByText(document, "span,h2", "Docs + Creator Note").forEach((element) => {
    attachInfo(element, promotionEditTooltipCopy.docs.ariaLabel, promotionEditTooltipCopy.docs.lines, tooltip);
  });
  findByText(document, "span,h2,p", "Visibility").forEach((element) => {
    attachInfo(element, promotionEditTooltipCopy.visibility.ariaLabel, promotionEditTooltipCopy.visibility.lines, tooltip);
  });
  findByText(document, "div,p", "Readiness").forEach((element) => {
    attachInfo(element, promotionEditTooltipCopy.readiness.ariaLabel, promotionEditTooltipCopy.readiness.lines, tooltip);
  });
  findByText(document, "button", "Save draft").forEach((element) => {
    attachInfo(element, promotionEditTooltipCopy.saveChanges.ariaLabel, promotionEditTooltipCopy.saveChanges.lines, tooltip);
  });
  findByText(document, "button", "Save setup").forEach((element) => {
    attachInfo(element, promotionEditTooltipCopy.saveChanges.ariaLabel, promotionEditTooltipCopy.saveChanges.lines, tooltip);
  });
  findByText(document, "button", "Archive Draft").forEach((element) => {
    attachInfo(element, promotionEditTooltipCopy.archiveDraft.ariaLabel, promotionEditTooltipCopy.archiveDraft.lines, tooltip);
  });
}

export function PromotionInfoTooltips() {
  useEffect(() => {
    const tooltip = createTooltipBox();
    let raf = 0;

    const scheduleWire = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => wireTooltips(tooltip));
    };

    scheduleWire();
    const observer = new MutationObserver(scheduleWire);
    observer.observe(document.body, { childList: true, subtree: true });

    const closeOnOutsideTap = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(`[${INFO_MARK_ATTR}]`)) return;
      tooltip.classList.add("hidden");
    };
    document.addEventListener("pointerdown", closeOnOutsideTap, true);

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("pointerdown", closeOnOutsideTap, true);
      tooltip.remove();
      document.querySelectorAll(`[${INFO_MARK_ATTR}]`).forEach((node) => node.remove());
      document.querySelectorAll(`[${INFO_TARGET_ATTR}]`).forEach((node) => node.removeAttribute(INFO_TARGET_ATTR));
    };
  }, []);

  return null;
}
