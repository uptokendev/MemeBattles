import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import ts from "typescript";

const files = [
  "src/lib/solanaCreateAuthorizationV4.ts",
  "src/lib/solanaCreateCampaignV4Plan.ts",
];

let failed = false;
for (const relativePath of files) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const result = ts.transpileModule(source, {
    fileName: absolutePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      isolatedModules: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  });

  const diagnostics = result.diagnostics || [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    failed = true;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    if (diagnostic.file && diagnostic.start != null) {
      const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      console.error(`${relativePath}:${location.line + 1}:${location.character + 1}: ${message}`);
    } else {
      console.error(`${relativePath}: ${message}`);
    }
  }

  if (!diagnostics.some((item) => item.category === ts.DiagnosticCategory.Error)) {
    console.log(`[solana-v4-client] ${relativePath}: OK`);
  }
}

if (failed) process.exit(1);
