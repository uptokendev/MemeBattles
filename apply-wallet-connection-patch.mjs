#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const topBarPath = join(repoRoot, "frontend", "src", "components", "TopBar.tsx");

if (!existsSync(topBarPath)) {
  console.error(`[wallet-patch] Could not find ${topBarPath}`);
  process.exit(1);
}

let content = readFileSync(topBarPath, "utf8");
const original = content;

content = content.replace(/\s*import\s+\{\s*createPortal\s*\}\s+from\s+["']react-dom["'];?\s*/g, "\n");
content = content.replace(
  /import\s+\{\s*useWallet\s*,\s*type\s+WalletType\s*\}\s+from\s+["']@\/contexts\/WalletContext["'];/,
  'import { useWallet } from "@/contexts/WalletContext";\nimport { ConnectWalletModal } from "@/components/wallet/ConnectWalletModal";',
);
content = content.replace(/\s*import\s+\{\s*toast\s*\}\s+from\s+["']sonner["'];?\s*/g, "\n");
content = content.replace(
  /\s*const\s+handleWalletSelect\s*=\s*async\s*\(\s*type\s*:\s*WalletType\s*\)\s*=>\s*\{[\s\S]*?\};\s*\/\/\s*Load campaigns for ticker/,
  "\n  // Load campaigns for ticker",
);
content = content.replace(
  /\s*\{\/\*\s*Wallet selection modal\s*\*\/\}\s*\{\s*walletModalOpen\s*&&\s*typeof\s+document\s*!==\s*["']undefined["']\s*&&\s*createPortal\([\s\S]*?,\s*document\.body\s*\)\s*\}/,
  '\n      {/* Wallet selection modal */}\n      <ConnectWalletModal open={walletModalOpen} onOpenChange={setWalletModalOpen} />',
);

if (content === original) {
  console.error("[wallet-patch] TopBar.tsx did not change. The source may have diverged; apply the import/modal edits manually.");
  process.exit(1);
}

writeFileSync(topBarPath, content, "utf8");
console.log("[wallet-patch] Updated frontend/src/components/TopBar.tsx");
