import { startCanonicalCandleMaterializerLoop } from "./canonicalCandleMaterializer.js";
import { startCanonicalCandleRealtimeLoop } from "./canonicalCandleRealtime.js";
import { startSupportedFactoryDiscoveryLoop } from "./factoryDiscovery.js";
import { startMeteoraSwapIndexerLoop } from "./meteoraSwapIndexer.js";
import { startSolanaIndexerLoop } from "./solanaIndexer.js";
import { startSolanaRewardEventIndexerLoop } from "./solanaRewardEventIndexer.js";

startSupportedFactoryDiscoveryLoop();
startSolanaIndexerLoop();
startSolanaRewardEventIndexerLoop();
startMeteoraSwapIndexerLoop();
startCanonicalCandleMaterializerLoop();
startCanonicalCandleRealtimeLoop();
await import("./server.js");
