// Content script — runs on every webpage.
// Provides: selection toolbar, floating action button, page content extraction.

import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// ─── Selection toolbar ──────────────────────────────────────

let toolbar: HTMLElement | null = null;

function createToolbar(): HTMLElement {
  const el = document.createElement("div");
  el.id = "opencode-hub-toolbar";
  el.style.cssText = `
    position: absolute;
    z-index: 2147483647;
    display: none;
    background: #1a1b1e;
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.24);
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 12px;
    gap: 2px;
    flex-direction: row;
  `;

  const actions = [
    { id: "explain", label: "Explain", icon: "?" },
    { id: "translate", label: "Translate", icon: "T" },
    { id: "summarize", label: "Summarize", icon: "S" },
    { id: "ask", label: "Ask", icon: "A" },
  ];

  for (const action of actions) {
    const btn = document.createElement("button");
    btn.textContent = action.label;
    btn.dataset.action = action.id;
    btn.style.cssText = `
      padding: 6px 12px;
      border: none;
      background: transparent;
      color: #e4e5e7;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      white-space: nowrap;
      transition: background 0.15s;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(255,255,255,0.1)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "transparent";
    });
    btn.addEventListener("click", () => handleToolbarAction(action.id));
    el.appendChild(btn);
  }

  document.body.appendChild(el);
  return el;
}

function handleToolbarAction(action: string) {
  const selection = window.getSelection()?.toString().trim();
  if (!selection) return;

  hideToolbar();

  const prefixes: Record<string, string> = {
    explain: "Explain the following:\n\n",
    translate: "Translate the following to English:\n\n",
    summarize: "Summarize the following:\n\n",
    ask: "",
  };

  const text = (prefixes[action] ?? "") + selection;

  chrome.runtime.sendMessage({
    type: action === "ask" ? "INJECT_CONTEXT" : "SEND_MESSAGE",
    text,
    contextText: text,
  });

  // Open side panel
  chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" });
}

function showToolbar(x: number, y: number) {
  if (!toolbar) toolbar = createToolbar();
  toolbar.style.display = "flex";
  toolbar.style.left = `${x}px`;
  toolbar.style.top = `${y + 8}px`;
}

function hideToolbar() {
  if (toolbar) {
    toolbar.style.display = "none";
  }
}

// Listen for text selection
document.addEventListener("mouseup", (e) => {
  const selection = window.getSelection();
  const text = selection?.toString().trim();

  if (text && text.length > 3) {
    const range = selection!.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    showToolbar(
      rect.left + window.scrollX + rect.width / 2 - 120,
      rect.bottom + window.scrollY,
    );
  } else {
    hideToolbar();
  }
});

// Hide toolbar when clicking elsewhere
document.addEventListener("mousedown", (e) => {
  if (toolbar && !toolbar.contains(e.target as Node)) {
    hideToolbar();
  }
});

// ─── Page extraction ─────────────────────────────────────────

function extractPageContent(): { title: string; url: string; markdown: string } {
  const title = document.title;
  const url = window.location.href;

  // Clone body and remove scripts, styles, etc.
  const clone = document.body.cloneNode(true) as HTMLElement;
  const removeTags = ["script", "style", "nav", "footer", "iframe", "noscript"];
  for (const tag of removeTags) {
    clone.querySelectorAll(tag).forEach((el) => el.remove());
  }

  const markdown = turndown.turndown(clone.innerHTML);

  return { title, url, markdown };
}

// Listen for extraction requests from background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "EXTRACT_PAGE") {
    sendResponse(extractPageContent());
  }
  return false;
});
