// SSE (Server-Sent Events) subscriber for OpenCode real-time events.
// Handles connection, reconnection, and event parsing.
// Uses Node.js http module to bypass browser CORS restrictions (required for Electron/Obsidian).

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
  /**
   * Custom fetch function for SSE transport.
   * When provided, uses fetch-based streaming instead of EventSource.
   * Useful in environments where EventSource is blocked by CORS but fetch
   * can bypass it (e.g., Chrome extension service workers with host_permissions).
   */
  fetch?: typeof globalThis.fetch;
}

/**
 * Subscribes to OpenCode Server SSE event stream.
 *
 * Supports two transports:
 * 1. Node.js `http` module (for Electron/Obsidian — bypasses CORS)
 * 2. Browser `EventSource` (fallback for standard browsers)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private nodeRequest: any = null; // Node.js http.ClientRequest
  private fetchController: AbortController | null = null; // fetch-based transport
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

  /** Connect to the SSE stream. Uses Node.js http if available (Electron), custom fetch if provided, or falls back to EventSource. */
  connect(): void {
    if (this.disposed) return;
    this.cleanup();

    // Try Node.js http first (works in Electron/Obsidian, bypasses CORS)
    try {
      // Dynamic require to avoid bundler issues — only available in Node.js/Electron
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = globalThis as any;
      const nodeRequire = g.require;
      if (nodeRequire) {
        const http = nodeRequire("http");
        this.connectViaNode(http);
        return;
      }
    } catch {
      // Not in Node.js environment
    }

    // Use fetch-based transport if a custom fetch was provided (e.g., Chrome extension service worker)
    if (this.options.fetch) {
      this.connectViaFetch(this.options.fetch);
      return;
    }

    // Fallback: browser EventSource
    this.connectViaEventSource();
  }

  /** Connect using Node.js http module (CORS-free) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connectViaNode(http: any): void {
    const urlObj = new URL(this.options.url);

    const reqHeaders: Record<string, string> = {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      ...(this.options.headers ?? {}),
    };

    const req = http.get(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        headers: reqHeaders,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (res: any) => {
        if (res.statusCode !== 200) {
          this.errorHandlers.forEach((h) =>
            h(new Error(`SSE connection failed: HTTP ${res.statusCode}`)),
          );
          this.scheduleReconnect();
          return;
        }

        this.reconnectCount = 0;
        this.statusHandlers.forEach((h) => h(true));

        res.setEncoding("utf8");
        let buffer = "";

        res.on("data", (chunk: string) => {
          buffer += chunk;
          // SSE events are separated by double newlines
          const parts = buffer.split("\n\n");
          // Keep the last part (may be incomplete)
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.trim()) continue;
            // Parse SSE format: "data: {...}\n"
            const lines = part.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ") || line.startsWith("data:")) {
                const jsonStr = line.startsWith("data: ")
                  ? line.slice(6)
                  : line.slice(5);
                try {
                  const data = JSON.parse(jsonStr) as SSEEvent;
                  this.eventHandlers.forEach((h) => h(data));
                } catch {
                  // Non-JSON, ignore
                }
              }
            }
          }
        });

        res.on("end", () => {
          this.statusHandlers.forEach((h) => h(false));
          this.nodeRequest = null;
          if (!this.disposed) this.scheduleReconnect();
        });

        res.on("error", () => {
          this.statusHandlers.forEach((h) => h(false));
          this.nodeRequest = null;
          if (!this.disposed) this.scheduleReconnect();
        });
      },
    );

    req.on("error", () => {
      this.statusHandlers.forEach((h) => h(false));
      this.nodeRequest = null;
      if (!this.disposed) this.scheduleReconnect();
    });

    this.nodeRequest = req;
  }

  /** Connect using fetch with streaming response (bypasses CORS in extension service workers) */
  private connectViaFetch(fetchFn: typeof globalThis.fetch): void {
    const controller = new AbortController();
    this.fetchController = controller;

    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      ...(this.options.headers ?? {}),
    };

    fetchFn(this.options.url, {
      headers,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          this.errorHandlers.forEach((h) =>
            h(new Error(`SSE connection failed: HTTP ${response.status}`)),
          );
          this.scheduleReconnect();
          return;
        }

        this.reconnectCount = 0;
        this.statusHandlers.forEach((h) => h(true));

        const reader = response.body?.getReader();
        if (!reader) {
          this.errorHandlers.forEach((h) =>
            h(new Error("SSE response has no readable body")),
          );
          this.scheduleReconnect();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            // SSE events are separated by double newlines
            const parts = buffer.split("\n\n");
            buffer = parts.pop() ?? "";

            for (const part of parts) {
              if (!part.trim()) continue;
              const lines = part.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ") || line.startsWith("data:")) {
                  const jsonStr = line.startsWith("data: ")
                    ? line.slice(6)
                    : line.slice(5);
                  try {
                    const data = JSON.parse(jsonStr) as SSEEvent;
                    this.eventHandlers.forEach((h) => h(data));
                  } catch {
                    // Non-JSON, ignore
                  }
                }
              }
            }
          }
        } catch (err) {
          if (controller.signal.aborted) return; // Intentional disconnect
          this.errorHandlers.forEach((h) =>
            h(err instanceof Error ? err : new Error(String(err))),
          );
        }

        this.statusHandlers.forEach((h) => h(false));
        this.fetchController = null;
        if (!this.disposed) this.scheduleReconnect();
      })
      .catch((err) => {
        if (controller.signal.aborted) return; // Intentional disconnect
        this.statusHandlers.forEach((h) => h(false));
        this.fetchController = null;
        this.errorHandlers.forEach((h) =>
          h(err instanceof Error ? err : new Error(String(err))),
        );
        if (!this.disposed) this.scheduleReconnect();
      });
  }

  /** Connect using browser EventSource (standard browsers) */
  private connectViaEventSource(): void {
    let url = this.options.url;
    if (this.options.headers?.["Authorization"]) {
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
    if (this.nodeRequest) return true;
    if (this.fetchController) return true;
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
    if (this.nodeRequest) {
      try { this.nodeRequest.destroy(); } catch { /* ignore */ }
      this.nodeRequest = null;
    }
    if (this.fetchController) {
      this.fetchController.abort();
      this.fetchController = null;
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
