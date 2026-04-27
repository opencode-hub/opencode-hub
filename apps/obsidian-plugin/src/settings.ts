import { App, PluginSettingTab, Setting, Notice } from "obsidian";

// ─── Settings interface & defaults ─────────────────────────

export interface OpenCodeHubSettings {
  serverUrl: string;
  password: string;
  autoConnect: boolean;
  // Context
  showWorkspaceContext: boolean;
  showOpenTabs: boolean;
  // Agent
  defaultAgent: string;
}

export const DEFAULT_SETTINGS: OpenCodeHubSettings = {
  serverUrl: "http://127.0.0.1:4096",
  password: "",
  autoConnect: true,
  showWorkspaceContext: true,
  showOpenTabs: true,
  defaultAgent: "",
};

// Minimal interface so we don't import the plugin class directly (avoids circular deps).
interface OpenCodeHubPluginLike {
  settings: OpenCodeHubSettings;
  isConnected: boolean;
  connect(): Promise<void>;
  disconnect(): void;
  saveSettings(): Promise<void>;
}

// ─── Settings tab ──────────────────────────────────────────

export class OpenCodeHubSettingTab extends PluginSettingTab {
  private plugin: OpenCodeHubPluginLike;

  constructor(app: App, plugin: OpenCodeHubPluginLike & { app: App }) {
    // PluginSettingTab expects a Plugin instance; the real plugin satisfies this
    // at runtime. We cast here to keep the minimal interface above.
    super(app, plugin as any);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Connection ───────────────────────────────────────

    containerEl.createEl("h2", { text: "Connection" });

    // Live status indicator
    const statusEl = containerEl.createDiv({ cls: "setting-item" });
    const statusDot = statusEl.createSpan();
    statusDot.style.cssText = `
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
      background: ${this.plugin.isConnected ? "var(--text-success, #22c55e)" : "var(--text-error, #ef4444)"};
    `;
    statusEl.createSpan({
      text: this.plugin.isConnected ? "Connected" : "Disconnected",
    });

    new Setting(containerEl)
      .setName("Server URL")
      .setDesc("URL of the OpenCode server (e.g., http://127.0.0.1:4096)")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:4096")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Password")
      .setDesc("Server password (leave empty if no auth)")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("Optional")
          .setValue(this.plugin.settings.password)
          .onChange(async (value) => {
            this.plugin.settings.password = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Auto-connect")
      .setDesc("Automatically connect when Obsidian starts")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoConnect)
          .onChange(async (value) => {
            this.plugin.settings.autoConnect = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).addButton((button) => {
      button
        .setButtonText(this.plugin.isConnected ? "Disconnect" : "Connect")
        .setCta()
        .onClick(async () => {
          if (this.plugin.isConnected) {
            this.plugin.disconnect();
            new Notice("Disconnected from OpenCode");
          } else {
            try {
              await this.plugin.connect();
            } catch (e) {
              new Notice(
                `Failed to connect: ${e instanceof Error ? e.message : "Unknown error"}`,
              );
            }
          }
          this.display();
        });
    });

    // ── Context ──────────────────────────────────────────

    containerEl.createEl("h2", { text: "Context" });

    new Setting(containerEl)
      .setName("Show workspace context panel")
      .setDesc("Display a workspace context panel in the sidebar")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showWorkspaceContext)
          .onChange(async (value) => {
            this.plugin.settings.showWorkspaceContext = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Show open tabs")
      .setDesc("Include open tabs in the workspace context panel")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showOpenTabs)
          .onChange(async (value) => {
            this.plugin.settings.showOpenTabs = value;
            await this.plugin.saveSettings();
          }),
      );

    // ── Agent ────────────────────────────────────────────

    containerEl.createEl("h2", { text: "Agent" });

    new Setting(containerEl)
      .setName("Default agent")
      .setDesc("Agent to use by default when starting a new session")
      .addText((text) =>
        text
          .setPlaceholder("Leave empty for default")
          .setValue(this.plugin.settings.defaultAgent)
          .onChange(async (value) => {
            this.plugin.settings.defaultAgent = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
