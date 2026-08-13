import { startSupportedFactoryDiscoveryLoop } from "./factoryDiscovery.js";
import { startSolanaIndexerLoop } from "./solanaIndexer.js";

startSupportedFactoryDiscoveryLoop();
startSolanaIndexerLoop();
await import("./server.js");
