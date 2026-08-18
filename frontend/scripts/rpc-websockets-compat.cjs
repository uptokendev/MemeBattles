const Module = require("node:module");

const originalLoad = Module._load;
const candidateRequests = [
  "rpc-websockets/dist/lib/client",
  "rpc-websockets/dist/lib/client.cjs",
  "rpc-websockets/dist/lib/client.js",
  "rpc-websockets/dist/lib/client/websocket",
  "rpc-websockets/dist/lib/client/websocket.cjs",
  "rpc-websockets/dist/lib/client/websocket.js",
];

function pickCommonClient(mod) {
  if (!mod) return null;
  if (typeof mod.CommonClient === "function") return mod.CommonClient;
  if (typeof mod.Client === "function") return mod.Client;
  if (typeof mod.default === "function") return mod.default;
  if (typeof mod.default?.CommonClient === "function") return mod.default.CommonClient;
  if (typeof mod.default?.Client === "function") return mod.default.Client;
  return null;
}

function resolveCommonClient(parent, isMain) {
  for (const request of candidateRequests) {
    try {
      const mod = originalLoad(request, parent, isMain);
      const CommonClient = pickCommonClient(mod);
      if (CommonClient) return CommonClient;
    } catch {
      // keep trying
    }
  }
  return null;
}

Module._load = function patchedRpcWebsockets(request, parent, isMain) {
  const loaded = originalLoad.apply(this, arguments);
  if (request !== "rpc-websockets") return loaded;

  const CommonClient = pickCommonClient(loaded) || resolveCommonClient(parent, isMain);
  if (!CommonClient || loaded?.CommonClient) return loaded;

  try {
    loaded.CommonClient = CommonClient;
    return loaded;
  } catch {
    return { ...loaded, CommonClient };
  }
};
