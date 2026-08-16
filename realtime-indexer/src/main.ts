import { startCanonicalCandleRealtimeLoop } from "./canonicalCandleRealtime.js";
import { startSupportedFactoryDiscoveryLoop } from "./factoryDiscovery.js";
import { startMeteoraSwapIndexerLoop } from "./meteoraSwapIndexer.js";
import { startSolanaIndexerLoop } from "./solanaIndexer.js";

startSupportedFactoryDiscoveryLoop();
startSolanaIndexerLoop();
startMeteoraSwapIndexerLoop();
startCanonicalCandleRealtimeLoop();
await import("./server.js");
