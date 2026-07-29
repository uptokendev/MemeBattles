import { startSupportedFactoryDiscoveryLoop } from "./factoryDiscovery.js";

startSupportedFactoryDiscoveryLoop();
await import("./server.js");
