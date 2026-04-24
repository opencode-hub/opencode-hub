import { ItemView, WorkspaceLeaf, MarkdownRenderer } from "obsidian";
import type { SSEEvent } from "@opencode-hub/client";
import type OpenCodeHubPlugin from "./main";

export const SIDEBAR_VIEW_TYPE = "opencode-hub-sidebar";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

/**
 * Sidebar view for OpenCode Hub in Obsidian.
 * Implements the chat interface directly with DOM APIs (no React in Obsidian).
 */
export class SidebarView extends ItemView {
  private plugin: OpenCodeHubPlugin;
  private messages: Message[] = [];
  private chatContainer: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: OpenCodeHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return SIDEBAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "OpenCode Hub";
  }

  getIcon(): string {
    return "message-circle";
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("opencode-hub-sidebar");

    // Apply styles
    this.addStyles(container);

    // Status bar
    this.statusEl = container.createDiv({ cls: "och-status" });
    this.updateStatus();

    // Chat area
    this.chatContainer = container.createDiv({ cls: "och-chat" });

    // Input area
    const inputContainer = container.createDiv({ cls: "och-input-container" });
    this.inputEl = inputContainer.createEl("textarea", {
      cls: "och-input",
      attr: { placeholder: "Ask about this note...", rows: "1" },
    });

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    const sendBtn = inputContainer.createEl("button", {
      cls: "och-send-btn",
      text: "Send",
    });
    sendBtn.addEventListener("click", () => this.handleSend());

    // Load existing messages
    await this.loadMessages();
  }

  async onClose() {
    // Cleanup
  }

  // ─── Message handling ────────────────────────────────────

  private async handleSend() {
    if (!this.inputEl) return;
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.inputEl.value = "";

    // Inject current note context first
    await this.plugin.injectVaultContext();

    // Add user message to UI
    this.addMessage({ role: "user", content: text, timestamp: new Date().toISOString() });

    // Send to OpenCode
    await this.plugin.sendMessage(text);
  }

  private addMessage(msg: Message) {
    this.messages.push(msg);
    this.renderMessage(msg);
    this.scrollToBottom();
  }

  private renderMessage(msg: Message) {
    if (!this.chatContainer) return;

    const el = this.chatContainer.createDiv({
      cls: `och-message och-message-${msg.role}`,
    });

    const label = el.createDiv({ cls: "och-message-label" });
    label.textContent = msg.role === "user" ? "You" : "Assistant";

    const content = el.createDiv({ cls: "och-message-content" });

    if (msg.role === "assistant") {
      // Render markdown for assistant messages
      MarkdownRenderer.render(this.app, msg.content || " ", content, "", this.plugin);
    } else {
      content.textContent = msg.content;
    }

    // Action buttons for assistant messages
    if (msg.role === "assistant" && msg.content) {
      const actions = el.createDiv({ cls: "och-message-actions" });

      const copyBtn = actions.createEl("button", {
        cls: "och-action-btn",
        text: "Copy",
      });
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(msg.content);
      });

      const insertBtn = actions.createEl("button", {
        cls: "och-action-btn",
        text: "Insert into note",
      });
      insertBtn.addEventListener("click", () => {
        this.insertIntoActiveNote(msg.content);
      });
    }
  }

  private scrollToBottom() {
    if (this.chatContainer) {
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
  }

  private async insertIntoActiveNote(text: string) {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;

    const content = await this.app.vault.read(file);
    await this.app.vault.modify(file, content + "\n\n" + text);
  }

  // ─── SSE events ──────────────────────────────────────────

  handleSSEEvent(event: SSEEvent) {
    // Handle streaming events — reload messages for simplicity
    // TODO: Implement proper streaming with incremental updates
    this.loadMessages();
  }

  // ─── Data loading ────────────────────────────────────────

  private async loadMessages() {
    if (!this.plugin.client || !this.plugin.currentSessionId) return;

    try {
      const rawMessages = await this.plugin.client.listMessages(
        this.plugin.currentSessionId,
      );
      this.messages = rawMessages.map((msg) => ({
        role: msg.info.role as "user" | "assistant",
        content:
          msg.parts
            ?.filter((p) => p.type === "text")
            .map((p) => p.text as string)
            .join("") ?? "",
        timestamp: msg.info.createdAt,
      }));

      // Re-render
      if (this.chatContainer) {
        this.chatContainer.empty();
        for (const msg of this.messages) {
          this.renderMessage(msg);
        }
        this.scrollToBottom();
      }
    } catch {
      // Session might not exist yet
    }
  }

  private updateStatus() {
    if (!this.statusEl) return;
    this.statusEl.empty();

    const dot = this.statusEl.createSpan({ cls: "och-status-dot" });
    dot.style.backgroundColor = this.plugin.isConnected ? "#22c55e" : "#ef4444";

    this.statusEl.createSpan({
      text: this.plugin.isConnected ? "Connected" : "Disconnected",
      cls: "och-status-text",
    });
  }

  // ─── Styles ──────────────────────────────────────────────

  private addStyles(container: HTMLElement) {
    const style = container.createEl("style");
    style.textContent = `
      .opencode-hub-sidebar {
        display: flex;
        flex-direction: column;
        height: 100%;
        font-size: 13px;
      }
      .och-status {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--background-modifier-border);
        font-size: 12px;
      }
      .och-status-dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }
      .och-status-text {
        color: var(--text-muted);
      }
      .och-chat {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
      }
      .och-message {
        margin-bottom: 12px;
        padding: 8px 12px;
        border-radius: 8px;
      }
      .och-message-user {
        background: var(--background-secondary);
      }
      .och-message-assistant {
        background: var(--background-primary);
        border: 1px solid var(--background-modifier-border);
      }
      .och-message-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted);
        margin-bottom: 4px;
      }
      .och-message-content {
        line-height: 1.5;
      }
      .och-message-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--background-modifier-border);
      }
      .och-action-btn {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        cursor: pointer;
        background: var(--background-secondary);
        border: none;
        color: var(--text-muted);
      }
      .och-action-btn:hover {
        background: var(--background-modifier-hover);
        color: var(--text-normal);
      }
      .och-input-container {
        display: flex;
        gap: 8px;
        padding: 12px;
        border-top: 1px solid var(--background-modifier-border);
      }
      .och-input {
        flex: 1;
        resize: none;
        border: 1px solid var(--background-modifier-border);
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 13px;
        background: var(--background-secondary);
        color: var(--text-normal);
        font-family: inherit;
        min-height: 36px;
        max-height: 120px;
      }
      .och-input:focus {
        outline: none;
        border-color: var(--interactive-accent);
      }
      .och-send-btn {
        padding: 8px 16px;
        border-radius: 8px;
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        border: none;
        font-size: 13px;
        cursor: pointer;
        font-weight: 500;
      }
      .och-send-btn:hover {
        opacity: 0.9;
      }
    `;
  }
}
