import { create } from "zustand";

interface ConnectionState {
  connected: boolean;
  serverUrl: string;
  sessionId: string | null;
  error: string | null;

  connect: (url: string, password?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  checkStatus: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connected: false,
  serverUrl: "http://127.0.0.1:4096",
  sessionId: null,
  error: null,

  connect: async (url: string, password?: string) => {
    set({ error: null });
    try {
      const response = await chrome.runtime.sendMessage({
        type: "CONNECT",
        baseUrl: url,
        password,
      });
      if (response.error) {
        set({ error: response.error, connected: false });
      } else {
        set({
          connected: true,
          serverUrl: url,
          sessionId: response.sessionId,
        });
      }
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Connection failed",
        connected: false,
      });
    }
  },

  disconnect: async () => {
    await chrome.runtime.sendMessage({ type: "DISCONNECT" });
    set({ connected: false, sessionId: null });
  },

  checkStatus: async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
      set({
        connected: response.connected,
        sessionId: response.sessionId,
      });
    } catch {
      set({ connected: false });
    }
  },
}));
