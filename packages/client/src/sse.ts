// SSE (Server-Sent Events) subscriber for OpenCode real-time events.
// Handles connection, reconnection, and event parsing.

export interface SSEEvent {
  type: string;
  properties: Record<string, unknown>;
}

export type SSEEventHandler = (event: SSEEvent) => void;
export type SSEErrorHandler = (error: Error) => void;
export type SSEStatusHandler = (connected: boolean) => void;

export interface EventSubscriberOptions {
  /** SSE endpoint URL. */
  url: string;
  /** Auth headers to include. */
  headers?: Record<string, string>;
  /** Reconnect delay in ms. @default 3000 */
  reconnectDelay?: number;
  /** Maximum reconnect attempts. @default Infinity */
  maxReconnects?: number;
}

/**
 * Subscribes to OpenCode Server SSE event stream.
 *
 * Usage:
 * ```ts
 * const subscriber = new EventSubscriber({
 *   url: client.eventUrl,
 *   headers: client.authHeaders,
 * });
 * subscriber.on('event', (e) => console.log(e));
 * subscriber.connect();
 * ```
 */
export class EventSubscriber {
  private options: Required<
    Pick<EventSubscriberOptions, "reconnectDelay" | "maxReconnects">
  > &
    EventSubscriberOptions;
  private eventSource: EventSource | null = null;
  private reconnectCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private eventHandlers: SSEEventHandler[] = [];
  private errorHandlers: SSEErrorHandler[] = [];
  private statusHandlers: SSEStatusHandler[] = [];

  constructor(options: EventSubscriberOptions) {
    this.options = {
      reconnectDelay: 3000,
      maxReconnects: Infinity,
      ...options,
    };
  }

  /** Register an event handler. */
  on(type: "event", handler: SSEEventHandler): this;
  on(type: "error", handler: SSEErrorHandler): this;
  on(type: "status", handler: SSEStatusHandler): this;
  on(
    type: "event" | "error" | "status",
    handler: SSEEventHandler | SSEErrorHandler | SSEStatusHandler,
  ): this {
    switch (type) {
      case "event":
        this.eventHandlers.push(handler as SSEEventHandler);
        break;
      case "error":
        this.errorHandlers.push(handler as SSEErrorHandler);
        break;
      case "status":
        this.statusHandlers.push(handler as SSEStatusHandler);
        break;
    }
    return this;
  }

  /** Remove an event handler. */
  off(type: "event", handler: SSEEventHandler): this;
  off(type: "error", handler: SSEErrorHandler): this;
  off(type: "status", handler: SSEStatusHandler): this;
  off(
    type: "event" | "error" | "status",
    handler: SSEEventHandler | SSEErrorHandler | SSEStatusHandler,
  ): this {
    switch (type) {
      case "event":
        this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
        break;
      case "error":
        this.errorHandlers = this.errorHandlers.filter(
          (h) => h !== handler,
        );
        break;
      case "status":
        this.statusHandlers = this.statusHandlers.filter(
          (h) => h !== handler,
        );
        break;
    }
    return this;
  }

  /** Connect to the SSE stream. */
  connect(): void {
    if (this.disposed) return;
    this.cleanup();

    // EventSource doesn't support custom headers natively.
    // If auth is needed, the URL must include credentials as query params,
    // or we fall back to fetch-based SSE parsing.
    // For local usage (127.0.0.1), Basic Auth is sent via URL credentials.
    let url = this.options.url;
    if (this.options.headers?.["Authorization"]) {
      // Extract credentials from Basic auth header and embed in URL
      const auth = this.options.headers["Authorization"];
      const match = auth.match(/^Basic (.+)$/);
      if (match) {
        const decoded = atob(match[1]);
        const urlObj = new URL(url);
        const [username, password] = decoded.split(":");
        urlObj.username = username;
        urlObj.password = password ?? "";
        url = urlObj.toString();
      }
    }

    const eventSource = new EventSource(url);
    this.eventSource = eventSource;

    eventSource.onopen = () => {
      this.reconnectCount = 0;
      this.statusHandlers.forEach((h) => h(true));
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent;
        this.eventHandlers.forEach((h) => h(data));
      } catch {
        // Non-JSON message, wrap it
        this.eventHandlers.forEach((h) =>
          h({ type: "raw", properties: { data: event.data } }),
        );
      }
    };

    eventSource.onerror = () => {
      this.statusHandlers.forEach((h) => h(false));
      eventSource.close();
      this.eventSource = null;
      this.scheduleReconnect();
    };
  }

  /** Disconnect and stop reconnecting. */
  disconnect(): void {
    this.disposed = true;
    this.cleanup();
  }

  /** Check if currently connected. */
  get connected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectCount >= this.options.maxReconnects) {
      this.errorHandlers.forEach((h) =>
        h(new Error("Max reconnect attempts reached")),
      );
      return;
    }

    this.reconnectCount++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.options.reconnectDelay);
  }
}
