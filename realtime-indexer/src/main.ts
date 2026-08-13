import { startSupportedFactoryDiscoveryLoop } from "./factoryDiscovery.js";
import { startMeteoraSwapIndexerLoop } from "./meteoraSwapIndexer.js";
import { startSolanaIndexerLoop } from "./solanaIndexer.js";

startSupportedFactoryDiscoveryLoop();
startSolanaIndexerLoop();
startMeteoraSwapIndexerLoop();
await import("./server.js");
