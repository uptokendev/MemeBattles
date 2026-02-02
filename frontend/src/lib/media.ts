// Normalize token/campaign image URIs so they render correctly in browsers.
// Supports ipfs:// and ar:// in addition to http(s):// and relative paths.
export function resolveImageUri(uri?: string | null): string | undefined {
  const raw = String(uri ?? "").trim();
  if (!raw) return undefined;

  // ipfs://<cid>/<path> or ipfs://ipfs/<cid>/<path>
  if (raw.startsWith("ipfs://")) {
    let p = raw.slice("ipfs://".length);
    if (p.startsWith("ipfs/")) p = p.slice("ipfs/".length);
    // Use a public gateway. You can swap this later to your own gateway if desired.
    return `https://cloudflare-ipfs.com/ipfs/${p}`;
  }

  // ar://<txid>
  if (raw.startsWith("ar://")) {
    const tx = raw.slice("ar://".length);
    return `https://arweave.net/${tx}`;
  }

  // data URIs are fine
  if (raw.startsWith("data:")) return raw;

  // absolute URLs
  if (raw.startsWith("https://") || raw.startsWith("http://")) return raw;

  // relative URLs (e.g. /assets/..)
  if (raw.startsWith("/")) return raw;

  // Fall back: treat as relative (some CDNs give naked paths); callers can still choose placeholder
  return raw;
}
