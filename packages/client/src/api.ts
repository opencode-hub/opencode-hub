// OpenCode Server REST API client.
// Pure TypeScript, zero UI dependencies, works in any JS runtime.

import type {
  ClientOptions,
  HealthResponse,
  Project,
  Session,
  SessionStatus,
  CreateSessionBody,
  UpdateSessionBody,
  SendMessageBody,
  MessageResponse,
  RunCommandBody,
  Command,
  FileNode,
  FileContent,
  FileDiff,
  Provider,
  ConfigResponse,
  Agent,
  Todo,
} from "./types.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:4096";
const DEFAULT_USERNAME = "opencode";

/**
 * Low-level HTTP client for OpenCode Server API.
 *
 * Wraps all REST endpoints documented at /doc (OpenAPI 3.1).
 * Does NOT handle SSE — use `EventSubscriber` for real-time events.
 */
export class OpenCodeClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private fetchFn: typeof globalThis.fetch;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);

    this.headers = {
      "Content-Type": "application/json",
    };

    if (options.password) {
      const username = options.username ?? DEFAULT_USERNAME;
      const credentials = btoa(`${username}:${options.password}`);
      this.headers["Authorization"] = `Basic ${credentials}`;
    }
  }

  // ─── Request helpers ───────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const response = await this.fetchFn(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new OpenCodeError(response.status, text, path);
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  private get<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    return this.request<T>("GET", path, undefined, query);
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  private delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  // ─── Global ────────────────────────────────────────────────

  /** Health check — verify server is running. */
  async health(): Promise<HealthResponse> {
    return this.get("/global/health");
  }

  // ─── Project ───────────────────────────────────────────────

  /** List all projects. */
  async listProjects(): Promise<Project[]> {
    return this.get("/project");
  }

  /** Get current project. */
  async currentProject(): Promise<Project> {
    return this.get("/project/current");
  }

  // ─── Session ───────────────────────────────────────────────

  /** List all sessions. */
  async listSessions(): Promise<Session[]> {
    return this.get("/session");
  }

  /** Create a new session. */
  async createSession(body?: CreateSessionBody): Promise<Session> {
    return this.post("/session", body ?? {});
  }

  /** Get a session by ID. */
  async getSession(id: string): Promise<Session> {
    return this.get(`/session/${id}`);
  }

  /** Update a session (e.g., rename). */
  async updateSession(id: string, body: UpdateSessionBody): Promise<Session> {
    return this.patch(`/session/${id}`, body);
  }

  /** Delete a session. */
  async deleteSession(id: string): Promise<boolean> {
    return this.delete(`/session/${id}`);
  }

  /** Get status of all sessions. */
  async sessionStatuses(): Promise<Record<string, SessionStatus>> {
    return this.get("/session/status");
  }

  /** Get child sessions (forked from parent). */
  async sessionChildren(id: string): Promise<Session[]> {
    return this.get(`/session/${id}/children`);
  }

  /** Get todos for a session. */
  async sessionTodos(id: string): Promise<Todo[]> {
    return this.get(`/session/${id}/todo`);
  }

  /** Abort a running session. */
  async abortSession(id: string): Promise<boolean> {
    return this.post(`/session/${id}/abort`);
  }

  /** Fork a session at a specific message. */
  async forkSession(
    id: string,
    messageID?: string,
  ): Promise<Session> {
    return this.post(`/session/${id}/fork`, { messageID });
  }

  /** Get file diffs for a session. */
  async sessionDiff(
    id: string,
    messageID?: string,
  ): Promise<FileDiff[]> {
    return this.get(`/session/${id}/diff`, { messageID });
  }

  /** Revert file changes from a message. */
  async revertSession(
    id: string,
    messageID: string,
    partID?: string,
  ): Promise<boolean> {
    return this.post(`/session/${id}/revert`, { messageID, partID });
  }

  /** Unrevert (restore) reverted changes. */
  async unrevertSession(id: string): Promise<boolean> {
    return this.post(`/session/${id}/unrevert`);
  }

  /** Respond to a permission request. */
  async respondPermission(
    sessionId: string,
    permissionId: string,
    response: boolean,
    remember?: boolean,
  ): Promise<boolean> {
    return this.post(`/session/${sessionId}/permissions/${permissionId}`, {
      response,
      remember,
    });
  }

  // ─── Message ───────────────────────────────────────────────

  /** List messages in a session. */
  async listMessages(
    sessionId: string,
    limit?: number,
  ): Promise<MessageResponse[]> {
    return this.get(`/session/${sessionId}/message`, { limit });
  }

  /** Get a specific message. */
  async getMessage(
    sessionId: string,
    messageId: string,
  ): Promise<MessageResponse> {
    return this.get(`/session/${sessionId}/message/${messageId}`);
  }

  /**
   * Send a message (synchronous — blocks until AI responds).
   * For streaming, use `sendMessageAsync` + SSE events.
   */
  async sendMessage(
    sessionId: string,
    body: SendMessageBody,
  ): Promise<MessageResponse> {
    return this.post(`/session/${sessionId}/message`, body);
  }

  /**
   * Send a message asynchronously — returns 204 immediately.
   * Track progress via SSE events from `EventSubscriber`.
   */
  async sendMessageAsync(
    sessionId: string,
    body: SendMessageBody,
  ): Promise<void> {
    return this.post(`/session/${sessionId}/prompt_async`, body);
  }

  /**
   * Inject context into a session without triggering AI response.
   * Convenience wrapper around sendMessageAsync with noReply: true.
   */
  async injectContext(
    sessionId: string,
    contextText: string,
  ): Promise<void> {
    return this.sendMessageAsync(sessionId, {
      parts: [{ type: "text", text: contextText }],
      noReply: true,
    });
  }

  /** Run a slash command. */
  async runCommand(
    sessionId: string,
    body: RunCommandBody,
  ): Promise<MessageResponse> {
    return this.post(`/session/${sessionId}/command`, body);
  }

  // ─── Command ───────────────────────────────────────────────

  /** List available commands. */
  async listCommands(): Promise<Command[]> {
    return this.get("/command");
  }

  // ─── File ──────────────────────────────────────────────────

  /** List files in a directory. */
  async listFiles(path?: string): Promise<FileNode[]> {
    return this.get("/file", { path });
  }

  /** Read file content. */
  async readFile(path: string): Promise<FileContent> {
    return this.get("/file/content", { path });
  }

  /** Get file status (git-like). */
  async fileStatus(): Promise<unknown[]> {
    return this.get("/file/status");
  }

  /** Search file contents by pattern. */
  async findText(pattern: string): Promise<unknown[]> {
    return this.get("/find", { pattern });
  }

  /** Find files by name/pattern. */
  async findFiles(
    query: string,
    options?: { type?: string; directory?: string; limit?: number },
  ): Promise<string[]> {
    return this.get("/find/file", { query, ...options });
  }

  // ─── Config ────────────────────────────────────────────────

  /** Get server configuration. */
  async getConfig(): Promise<ConfigResponse> {
    return this.get("/config");
  }

  /** Update server configuration. */
  async updateConfig(config: Partial<ConfigResponse>): Promise<ConfigResponse> {
    return this.patch("/config", config);
  }

  /** List providers and default models. */
  async listProviders(): Promise<{
    providers: Provider[];
    default: Record<string, string>;
  }> {
    return this.get("/config/providers");
  }

  // ─── Agent ─────────────────────────────────────────────────

  /** List available agents. */
  async listAgents(): Promise<Agent[]> {
    return this.get("/agent");
  }

  // ─── SSE URL ───────────────────────────────────────────────

  /** Get the SSE event stream URL. */
  get eventUrl(): string {
    return `${this.baseUrl}/event`;
  }

  /** Get the global SSE event stream URL. */
  get globalEventUrl(): string {
    return `${this.baseUrl}/global/event`;
  }

  /** Get the base URL of this client. */
  get url(): string {
    return this.baseUrl;
  }

  /** Get auth headers (for SSE connections that need them). */
  get authHeaders(): Record<string, string> {
    return { ...this.headers };
  }
}

/**
 * Error from OpenCode Server API.
 */
export class OpenCodeError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly path: string,
  ) {
    super(`OpenCode API error ${status} on ${path}: ${body}`);
    this.name = "OpenCodeError";
  }
}
