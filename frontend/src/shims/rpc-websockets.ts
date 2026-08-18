import CommonClient from "./rpc-websockets-client";
import createWebSocket from "./rpc-websockets-websocket-browser";

type DataPack = {
  encode: (message: unknown) => string;
  decode: (message: string) => unknown;
};

export { CommonClient };

export class Client extends CommonClient {
  constructor(
    address = "ws://localhost:8080",
    options: Record<string, unknown> = {},
    generateRequestId?: (method?: string, params?: unknown) => number | string,
    dataPack?: DataPack,
  ) {
    super(createWebSocket, address, options, generateRequestId, dataPack);
  }
}

export const WebSocket = createWebSocket;

const rpcWebsockets = {
  Client,
  CommonClient,
  WebSocket,
};

export default rpcWebsockets;
