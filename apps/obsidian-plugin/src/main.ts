import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { OpenCodeHubSettingTab } from "./settings";
import { SIDEBAR_VIEW_TYPE, SidebarView } from "./sidebar-view";
import { VaultContext } from "./vault-context";
import { OpenCodeClient, EventSubscriber } from "@opencode-hub/client";

interface OpenCodeHubSettings {
  serverUrl: string;
  password: string;
  autoConnect: boolean;
}

const DEFAULT_SETTINGS: OpenCodeHubSettings = {
  serverUrl: "http://127.0.0.1:4096",
  password: "",
  autoConnect: true,
};

export default class OpenCodeHubPlugin extends Plugin {
  settings: OpenCodeHubSettings = DEFAULT_SETTINGS;
  client: OpenCodeClient | null = null;
  eventSubscriber: EventSubscriber | null = null;
  vaultContext: VaultContext | null = null;
  currentSessionId: string | null = null;

  async onload() {
    await this.loadSettings();

    // Register sidebar view
    this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new SidebarView(leaf, this));

    // Ribbon icon to toggle sidebar
    this.addRibbonIcon("message-circle", "OpenCode Hub", () => {
      this.toggleSidebar();
    });

    // Commands
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
      id: "switch-workspace",
      name: "Switch workspace",
      callback: () => {
        // TODO: Show workspace picker modal
        new Notice("Workspace switching coming soon");
      },
    });

    // Settings tab
    this.addSettingTab(new OpenCodeHubSettingTab(this.app, this));

    // Initialize vault context helper
    this.vaultContext = new VaultContext(this.app);

    // Auto-connect on load
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
      });

      const health = await this.client.health();
      new Notice(`Connected to OpenCode v${health.version}`);

      // Subscribe to SSE
      this.eventSubscriber?.disconnect();
      this.eventSubscriber = new EventSubscriber({
        url: this.client.eventUrl,
        headers: this.client.authHeaders,
      });

      this.eventSubscriber.on("event", (event) => {
        // Notify sidebar view of events
        this.getSidebarView()?.handleSSEEvent(event);
      });

      this.eventSubscriber.connect();

      // Get or create session
      const sessions = await this.client.listSessions();
      if (sessions.length > 0) {
        this.currentSessionId = sessions[0].id;
      } else {
        const session = await this.client.createSession({
          title: "Obsidian Session",
        });
        this.currentSessionId = session.id;
      }
    } catch (e) {
      this.client = null;
      throw e;
    }
  }

  disconnect() {
    this.eventSubscriber?.disconnect();
    this.eventSubscriber = null;
    this.client = null;
    this.currentSessionId = null;
  }

  get isConnected(): boolean {
    return !!this.client;
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

    await this.client.sendMessageAsync(this.currentSessionId, {
      parts: [{ type: "text", text }],
    });
  }

  async sendCurrentNote(prefix: string): Promise<void> {
    if (!this.vaultContext) return;

    const context = await this.vaultContext.getCurrentNoteContext();
    if (!context) {
      new Notice("No active note");
      return;
    }

    await this.activateSidebar();
    await this.sendMessage(`${prefix}\n\n${context}`);
  }

  async injectVaultContext(): Promise<void> {
    if (!this.client || !this.currentSessionId || !this.vaultContext) return;

    const context = await this.vaultContext.getCurrentNoteContext();
    if (context) {
      await this.client.injectContext(this.currentSessionId, context);
    }
  }
}
