import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  streaming?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  streaming: boolean;

  addUserMessage: (text: string) => void;
  appendAssistantChunk: (chunk: string) => void;
  startStreaming: () => void;
  stopStreaming: () => void;
  loadMessages: () => Promise<void>;
  clear: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streaming: false,

  addUserMessage: (text: string) => {
    const message: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  startStreaming: () => {
    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      streaming: true,
    };
    set((state) => ({
      messages: [...state.messages, assistantMsg],
      streaming: true,
    }));
  },

  appendAssistantChunk: (chunk: string) => {
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last?.role === "assistant" && last.streaming) {
        messages[messages.length - 1] = {
          ...last,
          content: last.content + chunk,
        };
      }
      return { messages };
    });
  },

  stopStreaming: () => {
    set((state) => {
      const messages = state.messages.map((m) =>
        m.streaming ? { ...m, streaming: false } : m,
      );
      return { messages, streaming: false };
    });
  },

  loadMessages: async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_MESSAGES",
      });
      if (Array.isArray(response)) {
        const messages: ChatMessage[] = response.map((msg: any) => ({
          id: msg.info.id,
          role: msg.info.role,
          content: msg.parts
            ?.filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("") ?? "",
          timestamp: msg.info.createdAt,
        }));
        set({ messages });
      }
    } catch {
      // Session might not exist yet
    }
  },

  clear: () => set({ messages: [], streaming: false }),
}));
