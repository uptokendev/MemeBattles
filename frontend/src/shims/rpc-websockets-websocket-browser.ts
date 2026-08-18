import { EventEmitter } from "eventemitter3";

class WebSocketBrowserImpl extends EventEmitter {
  private socket: WebSocket;

  constructor(address: string, _options?: unknown, protocols?: string | string[]) {
    super();
    this.socket = new window.WebSocket(address, protocols);
    this.socket.onopen = () => this.emit("open");
    this.socket.onmessage = (event) => this.emit("message", event.data);
    this.socket.onerror = (error) => this.emit("error", error);
    this.socket.onclose = (event) => this.emit("close", event.code, event.reason);
  }

  send(data: string, optionsOrCallback?: unknown, callback?: (error?: unknown) => void) {
    const cb = (typeof optionsOrCallback === "function" ? optionsOrCallback : callback) || (() => {});
    try {
      this.socket.send(data);
      cb();
    } catch (error) {
      cb(error);
    }
  }

  close(code?: number, reason?: string) {
    this.socket.close(code, reason);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
    this.socket.addEventListener(type, listener, options);
  }
}

export default function createWebSocket(address: string, options?: unknown) {
  return new WebSocketBrowserImpl(address, options);
}
