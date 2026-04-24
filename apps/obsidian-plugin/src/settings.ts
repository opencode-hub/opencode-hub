import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type OpenCodeHubPlugin from "./main";

export class OpenCodeHubSettingTab extends PluginSettingTab {
  plugin: OpenCodeHubPlugin;

  constructor(app: App, plugin: OpenCodeHubPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "OpenCode Hub" });

    // Connection status
    const statusEl = containerEl.createDiv({ cls: "setting-item" });
    const statusDot = statusEl.createSpan();
    statusDot.style.cssText = `
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
      background: ${this.plugin.isConnected ? "#22c55e" : "#ef4444"};
    `;
    statusEl.createSpan({
      text: this.plugin.isConnected ? "Connected" : "Disconnected",
    });

    // Server URL
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

    // Password
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

    // Auto-connect
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

    // Connect/Disconnect button
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
          this.display(); // Refresh UI
        });
    });
  }
}
