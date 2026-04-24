// Background service worker — central hub for the browser extension.
// Routes messages between content scripts, side panel, and OpenCode server.

import { OpenCodeClient, EventSubscriber } from "@opencode-hub/client";

// ─── State ───────────────────────────────────────────────────

let client: OpenCodeClient | null = null;
let eventSubscriber: EventSubscriber | null = null;
let currentSessionId: string | null = null;

// ─── Connection management ───────────────────────────────────

async function connect(baseUrl: string, password?: string) {
  client = new OpenCodeClient({ baseUrl, password });

  // Verify connection
  const health = await client.health();
  console.log(`Connected to OpenCode server v${health.version}`);

  // Subscribe to SSE events
  eventSubscriber?.disconnect();
  eventSubscriber = new EventSubscriber({
    url: client.eventUrl,
    headers: client.authHeaders,
  });

  eventSubscriber
    .on("event", (event) => {
      // Broadcast SSE events to side panel
      chrome.runtime.sendMessage({
        type: "SSE_EVENT",
        event,
      }).catch(() => {
        // Side panel might not be open
      });
    })
    .on("status", (connected) => {
      chrome.runtime.sendMessage({
        type: "CONNECTION_STATUS",
        connected,
      }).catch(() => {});
    });

  eventSubscriber.connect();

  // Create or get a session
  const sessions = await client.listSessions();
  if (sessions.length > 0) {
    currentSessionId = sessions[0].id;
  } else {
    const session = await client.createSession({ title: "Browser Session" });
    currentSessionId = session.id;
  }

  return { health, sessionId: currentSessionId };
}

function disconnect() {
  eventSubscriber?.disconnect();
  eventSubscriber = null;
  client = null;
  currentSessionId = null;
}

// ─── Message handling ────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((error) => {
    sendResponse({ error: error.message });
  });
  return true; // async response
});

async function handleMessage(message: any): Promise<any> {
  switch (message.type) {
    case "CONNECT":
      return connect(message.baseUrl, message.password);

    case "DISCONNECT":
      disconnect();
      return { ok: true };

    case "GET_STATUS":
      return {
        connected: !!client && (eventSubscriber?.connected ?? false),
        sessionId: currentSessionId,
      };

    case "SEND_MESSAGE":
      if (!client || !currentSessionId) throw new Error("Not connected");
      // Send async and let SSE handle the response streaming
      await client.sendMessageAsync(currentSessionId, {
        parts: [{ type: "text", text: message.text }],
      });
      return { ok: true };

    case "INJECT_CONTEXT":
      if (!client || !currentSessionId) throw new Error("Not connected");
      await client.injectContext(currentSessionId, message.contextText);
      return { ok: true };

    case "LIST_SESSIONS":
      if (!client) throw new Error("Not connected");
      return client.listSessions();

    case "CREATE_SESSION":
      if (!client) throw new Error("Not connected");
      const session = await client.createSession({ title: message.title });
      currentSessionId = session.id;
      return session;

    case "SWITCH_SESSION":
      currentSessionId = message.sessionId;
      return { ok: true, sessionId: currentSessionId };

    case "GET_MESSAGES":
      if (!client || !currentSessionId) throw new Error("Not connected");
      return client.listMessages(currentSessionId);

    case "ABORT":
      if (!client || !currentSessionId) throw new Error("Not connected");
      await client.abortSession(currentSessionId);
      return { ok: true };

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

// ─── Context menus ───────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "opencode-explain",
    title: "Explain with OpenCode",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "opencode-translate",
    title: "Translate with OpenCode",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "opencode-summarize",
    title: "Summarize with OpenCode",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!client || !currentSessionId || !info.selectionText) return;

  const commands: Record<string, string> = {
    "opencode-explain": "Explain the following text:\n\n",
    "opencode-translate": "Translate the following text to English:\n\n",
    "opencode-summarize": "Summarize the following text:\n\n",
  };

  const prefix = commands[info.menuItemId as string];
  if (!prefix) return;

  // Open side panel
  if (tab?.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }

  // Send message
  await client.sendMessageAsync(currentSessionId, {
    parts: [{ type: "text", text: prefix + info.selectionText }],
  });
});

// ─── Side panel trigger ──────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});
