# MemeBattles wallet connection upgrade

This package replaces the old hard-coded wallet modal with a 2026-style EVM wallet flow:

- Detects EIP-6963 wallet providers and legacy injected providers.
- Lists only detected wallets in the connect modal.
- Keeps a link to trusted EVM wallet directories when nothing is detected.
- Uses `eth_accounts` for hydration and `eth_requestAccounts` only after the user selects a wallet.
- Keeps your existing `ethers` provider/signer API, so existing launchpad code should continue to work.
- Adds no new npm dependencies.

## Files to copy

Copy these into the repo, preserving paths:

- `frontend/src/hooks/useWallet.ts`
- `frontend/src/contexts/WalletContext.tsx`
- `frontend/src/components/wallet/ConnectWalletModal.tsx`

## Patch TopBar

From the repository root, after copying the files above, run:

```bash
node apply-wallet-connection-patch.mjs
```

The patch script updates `frontend/src/components/TopBar.tsx` by:

1. removing the inline `createPortal` wallet modal,
2. removing the old `WalletType`/`toast` modal handler,
3. importing `ConnectWalletModal`, and
4. rendering `<ConnectWalletModal open={walletModalOpen} onOpenChange={setWalletModalOpen} />`.

If the script says `TopBar.tsx did not change`, make these manual edits:

```tsx
import { useWallet } from "@/contexts/WalletContext";
import { ConnectWalletModal } from "@/components/wallet/ConnectWalletModal";
```

Remove the old `handleWalletSelect` function and replace the entire old `{/* Wallet selection modal */} ... createPortal(..., document.body)}` block with:

```tsx
{/* Wallet selection modal */}
<ConnectWalletModal open={walletModalOpen} onOpenChange={setWalletModalOpen} />
```
