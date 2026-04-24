import { Plugin, Notice, requestUrl, FuzzySuggestModal, App } from "obsidian";
import {
  OpenCodeHubSettingTab,
  OpenCodeHubSettings,
  DEFAULT_SETTINGS,
} from "./settings";
import { SIDEBAR_VIEW_TYPE, SidebarView } from "./sidebar-view";
import { VaultContext } from "./vault-context";
import { OpenCodeClient, EventSubscriber } from "@opencode-hub/client";
import type { Session, Agent, Command } from "@opencode-hub/client";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ─── Discovery types ────────────────────────────────────────

interface DiscoveryWorkspace {
  id: string;
  name: string;
  path: string;
  port: number;
  status: string;
  password?: string | null;
}

interface DiscoveryFile {
  workspaces: DiscoveryWorkspace[];
  updatedAt: string;
}

const DISCOVERY_PATH = path.join(
  os.homedir(),
  ".opencode-hub",
  "discovery.json",
);

/** Read the discovery.json file to find available workspaces. */
function readDiscovery(): DiscoveryFile | null {
  try {
    const content = fs.readFileSync(DISCOVERY_PATH, "utf-8");
    return JSON.parse(content) as DiscoveryFile;
  } catch {
    return null;
  }
}

// ─── Workspace picker modal ─────────────────────────────────

class WorkspacePickerModal extends FuzzySuggestModal<DiscoveryWorkspace> {
  private workspaces: DiscoveryWorkspace[];
  private onChoose: (ws: DiscoveryWorkspace) => void;

  constructor(
    app: App,
    workspaces: DiscoveryWorkspace[],
    onChoose: (ws: DiscoveryWorkspace) => void,
  ) {
    super(app);
    this.workspaces = workspaces;
    this.onChoose = onChoose;
    this.setPlaceholder("Select a workspace...");
  }

  getItems(): DiscoveryWorkspace[] {
    return this.workspaces;
  }

  getItemText(ws: DiscoveryWorkspace): string {
    const status = ws.status === "running" ? "\u{1F7E2}" : "\u{26AA}";
    return `${status} ${ws.name} — ${ws.path}`;
  }

  onChooseItem(ws: DiscoveryWorkspace): void {
    this.onChoose(ws);
  }
}

/**
 * Wrap Obsidian's requestUrl as a fetch-compatible function.
 * This bypasses CORS restrictions in Obsidian's Electron webview.
 */
function obsidianFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {};

  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => (headers[k] = v));
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) headers[k] = v;
    } else {
      Object.assign(headers, init.headers);
    }
  }

  return requestUrl({
    url,
    method,
    headers,
    body: init?.body as string | undefined,
    throw: false,
  }).then((resp) => {
    // Handle 204 No Content
    if (resp.status === 204) {
      return new Response(null, {
        status: 204,
        headers: resp.headers as HeadersInit,
      });
    }
    // Try to return JSON, fall back to text
    let body: string;
    try {
      body =
        typeof resp.json === "object"
          ? JSON.stringify(resp.json)
          : String(resp.text);
    } catch {
      body = resp.text ?? "";
    }
    return new Response(body, {
      status: resp.status,
      headers: resp.headers as HeadersInit,
    });
  });
}

export default class OpenCodeHubPlugin extends Plugin {
  settings: OpenCodeHubSettings = { ...DEFAULT_SETTINGS };
  client: OpenCodeClient | null = null;
  eventSubscriber: EventSubscriber | null = null;
  vaultContext: VaultContext = null!;
  currentSessionId: string | null = null;

  /** Currently selected agent (null = server default). */
  currentAgent: string | null = null;

  /** Current model variant (thinking level): low, medium, high, max, or null for default */
  currentVariant: string | null = null;

  /** Cached session list — refreshed on connect and via refreshSessions(). */
  private _sessions: Session[] = [];

  /** Listeners notified when connection state changes. */
  private connectionListeners: Array<(connected: boolean) => void> = [];

  // ─── Lifecycle ──────────────────────────────────────────

  async onload() {
    await this.loadSettings();

    // Initialize vault context helper (before anything that might use it)
    this.vaultContext = new VaultContext(this.app);

    // Register sidebar view
    this.registerView(
      SIDEBAR_VIEW_TYPE,
      (leaf) => new SidebarView(leaf, this),
    );

    // Ribbon icon to toggle sidebar
    this.addRibbonIcon("message-circle", "OpenCode Hub", () => {
      this.toggleSidebar();
    });

    // ── Commands ─────────────────────────────────────────

    this.addCommand({
      id: "open-sidebar",
      name: "Open sidebar",
      callback: () => this.activateSidebar(),
    });

    this.addCommand({
      id: "summarize-note",
      name: "Summarize current note",
      callback: () => this.sendCurrentNote("Summarize this note:"),
    });

    this.addCommand({
      id: "explain-selection",
      name: "Explain selection",
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (selection) {
          this.sendMessage(`Explain the following:\n\n${selection}`);
        }
      },
    });

    this.addCommand({
      id: "new-session",
      name: "New chat session",
      callback: () => this.createNewSession(),
    });

    this.addCommand({
      id: "connect-server",
      name: "Connect to server",
      callback: async () => {
        try {
          await this.connect();
        } catch (e) {
          new Notice(
            `Failed to connect: ${e instanceof Error ? e.message : "Unknown error"}`,
          );
        }
      },
    });

    this.addCommand({
      id: "disconnect-server",
      name: "Disconnect from server",
      callback: () => {
        this.disconnect();
        new Notice("Disconnected from OpenCode");
      },
    });

    this.addCommand({
      id: "inject-context",
      name: "Inject vault context into session",
      callback: () => this.injectVaultContext(),
    });

    this.addCommand({
      id: "switch-workspace",
      name: "Switch workspace",
      callback: () => this.showWorkspacePicker(),
    });

    // ── Settings tab ────────────────────────────────────

    this.addSettingTab(new OpenCodeHubSettingTab(this.app, this));

    // ── Vault context events ────────────────────────────

    // Listen for active file changes to notify sidebar
    const unsubFileChange = this.vaultContext.onActiveFileChange(() => {
      this.getSidebarView()?.onActiveFileChanged();
    });
    this.register(() => unsubFileChange());

    // ── Auto-connect ────────────────────────────────────

    if (this.settings.autoConnect) {
      this.connect().catch(() => {
        // Silent fail on auto-connect
      });
    }
  }

  onunload() {
    this.disconnect();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ─── Connection ──────────────────────────────────────────

  async connect(): Promise<void> {
    try {
      this.client = new OpenCodeClient({
        baseUrl: this.settings.serverUrl,
        password: this.settings.password || undefined,
        fetch: obsidianFetch as unknown as typeof globalThis.fetch,
      });

      const health = await this.client.health();
      new Notice(`Connected to OpenCode v${health.version}`);

      // Subscribe to SSE
      this.eventSubscriber?.disconnect();
      this.eventSubscriber = new EventSubscriber({
        url: this.client.eventUrl,
        headers: this.client.authHeaders,
      });

      this.eventSubscriber
        .on("event", (event) => {
          // Notify sidebar view of events
          this.getSidebarView()?.handleSSEEvent(event);
        })
        .on("status", (connected) => {
          if (connected) {
            console.log("[OpenCode Hub] SSE connected");
          } else {
            console.warn("[OpenCode Hub] SSE disconnected, will reconnect...");
          }
        })
        .on("error", (err) => {
          console.error("[OpenCode Hub] SSE error:", err.message);
        });

      this.eventSubscriber.connect();

      // Refresh session list and pick (or create) a current session
      await this.refreshSessions();

      if (this._sessions.length > 0) {
        this.currentSessionId = this._sessions[0].id;
      } else {
        const session = await this.client.createSession({});
        this.currentSessionId = session.id;
        this._sessions = [session];
      }

      // Set default agent from settings if configured
      if (this.settings.defaultAgent) {
        this.currentAgent = this.settings.defaultAgent;
      }

      // Fetch actual server config (model, default_agent, etc.)
      await this.fetchServerConfig();

      this.notifyConnectionChange();
    } catch (e) {
      this.client = null;
      this.notifyConnectionChange();
      throw e;
    }
  }

  disconnect() {
    this.eventSubscriber?.disconnect();
    this.eventSubscriber = null;
    this.client = null;
    this.currentSessionId = null;
    this._sessions = [];
    this.notifyConnectionChange();
  }

  get isConnected(): boolean {
    return !!this.client;
  }

  // ─── Connection events ──────────────────────────────────

  /**
   * Register a listener that fires whenever the connection state changes.
   * Returns an unsubscribe function.
   */
  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.push(listener);
    return () => {
      this.connectionListeners = this.connectionListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  private notifyConnectionChange() {
    const connected = this.isConnected;
    this.connectionListeners.forEach((l) => l(connected));
  }

  // ─── Session management ─────────────────────────────────

  /** Cached session list. */
  get sessions(): Session[] {
    return this._sessions;
  }

  /** Fetch the latest session list from the server. */
  async refreshSessions(): Promise<Session[]> {
    if (!this.client) return [];
    this._sessions = await this.client.listSessions();
    return this._sessions;
  }

  /** Fetch all sessions from the server (alias for refreshSessions). */
  async listSessions(): Promise<Session[]> {
    return this.refreshSessions();
  }

  /** Create a new session and switch to it. */
  async createNewSession(): Promise<void> {
    if (!this.client) {
      new Notice("Not connected to OpenCode server");
      return;
    }

    try {
      const session = await this.client.createSession({});
      this._sessions.unshift(session);
      this.switchSession(session.id);
      new Notice("New session created");
    } catch (e) {
      new Notice(
        `Failed to create session: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  }

  /** Switch to a different session by ID and notify the sidebar. */
  switchSession(id: string) {
    this.currentSessionId = id;
    // Notify sidebar to reload messages for the new session
    this.getSidebarView()?.onSessionChanged();
  }

  // ─── Agent & command management ──────────────────────────

  /** Set the current agent for message sending. */
  setAgent(name: string) {
    this.currentAgent = name || null;
  }

  /** Fetch available agents from the server. */
  async listAgents(): Promise<Agent[]> {
    if (!this.client) return [];
    try {
      return await this.client.listAgents();
    } catch {
      return [];
    }
  }

  /** Fetch available commands from the server. */
  async listCommands(): Promise<Command[]> {
    if (!this.client) return [];
    try {
      return await this.client.listCommands();
    } catch {
      return [];
    }
  }

  // ─── Model / provider info ──────────────────────────────

  /** Currently selected model (providerID + modelID). Null = use server default. */
  /** Fetch the server's actual config and provider info, store for display */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _providers: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _providerDefaults: Record<string, string> = {};

  async fetchServerConfig(): Promise<void> {
    if (!this.client) return;
    try {
      // Fetch config and providers in parallel (like TUI bootstrap)
      const [config, provData] = await Promise.all([
        this.client.getConfig(),
        this.client.listProviders().catch(() => ({ providers: [], default: {} })),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = config as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pd = provData as any;
      this._providers = pd.providers || [];
      this._providerDefaults = pd.default || {};

      // Resolve model from config.model (format: "provider/modelId")
      // Only use the explicitly configured model — don't guess from provider defaults,
      // as the server has its own model selection logic that may differ.
      const modelStr: string | null = typeof cfg.model === "string" ? cfg.model : null;
      if (modelStr) {
        const resolved = this.resolveModelName(modelStr);
        (this as unknown as Record<string, unknown>)._serverModel = resolved;
      } else {
        // No model configured — show "auto" until the first message reveals the actual model
        (this as unknown as Record<string, unknown>)._serverModel = null;
      }

      // Thinking: check if the resolved model supports reasoning
      const hasReasoning = modelStr ? this.modelHasReasoning(modelStr) : false;
      (this as unknown as Record<string, unknown>)._serverThinking =
        hasReasoning ? "reasoning" : null;
    } catch {
      // Non-fatal
    }
  }

  /** Resolve "provider/modelId" to human-readable model name using providers data */
  private resolveModelName(modelStr: string): string {
    const slashIdx = modelStr.indexOf("/");
    if (slashIdx === -1) return modelStr;
    const provId = modelStr.substring(0, slashIdx);
    const modelId = modelStr.substring(slashIdx + 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prov = this._providers.find((p: any) => p.id === provId);
    if (!prov) return modelStr;
    // models is a dict keyed by modelID
    const models = prov.models || {};
    const info = models[modelId];
    if (info && info.name) return info.name;
    // Fallback: return the raw modelId (without provider prefix)
    return modelId;
  }

  /** Check if a model supports reasoning/thinking */
  private modelHasReasoning(modelStr: string): boolean {
    const slashIdx = modelStr.indexOf("/");
    if (slashIdx === -1) return false;
    const provId = modelStr.substring(0, slashIdx);
    const modelId = modelStr.substring(slashIdx + 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prov = this._providers.find((p: any) => p.id === provId);
    if (!prov) return false;
    const models = prov.models || {};
    const info = models[modelId];
    return info?.capabilities?.reasoning === true;
  }

  // ─── File search ───────────────────────────────────────

  /** Search files in the workspace via OpenCode API */
  async searchFiles(query: string, limit = 10): Promise<string[]> {
    if (!this.client) return [];
    try {
      return await this.client.findFiles(query, { limit });
    } catch {
      return [];
    }
  }

  // ─── Workspace discovery ─────────────────────────────────

  /** Read available workspaces from discovery.json. */
  getAvailableWorkspaces(): DiscoveryWorkspace[] {
    const discovery = readDiscovery();
    return discovery?.workspaces ?? [];
  }

  /** Show a fuzzy picker to select and connect to a workspace by name. */
  showWorkspacePicker() {
    const workspaces = this.getAvailableWorkspaces();
    if (workspaces.length === 0) {
      new Notice("No workspaces found. Start OpenCode Hub first.");
      return;
    }

    new WorkspacePickerModal(this.app, workspaces, async (ws) => {
      await this.connectToWorkspace(ws);
    }).open();
  }

  /** Connect to a specific workspace from discovery. */
  async connectToWorkspace(ws: DiscoveryWorkspace): Promise<void> {
    if (ws.status !== "running") {
      new Notice(`Workspace "${ws.name}" is not running.`);
      return;
    }

    // Disconnect from current server if connected
    if (this.isConnected) {
      this.disconnect();
    }

    // Update settings to point to this workspace
    this.settings.serverUrl = `http://127.0.0.1:${ws.port}`;
    this.settings.password = ws.password ?? "";
    await this.saveSettings();

    // Connect
    try {
      await this.connect();
      new Notice(`Connected to workspace "${ws.name}"`);
    } catch (e) {
      new Notice(
        `Failed to connect to "${ws.name}": ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  }

  // ─── Sidebar ─────────────────────────────────────────────

  async activateSidebar() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: SIDEBAR_VIEW_TYPE,
          active: true,
        });
        leaf = rightLeaf;
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async toggleSidebar() {
    const leaves = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
    if (leaves.length > 0) {
      leaves[0].detach();
    } else {
      await this.activateSidebar();
    }
  }

  getSidebarView(): SidebarView | null {
    const leaves = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
    if (leaves.length > 0) {
      return leaves[0].view as SidebarView;
    }
    return null;
  }

  // ─── Messaging ───────────────────────────────────────────

  async sendMessage(text: string): Promise<void> {
    if (!this.client || !this.currentSessionId) {
      new Notice("Not connected to OpenCode server");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = {
      parts: [{ type: "text", text }],
    };

    if (this.currentAgent) {
      body.agent = this.currentAgent;
    }
    // Model and variant use server defaults — no override

    await this.client.sendMessageAsync(this.currentSessionId, body);
  }

  async sendCurrentNote(prefix: string): Promise<void> {
    const noteCtx = await this.vaultContext.getCurrentNoteContext();
    if (!noteCtx) {
      new Notice("No active note");
      return;
    }

    await this.activateSidebar();
    await this.sendMessage(`${prefix}\n\n${noteCtx.content}`);
  }

  async injectVaultContext(): Promise<void> {
    if (!this.client || !this.currentSessionId) {
      new Notice("Not connected to OpenCode server");
      return;
    }

    const context = await this.vaultContext.formatMinimalContext();
    if (context) {
      await this.client.injectContext(this.currentSessionId, context);
      // Silent — no notification needed
    }
  }
}
