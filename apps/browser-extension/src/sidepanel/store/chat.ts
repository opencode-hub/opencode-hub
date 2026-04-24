import { create } from "zustand";

// ─── Part types (aligned with OpenCode's data model) ─────────

export interface TextPart {
  type: "text";
  text: string;
}

export interface ReasoningPart {
  type: "reasoning";
  text: string;
}

export interface ToolPart {
  type: "tool";
  name: string;
  input?: unknown;
  output?: string;
  state: "pending" | "running" | "completed" | "error";
  error?: string;
}

export type MessagePart = TextPart | ReasoningPart | ToolPart;

// ─── Message type ────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  timestamp: string;
  streaming?: boolean;
  /** Agent name (e.g. "code", "explore") */
  agent?: string;
  /** Model identifier */
  model?: string;
  /** Response duration in seconds */
  duration?: number;
  /** Token counts */
  tokens?: { input?: number; output?: number; reasoning?: number };
  /** Cost in USD */
  cost?: number;
  /** Error message if the response failed */
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Extract plain text content from a message */
export function getMessageText(msg: ChatMessage): string {
  return msg.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Extract reasoning text from a message */
export function getMessageReasoning(msg: ChatMessage): string {
  return msg.parts
    .filter((p): p is ReasoningPart => p.type === "reasoning")
    .map((p) => p.text)
    .join("");
}

/** Extract tool parts from a message */
export function getMessageTools(msg: ChatMessage): ToolPart[] {
  return msg.parts.filter((p): p is ToolPart => p.type === "tool");
}

// ─── Tool categorization (matching OpenCode's logic) ─────────

const CONTEXT_TOOL_NAMES = new Set([
  "read", "glob", "grep", "list", "search", "folder-search", "codesearch", "websearch",
]);

export function isContextTool(name: string): boolean {
  const lower = name.toLowerCase();
  return [...CONTEXT_TOOL_NAMES].some((ct) => lower.includes(ct));
}

export function getToolCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("bash") || lower.includes("shell")) return "Shell";
  if (lower.includes("edit") || lower.includes("write") || lower.includes("apply_patch")) return "Edit";
  if (lower.includes("task")) return "Agent";
  if (lower.includes("webfetch") || lower.includes("websearch")) return "Web";
  if (lower.includes("todowrite") || lower.includes("question")) return "Interact";
  return "Tool";
}

export function getToolIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("bash") || lower.includes("shell")) return "terminal";
  if (lower.includes("edit") || lower.includes("write")) return "pencil";
  if (lower.includes("read") || lower.includes("glob") || lower.includes("grep")) return "search";
  if (lower.includes("task")) return "bot";
  if (lower.includes("webfetch") || lower.includes("websearch")) return "globe";
  return "wrench";
}

// ─── Store ───────────────────────────────────────────────────

interface ChatState {
  messages: ChatMessage[];
  streaming: boolean;
  /** Session is busy (agent is working) */
  busy: boolean;

  addUserMessage: (text: string) => void;
  startStreaming: () => void;
  appendAssistantChunk: (chunk: string) => void;
  stopStreaming: () => void;
  loadMessages: () => Promise<void>;
  setBusy: (busy: boolean) => void;
  clear: () => void;
}

/** Parse raw server MessageResponse into our ChatMessage format */
function parseServerMessage(msg: any): ChatMessage {
  const info = msg.info ?? {};
  const rawParts: any[] = msg.parts ?? [];
  const parts: MessagePart[] = [];

  for (const p of rawParts) {
    switch (p.type) {
      case "text":
        if (typeof p.text === "string" && p.text) {
          // Skip synthetic/empty text parts
          parts.push({ type: "text", text: p.text });
        }
        break;

      case "reasoning":
        if (typeof p.text === "string" && p.text) {
          parts.push({ type: "reasoning", text: p.text });
        }
        break;

      case "tool": {
        const name = p.name ?? p.tool ?? "unknown";
        let state: ToolPart["state"] = "completed";
        if (p.state === "pending" || p.state === "running") state = p.state;
        else if (p.state === "error" || p.error) state = "error";

        let output: string | undefined;
        if (typeof p.output === "string") output = p.output;
        else if (typeof p.result === "string") output = p.result;

        parts.push({
          type: "tool",
          name,
          input: p.input ?? p.args,
          output,
          state,
          error: typeof p.error === "string" ? p.error : undefined,
        });
        break;
      }

      // Skip step-start, step-finish, compaction, etc. — they're metadata
      default:
        break;
    }
  }

  // Extract timing info
  let timestamp = info.createdAt ?? new Date().toISOString();
  const timeObj = info.time as Record<string, unknown> | undefined;
  if (timeObj && typeof timeObj === "object") {
    if (typeof timeObj.created === "number" && timeObj.created > 0) {
      timestamp = new Date(timeObj.created).toISOString();
    }
  }

  let duration: number | undefined;
  if (timeObj && typeof timeObj.completed === "number" && typeof timeObj.created === "number") {
    duration = Math.round((timeObj.completed as number - (timeObj.created as number)) / 1000);
  }

  // Extract tokens/cost from assistant messages
  let tokens: ChatMessage["tokens"];
  let cost: number | undefined;
  if (info.role === "assistant") {
    const t = info.tokens as Record<string, unknown> | undefined;
    if (t && typeof t === "object") {
      tokens = {
        input: typeof t.input === "number" ? t.input : undefined,
        output: typeof t.output === "number" ? t.output : undefined,
        reasoning: typeof t.reasoning === "number" ? t.reasoning : undefined,
      };
    }
    if (typeof info.cost === "number") cost = info.cost;
  }

  return {
    id: info.id ?? `msg-${Date.now()}`,
    role: info.role as "user" | "assistant",
    parts,
    timestamp,
    agent: typeof info.agent === "string" ? info.agent : undefined,
    model: typeof info.modelID === "string" ? info.modelID : undefined,
    duration,
    tokens,
    cost,
    error: typeof info.error === "string" ? info.error : undefined,
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streaming: false,
  busy: false,

  addUserMessage: (text: string) => {
    const message: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text }],
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      messages: [...state.messages, message],
      busy: true,
    }));
  },

  startStreaming: () => {
    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      parts: [],
      timestamp: new Date().toISOString(),
      streaming: true,
    };
    set((state) => ({
      messages: [...state.messages, assistantMsg],
      streaming: true,
      busy: true,
    }));
  },

  appendAssistantChunk: (chunk: string) => {
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last?.role === "assistant" && last.streaming) {
        // Find existing text part or create one
        const parts = [...last.parts];
        // Find the last text part
        let lastTextIdx = -1;
        for (let i = parts.length - 1; i >= 0; i--) {
          if (parts[i].type === "text") { lastTextIdx = i; break; }
        }
        if (lastTextIdx >= 0) {
          const tp = parts[lastTextIdx] as TextPart;
          parts[lastTextIdx] = { ...tp, text: tp.text + chunk };
        } else {
          parts.push({ type: "text", text: chunk });
        }
        messages[messages.length - 1] = { ...last, parts };
      }
      return { messages };
    });
  },

  stopStreaming: () => {
    set((state) => {
      const messages = state.messages.map((m) =>
        m.streaming ? { ...m, streaming: false } : m,
      );
      return { messages, streaming: false, busy: false };
    });
  },

  loadMessages: async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_MESSAGES",
      });
      if (Array.isArray(response)) {
        const messages: ChatMessage[] = response
          .filter((msg: any) => {
            const role = msg.info?.role;
            return role === "user" || role === "assistant";
          })
          .map(parseServerMessage);
        set({ messages });
      }
    } catch {
      // Session might not exist yet
    }
  },

  setBusy: (busy: boolean) => set({ busy }),

  clear: () => set({ messages: [], streaming: false, busy: false }),
}));
