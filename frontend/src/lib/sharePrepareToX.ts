/**
 * Share a Prepare Mode campaign to X with the generated share-card image.
 *
 * X web intents cannot attach media — only text + URL (link preview / OG card).
 * Apps like Binance attach a real image via native share or paste.
 *
 * Strategy (best → fallback):
 * 1) Web Share API with image file (mobile: pick X → image + text attached)
 * 2) Copy PNG to clipboard + open X compose with text/link (desktop: Ctrl/Cmd+V)
 * 3) Download PNG + open X compose with text/link
 */

export type SharePrepareToXInput = {
  /** Absolute URL of the share-card PNG */
  imageUrl: string;
  /** Promotion page URL (what people should click) */
  pageUrl: string;
  /** Pre-built tweet body without the URL */
  tweetText: string;
  /** Optional filename for the PNG */
  fileName?: string;
};

export type SharePrepareToXResult =
  | { method: "web-share" }
  | { method: "clipboard-image"; openedComposer: boolean }
  | { method: "download-fallback"; openedComposer: boolean }
  | { method: "intent-only"; openedComposer: boolean };

function buildComposerUrl(textWithUrl: string) {
  // Prefer x.com; intent only supports text (and optional url — we embed url in text once).
  return `https://x.com/intent/tweet?text=${encodeURIComponent(textWithUrl)}`;
}

function openComposer(textWithUrl: string) {
  const href = buildComposerUrl(textWithUrl);
  const win = window.open(href, "_blank", "noopener,noreferrer");
  return Boolean(win);
}

function triggerDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}

async function fetchShareCardBlob(imageUrl: string): Promise<Blob> {
  const res = await fetch(imageUrl, {
    mode: "cors",
    credentials: "omit",
    cache: "no-cache",
  });
  if (!res.ok) {
    throw new Error(`Share card image failed (${res.status})`);
  }
  const blob = await res.blob();
  if (!blob || blob.size < 32) {
    throw new Error("Share card image was empty");
  }
  // Normalize type for Web Share / clipboard (some proxies omit content-type).
  if (blob.type === "image/png" || blob.type === "image/jpeg" || blob.type === "image/webp") {
    return blob;
  }
  return new Blob([blob], { type: "image/png" });
}

async function tryWebShare(file: File, textWithUrl: string, pageUrl: string): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;

  const payloadWithFiles: ShareData = {
    files: [file],
    text: textWithUrl,
    title: "MemeWarzone",
  };

  try {
    if (typeof navigator.canShare === "function" && !navigator.canShare(payloadWithFiles)) {
      return false;
    }
    await navigator.share(payloadWithFiles);
    return true;
  } catch (err) {
    // User cancelled — treat as handled so we don't open a second composer.
    if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "AbortError") {
      return true;
    }
  }

  // Some browsers accept share without files only — not useful for our image goal.
  try {
    await navigator.share({ text: textWithUrl, url: pageUrl, title: "MemeWarzone" });
    return true;
  } catch {
    return false;
  }
}

async function tryClipboardImage(blob: Blob): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard || typeof ClipboardItem === "undefined") {
    return false;
  }
  try {
    // Safari often requires a Promise-valued ClipboardItem.
    const item = new ClipboardItem({
      "image/png": Promise.resolve(blob),
    });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    try {
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Best-effort share of promotion page + share-card PNG to X.
 */
export async function sharePrepareToX(input: SharePrepareToXInput): Promise<SharePrepareToXResult> {
  const pageUrl = String(input.pageUrl || "").trim();
  const tweetText = String(input.tweetText || "").trim();
  const imageUrl = String(input.imageUrl || "").trim();
  const fileName =
    String(input.fileName || "").trim() ||
    `memewarzone-${pageUrl.split("/").filter(Boolean).pop() || "prepare"}-share-card.png`;

  // One URL in the body (avoid intent url= + text both adding the same link).
  const textWithUrl = pageUrl
    ? tweetText.includes(pageUrl)
      ? tweetText
      : `${tweetText}\n\n${pageUrl}`
    : tweetText;

  if (!imageUrl) {
    const opened = openComposer(textWithUrl);
    return { method: "intent-only", openedComposer: opened };
  }

  let blob: Blob;
  try {
    blob = await fetchShareCardBlob(imageUrl);
  } catch {
    const opened = openComposer(textWithUrl);
    return { method: "intent-only", openedComposer: opened };
  }

  const file = new File([blob], fileName, { type: blob.type || "image/png" });

  // 1) Native share sheet with image (mobile / supported desktop).
  if (await tryWebShare(file, textWithUrl, pageUrl)) {
    return { method: "web-share" };
  }

  // 2) Copy image → open X compose with text (user pastes image).
  if (await tryClipboardImage(blob)) {
    const opened = openComposer(textWithUrl);
    return { method: "clipboard-image", openedComposer: opened };
  }

  // 3) Download PNG + open compose (user attaches downloaded file).
  try {
    triggerDownload(blob, fileName);
  } catch {
    // ignore
  }
  const opened = openComposer(textWithUrl);
  return { method: "download-fallback", openedComposer: opened };
}

export function sharePrepareToXToastMessage(result: SharePrepareToXResult): string {
  switch (result.method) {
    case "web-share":
      return "Share sheet opened — pick X to post with your share card image.";
    case "clipboard-image":
      return "Share card image copied. In the X post, paste it (Ctrl+V / Cmd+V), then Post.";
    case "download-fallback":
      return "Share card downloaded. Attach that PNG in the X post (image button), then Post.";
    case "intent-only":
    default:
      return "X compose opened. If no image appears, use Download PNG and attach it to the post.";
  }
}
