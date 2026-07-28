#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, "../src/lib/draftApi.ts");

const PATCHED_MARKERS = [
  'const OWNER_SESSION_CACHE_PREFIX = "mwz:draft-owner-session:v3:";',
  'const LEGACY_OWNER_SESSION_CACHE_PREFIX = "mwz:draft-owner-session:v2:";',
  "if (!auth.nonce || !auth.message || !auth.signature) return null;",
];

function isPatched(source) {
  return (
    PATCHED_MARKERS.every((marker) => source.includes(marker)) &&
    !source.includes("buildConnectedWalletDraftAuth") &&
    !source.includes("CONNECTED_OWNER_ACTIONS")
  );
}

function replaceExactly(source, before, after, label) {
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${matches}`);
  }
  return source.replace(before, after);
}

const original = fs.readFileSync(target, "utf8");
const hadCrLf = original.includes("\r\n");
let source = original.replace(/\r\n/g, "\n");

if (isPatched(source)) {
  console.log(`[draft-owner-auth-fix] already patched ${target}`);
  process.exit(0);
}

source = replaceExactly(
  source,
  `const OWNER_SESSION_CACHE_PREFIX = "mwz:draft-owner-session:v2:";\nconst OWNER_SESSION_SAFETY_WINDOW_MS = 15 * 1000;\nconst OWNER_SESSION_MAX_AGE_MS = 9 * 60 * 1000;\nconst CONNECTED_OWNER_ACTIONS = new Set<DraftAuthAction>([\n  "read_draft",\n  "save_promotion",\n  "publish_promotion",\n  "archive_draft",\n  "deploy_draft",\n]);\n\nfunction buildConnectedWalletDraftAuth(input: {\n  action: DraftAuthAction;\n  walletAddress: string;\n  chainId: number;\n  draftId?: string | null;\n}): DraftActionAuth {\n  return {\n    action: input.action,\n    walletAddress: normalizeWallet(input.walletAddress),\n    chainId: Number(input.chainId),\n    draftId: input.draftId || null,\n    nonce: "",\n    message: "",\n    signature: "",\n  };\n}\n`,
  `const OWNER_SESSION_CACHE_PREFIX = "mwz:draft-owner-session:v3:";\nconst LEGACY_OWNER_SESSION_CACHE_PREFIX = "mwz:draft-owner-session:v2:";\nconst OWNER_SESSION_SAFETY_WINDOW_MS = 15 * 1000;\nconst OWNER_SESSION_MAX_AGE_MS = 9 * 60 * 1000;\n`,
  "remove unsigned connected-wallet auth bypass",
);

source = replaceExactly(
  source,
  `    if (String(auth.draftId || "") !== input.draftId) return null;\n    if (cachedAt <= 0 || now - cachedAt > OWNER_SESSION_MAX_AGE_MS) return null;`,
  `    if (String(auth.draftId || "") !== input.draftId) return null;\n    if (!auth.nonce || !auth.message || !auth.signature) return null;\n    if (cachedAt <= 0 || now - cachedAt > OWNER_SESSION_MAX_AGE_MS) return null;`,
  "reject unsigned cached owner sessions",
);

source = replaceExactly(
  source,
  `  try {\n    window.sessionStorage.removeItem(ownerSessionCacheKey(input));\n  } catch {`,
  `  try {\n    window.sessionStorage.removeItem(ownerSessionCacheKey(input));\n    window.sessionStorage.removeItem(\n      \`\${LEGACY_OWNER_SESSION_CACHE_PREFIX}\${Number(input.chainId)}:\${normalizeWallet(input.walletAddress)}:\${input.draftId}\`,\n    );\n  } catch {`,
  "clear legacy owner session cache",
);

source = replaceExactly(
  source,
  `  // Match the backend migration behavior: once the creator wallet is connected,\n  // owner-only draft actions do not need another personal_sign prompt.\n  if (input.useOwnerSession || CONNECTED_OWNER_ACTIONS.has(input.action)) {\n    return buildConnectedWalletDraftAuth({\n      action: input.action,\n      draftId: input.draftId,\n      walletAddress,\n      chainId,\n    });\n  }\n\n`,
  "",
  "restore signed owner-session flow",
);

if (!isPatched(source)) {
  throw new Error("Draft owner-auth repair did not produce the required signed-session source state.");
}

const output = hadCrLf ? source.replace(/\n/g, "\r\n") : source;
fs.writeFileSync(target, output);
console.log(`[draft-owner-auth-fix] patched ${target}`);
