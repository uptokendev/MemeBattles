Keep dev live, but fix the Solana wallet inject properly without breaking reloads.

The mistake was auto-connecting injected Solana providers on page load. We need multi-wallet detection, not auto-connect.

Correct dev strategy
Rule 1

Never call this automatically:

provider.connect({ onlyIfTrusted: true })

Not on import.
Not in useEffect.
Not on refresh.
Not in ensureSolanaListeners.

That is why Solflare opens instantly.

Rule 2

On page load, only:

detect installed wallets
read stored wallet address from localStorage
display existing address if stored
Rule 3

Only connect when user clicks a wallet row:

await provider.connect({ onlyIfTrusted: false })
What we change now

In frontend/src/lib/solanaWallet.ts:

1. Keep multi-wallet detection

Detect:

window.phantom?.solana
window.solana if Phantom
window.solflare
window.backpack?.solana
window.glowSolana
2. Remove all silent auto-connect

Remove this everywhere:

provider.connect({ onlyIfTrusted: true } as any)
3. Use WeakSet for listeners

Do not mutate provider objects:

(provider as any).__mwzListenersAttached = true

Use:

const attachedSolanaProviders = new WeakSet<object>();
4. On reload, do not open wallet popup

Only sync provider.publicKey if already present:

const key = provider.publicKey?.toString?.() || "";

No connect call.

Exact fix to make now

In solanaWallet.ts, replace ensureSolanaListeners() with this:

const attachedSolanaProviders = new WeakSet<object>();

export function ensureSolanaListeners(): void {
  const wallets = detectSolanaWallets();

  wallets.forEach((wallet) => {
    const provider = wallet.provider;

    if (!provider || typeof provider !== "object") return;
    if (attachedSolanaProviders.has(provider as object)) return;

    attachedSolanaProviders.add(provider as object);

    const sync = () => {
      const key = normalizePublicKey(provider.publicKey?.toString?.() || "");
      notifySolanaWalletChanged(key, wallet);
    };

    try {
      provider.on?.("connect", sync);
    } catch {}

    try {
      provider.on?.("disconnect", () => notifySolanaWalletChanged(""));
    } catch {}

    try {
      provider.on?.("accountChanged", sync);
    } catch {}

    // Important:
    // Do NOT call provider.connect({ onlyIfTrusted: true }) here.
    // Some wallets, especially Solflare, may open or focus the wallet on reload.
    // We only listen and read provider.publicKey if it already exists.
    sync();
  });
}

Then at the bottom of solanaWallet.ts, make sure it is only this:

if (typeof window !== "undefined") {
  ensureSolanaListeners();
  window.setTimeout(() => ensureSolanaListeners(), 50);
  window.setTimeout(() => ensureSolanaListeners(), 200);
  window.setTimeout(() => ensureSolanaListeners(), 800);
  window.addEventListener("focus", () => ensureSolanaListeners());
}

And make sure there is no provider.connect({ onlyIfTrusted: true }) anywhere in the file.

Search:

Select-String -Path .\src\lib\solanaWallet.ts -Pattern "onlyIfTrusted: true"

Should return nothing.

Why Solflare did not show in modal

That likely means detectSolanaWallets() is not detecting the right Solflare provider shape.

Update the Solflare detection to this:

addWallet(wallets, seen, w.solflare ? {
  id: "solflare",
  name: "Solflare",
  icon: "☀️",
  provider: w.solflare,
} : null);

addWallet(wallets, seen, w.solana?.isSolflare ? {
  id: "solflare",
  name: "Solflare",
  icon: "☀️",
  provider: w.solana,
} : null);

So Solflare can be found through either:

window.solflare
window.solana.isSolflare
Test order

After this:

npm run build
npm run dev:hybrid

Then:

Install Solflare
Reload page
Confirm: no Solflare popup
Open Connect Wallet modal
Confirm: Solflare appears
Click Solflare
Confirm: Solflare opens only after click

This is the correct live-dev path.

Ok lets start
Nagedacht gedurende 4s

Start with frontend/src/lib/solanaWallet.ts.

Step 1 — search and remove auto-connect

Search:

Select-String -Path .\src\lib\solanaWallet.ts -Pattern "onlyIfTrusted: true"

Remove every block like this:

provider.connect({ onlyIfTrusted: true } as any)

or:

p.connect!({ onlyIfTrusted: true } as any)
Step 2 — replace ensureSolanaListeners

In solanaWallet.ts, add this above the function:

const attachedSolanaProviders = new WeakSet<object>();

Then replace the full ensureSolanaListeners() function with:

export function ensureSolanaListeners(): void {
  const wallets = detectSolanaWallets();

  wallets.forEach((wallet) => {
    const provider = wallet.provider;

    if (!provider || typeof provider !== "object") return;
    if (attachedSolanaProviders.has(provider as object)) return;

    attachedSolanaProviders.add(provider as object);

    const sync = () => {
      const key = normalizePublicKey(provider.publicKey?.toString?.() || "");
      notifySolanaWalletChanged(key, wallet);
    };

    try {
      provider.on?.("connect", sync);
    } catch {}

    try {
      provider.on?.("disconnect", () => notifySolanaWalletChanged(""));
    } catch {}

    try {
      provider.on?.("accountChanged", sync);
    } catch {}

    // Read existing publicKey only. Never auto-connect on reload.
    sync();
  });
}
Step 3 — add Solflare detection fallback

Inside detectSolanaWallets(), make sure you have both:

addWallet(wallets, seen, w.solflare ? {
  id: "solflare",
  name: "Solflare",
  icon: "☀️",
  provider: w.solflare,
} : null);

addWallet(wallets, seen, w.solana?.isSolflare ? {
  id: "solflare",
  name: "Solflare",
  icon: "☀️",
  provider: w.solana,
} : null);

Then run:

npm run build
npm run dev:hybrid