/**
 * Share a Prepare Mode campaign to X with the generated share-card image.
 *
 * X web intents cannot attach media — only text + URL (link preview / OG card).
 * Desktop contest flow is therefore guided:
 *   1) Download the PNG
 *   2) Open X compose with text + promotion page link
 *   3) User attaches the downloaded image in X
 *
 * On mobile, Web Share with a File can hand the PNG to the X app when available.
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
  /**
   * `guided` (default): always download PNG, then open X (clearest for contest).
   * `auto`: try Web Share / clipboard first, then download fallback.
   */
  mode?: "guided" | "auto";
};

export type SharePrepareToXResult =
  | { method: "web-share" }
  | { method: "clipboard-image"; openedComposer: boolean }
  | { method: "download-and-compose"; openedComposer: boolean; downloaded: boolean }
  | { method: "intent-only"; openedComposer: boolean };

export function buildXComposerUrl(textWithUrl: string) {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(textWithUrl)}`;
}

export function buildTweetBody(tweetText: string, pageUrl: string) {
  const text = String(tweetText || "").trim();
  const url = String(pageUrl || "").trim();
  if (!url) return text;
  if (!text) return url;
  return text.includes(url) ? text : `${text}\n\n${url}`;
}

function openComposer(textWithUrl: string) {
  const href = buildXComposerUrl(textWithUrl);
  const win = window.open(href, "_blank", "noopener,noreferrer");
  return Boolean(win);
}

export function triggerDownload(blob: Blob, fileName: string) {
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

export async function fetchShareCardBlob(imageUrl: string): Promise<Blob> {
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
    if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "AbortError") {
      return true;
    }
  }

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

/** Download share-card PNG only (step 1 of guided flow). */
export async function downloadPrepareShareCard(input: {
  imageUrl: string;
  fileName?: string;
}): Promise<{ fileName: string }> {
  const imageUrl = String(input.imageUrl || "").trim();
  if (!imageUrl) throw new Error("Missing share card URL");
  const fileName =
    String(input.fileName || "").trim() || "memewarzone-prepare-share-card.png";
  const blob = await fetchShareCardBlob(imageUrl);
  triggerDownload(blob, fileName);
  return { fileName };
}

/** Open X compose with standard text + promotion page link (step 2). */
export function openPrepareXComposer(input: { tweetText: string; pageUrl: string }): boolean {
  const textWithUrl = buildTweetBody(input.tweetText, input.pageUrl);
  return openComposer(textWithUrl);
}

/**
 * Best-effort share of promotion page + share-card PNG to X.
 * Default `guided` mode matches contest UX: download then open compose.
 */
export async function sharePrepareToX(input: SharePrepareToXInput): Promise<SharePrepareToXResult> {
  const pageUrl = String(input.pageUrl || "").trim();
  const tweetText = String(input.tweetText || "").trim();
  const imageUrl = String(input.imageUrl || "").trim();
  const mode = input.mode || "guided";
  const fileName =
    String(input.fileName || "").trim() ||
    `memewarzone-${pageUrl.split("/").filter(Boolean).pop() || "prepare"}-share-card.png`;

  const textWithUrl = buildTweetBody(tweetText, pageUrl);

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

  if (mode === "auto") {
    if (await tryWebShare(file, textWithUrl, pageUrl)) {
      return { method: "web-share" };
    }
    if (await tryClipboardImage(blob)) {
      const opened = openComposer(textWithUrl);
      return { method: "clipboard-image", openedComposer: opened };
    }
  } else {
    // Guided: on mobile, still try native share first (image + text together).
    const isCoarsePointer =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (isCoarsePointer && (await tryWebShare(file, textWithUrl, pageUrl))) {
      return { method: "web-share" };
    }
  }

  // Contest-clear path: download PNG, then open X with text.
  try {
    triggerDownload(blob, fileName);
  } catch {
    const opened = openComposer(textWithUrl);
    return { method: "intent-only", openedComposer: opened };
  }

  // Small delay so the download starts before the tab switch on some browsers.
  await new Promise((r) => window.setTimeout(r, 350));
  const opened = openComposer(textWithUrl);
  return { method: "download-and-compose", openedComposer: opened, downloaded: true };
}

export function sharePrepareToXToastMessage(result: SharePrepareToXResult): string {
  switch (result.method) {
    case "web-share":
      return "Share sheet opened — pick X to post with your share card image.";
    case "clipboard-image":
      return "Share card copied. In X, paste it (Ctrl+V / Cmd+V), then Post.";
    case "download-and-compose":
      return "Share card downloaded. In X: click the image button → select the downloaded PNG → Post.";
    case "intent-only":
    default:
      return "X compose opened. Download the share card first, then attach it in the post.";
  }
}
