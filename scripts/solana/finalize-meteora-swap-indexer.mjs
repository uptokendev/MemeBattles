import fs from "node:fs";

const mainPath = "realtime-indexer/src/main.ts";
let source = fs.readFileSync(mainPath, "utf8");

const before = `import { startSupportedFactoryDiscoveryLoop } from "./factoryDiscovery.js";\nimport { startSolanaIndexerLoop } from "./solanaIndexer.js";\n\nstartSupportedFactoryDiscoveryLoop();\nstartSolanaIndexerLoop();\nawait import("./server.js");`;
const after = `import { startSupportedFactoryDiscoveryLoop } from "./factoryDiscovery.js";\nimport { startMeteoraSwapIndexerLoop } from "./meteoraSwapIndexer.js";\nimport { startSolanaIndexerLoop } from "./solanaIndexer.js";\n\nstartSupportedFactoryDiscoveryLoop();\nstartSolanaIndexerLoop();\nstartMeteoraSwapIndexerLoop();\nawait import("./server.js");`;

const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`Meteora indexer startup: expected exactly one match, found ${count}`);
source = source.replace(before, after);
fs.writeFileSync(mainPath, source);
console.log("[meteora-swap-indexer-finalizer] startup transform applied");
