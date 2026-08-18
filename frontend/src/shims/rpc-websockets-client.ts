import { EventEmitter } from "eventemitter3";

type SocketMessage = {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
  notification?: string;
};

type SocketFactory = (address: string, options: Record<string, unknown>) => BrowserLikeSocket;

type BrowserLikeSocket = {
  send: (data: string, optionsOrCallback?: unknown, callback?: (error?: unknown) => void) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: (type: string, listener: (event: any) => void, options?: unknown) => void;
};

type DataPack = {
  encode: (message: SocketMessage) => string;
  decode: (message: string) => SocketMessage;
};

type QueueEntry = {
  promise: [(value: unknown) => void, (reason?: unknown) => void];
  timeout?: number;
};

const defaultDataPack: DataPack = {
  encode(message) {
    return JSON.stringify(message);
  },
  decode(message) {
    return JSON.parse(message) as SocketMessage;
  },
};

export default class CommonClient extends EventEmitter {
  private webSocketFactory: SocketFactory;
  private queue: Record<string, QueueEntry> = {};
  private rpcId = 0;
  private address: string;
  private autoconnect: boolean;
  private ready = false;
  private reconnect: boolean;
  private reconnectTimerId: number | undefined;
  private reconnectInterval: number;
  private maxReconnects: number;
  private restOptions: Record<string, unknown>;
  private currentReconnects = 0;
  private generateRequestId: (method?: string, params?: unknown) => number | string;
  private dataPack: DataPack;
  private socket: BrowserLikeSocket | undefined;

  constructor(
    webSocketFactory: SocketFactory,
    address = "ws://localhost:8080",
    options: Record<string, unknown> = {},
    generateRequestId?: (method?: string, params?: unknown) => number | string,
    dataPack?: DataPack,
  ) {
    super();
    const {
      autoconnect = true,
      reconnect = true,
      reconnect_interval = 1000,
      max_reconnects = 5,
      ...restOptions
    } = options as {
      autoconnect?: boolean;
      reconnect?: boolean;
      reconnect_interval?: number;
      max_reconnects?: number;
    };

    this.webSocketFactory = webSocketFactory;
    this.address = address;
    this.autoconnect = autoconnect;
    this.reconnect = reconnect;
    this.reconnectInterval = reconnect_interval;
    this.maxReconnects = max_reconnects;
    this.restOptions = restOptions;
    this.generateRequestId = generateRequestId || (() => ++this.rpcId);
    this.dataPack = dataPack || defaultDataPack;

    if (this.autoconnect) {
      this._connect(this.address, {
        autoconnect: this.autoconnect,
        reconnect: this.reconnect,
        reconnect_interval: this.reconnectInterval,
        max_reconnects: this.maxReconnects,
        ...this.restOptions,
      });
    }
  }

  connect() {
    if (this.socket) return;
    this._connect(this.address, {
      autoconnect: this.autoconnect,
      reconnect: this.reconnect,
      reconnect_interval: this.reconnectInterval,
      max_reconnects: this.maxReconnects,
      ...this.restOptions,
    });
  }

  call(method: string, params?: unknown, timeout?: number | Record<string, unknown> | null, wsOpts?: unknown) {
    if (!wsOpts && timeout && typeof timeout === "object") {
      wsOpts = timeout;
      timeout = null;
    }

    return new Promise((resolve, reject) => {
      if (!this.ready || !this.socket) {
        reject(new Error("socket not ready"));
        return;
      }

      const rpcId = this.generateRequestId(method, params);
      const message: SocketMessage = {
        jsonrpc: "2.0",
        method,
        params: params || undefined,
        id: rpcId,
      } as SocketMessage;

      this.socket.send(this.dataPack.encode(message), wsOpts, (error?: unknown) => {
        if (error) {
          reject(error);
          return;
        }

        this.queue[String(rpcId)] = { promise: [resolve, reject] };
        if (typeof timeout === "number" && timeout > 0) {
          this.queue[String(rpcId)].timeout = window.setTimeout(() => {
            delete this.queue[String(rpcId)];
            reject(new Error("reply timeout"));
          }, timeout);
        }
      });
    });
  }

  async login(params: unknown) {
    const response = await this.call("rpc.login", params);
    if (!response) throw new Error("authentication failed");
    return response;
  }

  async listMethods() {
    return this.call("__listMethods");
  }

  notify(method: string, params?: unknown) {
    return new Promise<void>((resolve, reject) => {
      if (!this.ready || !this.socket) {
        reject(new Error("socket not ready"));
        return;
      }
      const message: SocketMessage = { jsonrpc: "2.0", method, params } as SocketMessage;
      this.socket.send(this.dataPack.encode(message), (error?: unknown) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async subscribe(event: string | string[]) {
    const events = typeof event === "string" ? [event] : event;
    const result = (await this.call("rpc.on", events)) as Record<string, string>;
    if (typeof event === "string" && result[event] !== "ok") {
      throw new Error(`Failed subscribing to an event '${event}' with: ${result[event]}`);
    }
    return result;
  }

  async unsubscribe(event: string | string[]) {
    const events = typeof event === "string" ? [event] : event;
    const result = (await this.call("rpc.off", events)) as Record<string, string>;
    if (typeof event === "string" && result[event] !== "ok") {
      throw new Error(`Failed unsubscribing from an event with: ${result[event]}`);
    }
    return result;
  }

  close(code?: number, reason?: string) {
    this.socket?.close(code || 1000, reason);
  }

  private _connect(address: string, options: Record<string, unknown>) {
    window.clearTimeout(this.reconnectTimerId);
    this.socket = this.webSocketFactory(address, options);

    this.socket.addEventListener("open", () => {
      this.ready = true;
      this.emit("open");
      this.currentReconnects = 0;
    });

    this.socket.addEventListener("message", (event: { data: string | ArrayBuffer }) => {
      let message = event.data;
      if (message instanceof ArrayBuffer) {
        message = new TextDecoder().decode(new Uint8Array(message));
      }

      let decoded: SocketMessage;
      try {
        decoded = this.dataPack.decode(String(message));
      } catch {
        return;
      }

      if (decoded.notification && this.listeners(decoded.notification).length) {
        const params = decoded.params;
        if (!params || (typeof params === "object" && !Array.isArray(params) && Object.keys(params as object).length === 0)) {
          this.emit(decoded.notification);
          return;
        }
        if (Array.isArray(params)) {
          Promise.resolve().then(() => this.emit(decoded.notification as string, ...params));
          return;
        }
        Promise.resolve().then(() => this.emit(decoded.notification as string, params));
        return;
      }

      const key = String(decoded.id ?? "");
      if (!this.queue[key]) {
        if (decoded.method && decoded.params) {
          Promise.resolve().then(() => this.emit(decoded.method as string, decoded.params));
        }
        return;
      }

      if (("error" in decoded) === ("result" in decoded)) {
        this.queue[key].promise[1](new Error('Server response malformed. Response must include either "result" or "error", but not both.'));
      }
      if (this.queue[key].timeout) {
        window.clearTimeout(this.queue[key].timeout);
      }
      if (decoded.error) {
        this.queue[key].promise[1](decoded.error);
      } else {
        this.queue[key].promise[0](decoded.result);
      }
      delete this.queue[key];
    });

    this.socket.addEventListener("error", (error: unknown) => {
      this.emit("error", error);
    });

    this.socket.addEventListener("close", (event: { code: number; reason: string }) => {
      if (this.ready) {
        window.setTimeout(() => this.emit("close", event.code, event.reason), 0);
      }
      this.ready = false;
      this.socket = undefined;
      if (event.code === 1000) return;
      this.currentReconnects += 1;
      if (this.reconnect && (this.maxReconnects > this.currentReconnects || this.maxReconnects === 0)) {
        this.reconnectTimerId = window.setTimeout(() => this._connect(address, options), this.reconnectInterval);
      }
    });
  }
}
