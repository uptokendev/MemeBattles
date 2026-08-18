type JsonRpcId = string | number | null;
type JsonRpcParams = unknown[] | Record<string, unknown>;

type CallServerCallback = (err?: Error | null, response?: string) => void;
type CallServer = (request: string, callback: CallServerCallback) => void;

type ClientOptions = {
  reviver?: ((key: string, value: unknown) => unknown) | null;
  replacer?: ((key: string, value: unknown) => unknown) | null;
  generator?: (request?: unknown, options?: ClientOptions) => JsonRpcId;
  version?: number;
  notificationIdNull?: boolean;
};

type JsonRpcRequest = {
  method?: string;
  jsonrpc?: string;
  params?: JsonRpcParams;
  id?: JsonRpcId;
};

function nextRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function generateRequest(
  method: string,
  params: JsonRpcParams | undefined,
  id: JsonRpcId | undefined,
  options: ClientOptions = {},
): JsonRpcRequest {
  if (typeof method !== "string") {
    throw new TypeError(`${String(method)} must be a string`);
  }

  const version = typeof options.version === "number" ? options.version : 2;
  if (version !== 1 && version !== 2) {
    throw new TypeError(`${version} must be 1 or 2`);
  }

  const request: JsonRpcRequest = { method };
  if (version === 2) request.jsonrpc = "2.0";

  if (params) {
    if (typeof params !== "object") {
      throw new TypeError(`${String(params)} must be an object, array or omitted`);
    }
    request.params = params;
  }

  if (typeof id === "undefined") {
    const generator = typeof options.generator === "function" ? options.generator : nextRequestId;
    request.id = generator(request, options);
  } else if (!(version === 2 && id === null && !options.notificationIdNull)) {
    request.id = id;
  }

  return request;
}

export default class ClientBrowser {
  private options: Required<Pick<ClientOptions, "version" | "notificationIdNull">> & ClientOptions;
  private callServer: CallServer;

  constructor(callServer: CallServer, options: ClientOptions = {}) {
    this.callServer = callServer;
    this.options = {
      reviver: options.reviver ?? null,
      replacer: options.replacer ?? null,
      generator: options.generator ?? nextRequestId,
      version: options.version ?? 2,
      notificationIdNull: options.notificationIdNull === true,
    };
  }

  request(
    method: string | JsonRpcRequest | JsonRpcRequest[],
    params?: JsonRpcParams | CallServerCallback,
    id?: JsonRpcId | CallServerCallback,
    callback?: CallServerCallback,
  ) {
    let request: JsonRpcRequest | JsonRpcRequest[] | null = null;
    const isBatch = Array.isArray(method) && typeof params === "function";
    if (this.options.version === 1 && isBatch) {
      throw new TypeError("JSON-RPC 1.0 does not support batching");
    }

    const isRaw = !isBatch && Boolean(method) && typeof method === "object" && typeof params === "function";
    if (isBatch || isRaw) {
      callback = params as CallServerCallback;
      request = method as JsonRpcRequest | JsonRpcRequest[];
    } else {
      if (typeof id === "function") {
        callback = id;
        id = undefined;
      }

      const hasCallback = typeof callback === "function";
      try {
        request = generateRequest(method as string, params as JsonRpcParams | undefined, id as JsonRpcId | undefined, {
          generator: this.options.generator,
          version: this.options.version,
          notificationIdNull: this.options.notificationIdNull,
        });
      } catch (error) {
        if (hasCallback) {
          callback?.(error as Error);
          return;
        }
        throw error;
      }

      if (!hasCallback) return request;
    }

    let message: string;
    try {
      message = JSON.stringify(request, this.options.replacer as (key: string, value: unknown) => unknown);
    } catch (error) {
      callback?.(error as Error);
      return request;
    }

    this.callServer(message, (err, response) => {
      this.parseResponse(err, response, callback);
    });

    return request;
  }

  private parseResponse(err?: Error | null, responseText?: string, callback?: CallServerCallback) {
    if (!callback) return;
    if (err) {
      callback(err);
      return;
    }
    if (!responseText) {
      callback();
      return;
    }

    let response: unknown;
    try {
      response = JSON.parse(responseText, this.options.reviver as (key: string, value: unknown) => unknown);
    } catch (error) {
      callback(error as Error);
      return;
    }

    if (callback.length === 3) {
      if (Array.isArray(response)) {
        const errors = response.filter((item) => item && typeof item === "object" && "error" in item);
        const results = response.filter((item) => !(item && typeof item === "object" && "error" in item));
        (callback as unknown as (err: null, errors: unknown[], results: unknown[]) => void)(null, errors, results);
        return;
      }
      const row = (response || {}) as { error?: unknown; result?: unknown };
      (callback as unknown as (err: null, error: unknown, result: unknown) => void)(null, row.error, row.result);
      return;
    }

    callback(null, response as string);
  }
}
