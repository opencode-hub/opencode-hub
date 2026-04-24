import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon } from "obsidian";
import type OpenCodeHubPlugin from "./main";
import type { Session, MessageResponse, MessagePartResponse } from "@opencode-hub/client";
import fuzzysort from "fuzzysort";

export const SIDEBAR_VIEW_TYPE = "opencode-hub-sidebar";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ParsedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolParts: ToolPart[];
  /** Reasoning/thinking text (if model supports it) */
  reasoning?: string;
  timestamp: number;
  /** Duration in seconds for assistant messages (estimated from tool parts or step markers) */
  durationSec?: number;
  /** Agent name if available */
  agent?: string;
  /** Model name if available */
  model?: string;
  /** Token counts */
  tokens?: { input?: number; output?: number; reasoning?: number };
  /** Cost in USD */
  cost?: number;
}

interface ToolPart {
  type: string;
  title: string;
  detail: string;
  status?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args?: any; // Raw parsed args for special tools (question, task, etc.)
}

interface PendingAttachment {
  type: "image";
  data: string;
  mimeType: string;
  name: string;
}

/** Items that appear in the slash or @ popovers */
interface PopoverItem {
  id: string;
  label: string;
  description?: string;
  icon: string;
  /** Tag badge text, e.g. "Skill", "MCP" */
  tag?: string;
  action: () => void;
}

// ---------------------------------------------------------------------------
// CSS — injected once into document.head for persistence across re-opens
// ---------------------------------------------------------------------------

const STYLE_ID = "och-sidebar-styles";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

const STYLES = /* css */ `
/* ── Obsidian overrides — reset host container ───────────── */
/* .view-content is the parent Obsidian wraps our view in.
   It sets padding + overflow:auto which breaks our flex layout. */
.workspace-leaf-content[data-type="opencode-hub-sidebar"] .view-content {
  padding: 0 !important;
  overflow: hidden !important;
}

/* ── Layout ──────────────────────────────────────────────── */
.opencode-hub-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 13px;
  color: var(--text-normal);
  overflow: hidden;
}

/* Reset Obsidian's global button styles inside our sidebar.
   Obsidian sets: height: 30px, padding, border-radius, background on ALL buttons. */
.opencode-hub-sidebar button {
  background: transparent;
  border: none;
  height: auto;
  min-height: 0;
  padding: 0;
  margin: 0;
  box-shadow: none;
  border-radius: 0;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Ensure all SVGs inside our sidebar behave as inline-flex items */
.opencode-hub-sidebar svg {
  display: inline-block;
  flex-shrink: 0;
}

/* ── Header ──────────────────────────────────────────────── */
.och-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--background-modifier-border);
  flex-shrink: 0;
  min-height: 38px;
}
.och-header-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-normal);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.och-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.och-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px !important;
  height: 26px !important;
  min-width: 26px;
  min-height: 26px;
  padding: 0 !important;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.och-icon-btn svg {
  width: 14px;
  height: 14px;
}
.och-icon-btn:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
.och-icon-btn:active {
  background: var(--background-modifier-active-hover, var(--background-modifier-hover));
  color: var(--text-normal);
}

/* Session dropdown — anchored to header, right-aligned, with search */
.och-header { position: relative; } /* anchor for dropdown */
.och-session-dropdown {
  position: absolute;
  top: calc(100% + 2px);
  right: 0;
  left: 0;
  max-height: min(360px, 60vh);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 100;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 4px;
}
.och-session-search {
  display: block;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-bottom: 1px solid var(--background-modifier-border);
  background: transparent;
  color: var(--text-normal);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  flex-shrink: 0;
  margin-bottom: 2px;
}
.och-session-search::placeholder { color: var(--text-faint); }
.och-session-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.och-session-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.och-session-item:hover { background: var(--background-modifier-hover); }
.och-session-item--active {
  background: var(--background-secondary);
  font-weight: 600;
}
.och-session-item-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.och-session-item-time {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-faint);
}
.och-session-delete-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.1s;
}
.och-session-delete-btn svg { width: 12px; height: 12px; }
.och-session-item:hover .och-session-delete-btn { opacity: 1; }
.och-session-delete-btn:hover {
  color: var(--text-error, #ef4444);
  background: var(--background-modifier-hover);
}

/* ── Chat area ───────────────────────────────────────────── */
.och-chat-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.och-chat {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  scroll-behavior: smooth;
}

/* Empty state */
.och-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: var(--text-faint);
  text-align: center;
  padding: 24px;
}
.och-empty-icon {
  width: 36px;
  height: 36px;
  opacity: 0.3;
}
.och-empty-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
}
.och-empty-hint {
  font-size: 11px;
  color: var(--text-faint);
}

/* ── Messages — left/right chat bubbles ──────────────────── */
.och-turn {
  margin-bottom: 20px;
  overflow: hidden;
}

/* User message — right-aligned bubble */
.och-user-msg {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-bottom: 4px;
}
.och-user-msg-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.och-user-msg-actions .och-msg-action-btn {
  color: var(--text-faint);
}
.och-user-msg-time {
  font-size: 12px;
  color: var(--text-faint);
  margin-right: 4px;
}
.och-user-msg:hover .och-user-msg-actions {
  opacity: 1;
}
.och-user-bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 14px 14px 4px 14px;
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  cursor: text;
}
.och-user-bubble ::selection,
.och-user-bubble::selection {
  background: rgba(255, 255, 255, 0.35);
  color: inherit;
}
/* Highlighted @mention pills inside user bubble */
.och-user-bubble .och-inline-pill {
  display: inline;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.2);
  color: inherit;
}

/* Assistant message — left-aligned */
.och-assistant-msg {
  margin-top: 12px;
}
.och-assistant-content {
  font-size: 13px;
  line-height: 1.7;
  user-select: text;
  cursor: text;
}
.och-assistant-content p:first-child { margin-top: 0; }
.och-assistant-content p:last-child { margin-bottom: 0; }

/* Message metadata line — transparent by default, visible on hover */
.och-msg-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-faint);
  opacity: 0;
  transition: opacity 0.15s;
}
.och-assistant-msg:hover .och-msg-meta {
  opacity: 1;
}
.och-msg-meta-sep {
  color: var(--text-faint);
  opacity: 0.5;
}

/* Message actions — inline with metadata */
.och-msg-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.och-msg-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  transition: color 0.1s, background 0.1s;
}
.och-msg-action-btn:hover {
  color: var(--text-muted);
  background: var(--background-modifier-hover);
}
.och-msg-action-btn svg {
  width: 13px;
  height: 13px;
}

/* Thinking indicator */
.och-thinking {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 12px;
  padding: 4px 0;
  animation: och-shimmer 1.5s ease-in-out infinite;
}
@keyframes och-shimmer {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* ── Reasoning display ───────────────────────────────────── */
.och-reasoning {
  margin: 6px 0;
}
.och-reasoning-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  padding: 3px 0;
  width: 100%;
  text-align: left;
}
.och-reasoning-header:hover { color: var(--text-normal); }
.och-reasoning-label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}
.och-reasoning-summary {
  font-style: italic;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.och-reasoning-content {
  padding: 6px 10px;
  margin: 2px 0;
  border-radius: 4px;
  background: var(--background-secondary);
  border-left: 3px solid var(--background-modifier-border);
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}
.och-reasoning-content p {
  margin: 0 0 6px;
}
.och-reasoning-content p:last-child {
  margin-bottom: 0;
}

/* ── Tool calls — grouped by category ────────────────────── */
.och-tool-group {
  margin: 8px 0;
  border-left: 2px solid var(--background-modifier-border);
  padding-left: 14px;
}
.och-tool-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
}
.och-tool-group-header:hover { color: var(--text-normal); }
.och-tool-group-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.och-tool-group-chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transition: transform 0.15s;
  margin-left: auto;
}
.och-tool-group-chevron--open { transform: rotate(90deg); }
.och-tool-group-details {
  display: none;
  padding: 6px 0 4px 0;
}
.och-tool-group-details--open { display: block; }
.och-tool-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  color: var(--text-faint);
  cursor: pointer;
}
.och-tool-entry:hover { color: var(--text-muted); }
.och-tool-entry-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.och-tool-entry-name {
  font-weight: 500;
  color: var(--text-muted);
  flex-shrink: 0;
}
.och-tool-entry-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-faint);
}
.och-tool-entry-status {
  font-size: 11px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--background-modifier-hover);
}
.och-tool-entry-status--success { color: #22c55e; }
.och-tool-entry-status--error { color: #ef4444; }
.och-tool-detail-pane {
  display: none;
  padding: 4px 0 4px 22px;
  font-size: 12px;
  color: var(--text-faint);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
  border-left: 1px solid var(--background-modifier-border);
  margin-left: 7px;
}
.och-tool-detail-pane--open { display: block; }

/* Question card — TUI-inspired: left accent border, numbered options */
.och-question-card {
  margin: 12px 0;
  padding: 14px 16px 14px 14px;
  border-left: 3px solid var(--interactive-accent);
  border-radius: 0 8px 8px 0;
  background: var(--background-secondary);
}
.och-question-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-accent);
  margin-bottom: 6px;
}
.och-question-text {
  font-size: 13px;
  color: var(--text-normal);
  line-height: 1.6;
  margin-bottom: 12px;
}
.och-question-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 0;
}
.och-question-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 6px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-normal);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
  height: auto;
  min-height: 0;
  width: 100%;
}
.och-question-option:hover:not(:disabled) {
  background: var(--background-modifier-hover);
}
.och-question-option .och-question-option-num {
  color: var(--text-faint);
  font-size: 13px;
  min-width: 20px;
  display: inline-block;
  flex-shrink: 0;
}
.och-question-option .och-question-option-label-row {
  display: flex;
  align-items: baseline;
  gap: 2px;
}
.och-question-option .och-question-option-label {
  font-weight: 500;
  color: var(--text-normal);
}
.och-question-option-desc {
  color: var(--text-muted);
  font-size: 12px;
  padding-left: 24px;
  line-height: 1.5;
  margin-top: 1px;
}
.och-question-option[data-picked="true"] {
  background: var(--background-modifier-hover);
}
.och-question-option[data-picked="true"] .och-question-option-label {
  color: var(--interactive-accent);
}
/* Checkbox/radio indicators */
.och-question-option-check {
  font-family: monospace;
  color: var(--text-faint);
  margin-right: 4px;
  flex-shrink: 0;
  font-size: 12px;
}
.och-question-option[data-picked="true"] .och-question-option-check {
  color: var(--text-success, #10b981);
}
.och-question-option-checkmark {
  color: var(--text-success, #10b981);
  font-weight: 600;
  margin-left: 6px;
}
/* Tab bar for multi-question */
.och-question-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  padding-bottom: 8px;
  overflow-x: auto;
}
.och-question-tab {
  padding: 5px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-faint);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  height: auto;
  min-height: 0;
  transition: background 0.1s, color 0.1s;
}
.och-question-tab:hover { background: var(--background-modifier-hover); }
.och-question-tab[data-active="true"] {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}
.och-question-tab[data-answered="true"]:not([data-active="true"]) {
  color: var(--text-normal);
  font-weight: 500;
}
.och-question-tab[data-ready="true"]:not([data-active="true"]) {
  color: var(--text-success, #10b981);
  font-weight: 600;
}
/* Footer actions */
.och-question-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--background-modifier-border);
}
.och-question-footer-actions {
  display: flex;
  gap: 8px;
}
.och-question-footer-btn {
  padding: 5px 14px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  height: auto;
  min-height: 0;
  transition: background 0.1s;
}
.och-question-footer-btn:hover:not(:disabled) {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
.och-question-footer-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.och-question-dismiss {
  border: none;
  color: var(--text-faint);
}
.och-question-submit {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border-color: var(--interactive-accent);
}
.och-question-submit:hover:not(:disabled) {
  background: var(--interactive-accent-hover);
  color: var(--text-on-accent);
}
/* Custom answer input */
.och-question-custom {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding-left: 0;
}
.och-question-custom-input {
  flex: 1;
  padding: 5px 10px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 13px;
  outline: none;
  height: auto;
  min-height: 0;
}
.och-question-custom-input:focus {
  border-color: var(--interactive-accent);
}
.och-question-custom-input::placeholder {
  color: var(--text-faint);
}

/* Error message */
.och-error-msg {
  margin-bottom: 14px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: var(--text-error, #ef4444);
  font-size: 12px;
}

/* ── Jump-to-bottom FAB ──────────────────────────────────── */
.och-jump-bottom {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-muted);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  z-index: 10;
  transition: opacity 0.15s;
}
.och-jump-bottom:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}

/* ── Composer region (bottom) ────────────────────────────── */
.och-composer {
  flex-shrink: 0;
  border-top: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  padding-bottom: 28px;
  /* Tight vertical grouping — input + tray feel like one unit */
}

/* Context strip — active file + open tabs chips above input */
.och-context-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px 0;
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: none;
}
.och-context-strip::-webkit-scrollbar { display: none; }
.och-context-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.och-context-chip--active {
  color: var(--text-accent);
  border-color: rgba(var(--interactive-accent-rgb, 72, 120, 255), 0.3);
  background: rgba(var(--interactive-accent-rgb, 72, 120, 255), 0.06);
}
.och-context-chip-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  opacity: 0.7;
}
.och-context-chip-icon svg {
  width: 12px;
  height: 12px;
}
.och-context-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.och-context-more {
  font-size: 10px;
  color: var(--text-faint);
  flex-shrink: 0;
  white-space: nowrap;
}

/* Attachments preview — inside composer, above input */
.och-attachments {
  display: flex;
  gap: 6px;
  padding: 6px 12px 0;
}
.och-attachment-thumb {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--background-modifier-border);
}
.och-attachment-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.och-attachment-remove {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--text-error, #ef4444);
  color: white;
  border: none;
  cursor: pointer;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* Input row — editor only, full width */
.och-input-row {
  position: relative;
  padding: 8px 12px 2px;
}

/* The contenteditable input */
.och-editor {
  width: 100%;
  min-height: 36px;
  max-height: 160px;
  overflow-y: auto;
  padding: 8px 10px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  color: var(--text-normal);
  background: var(--background-secondary);
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  transition: border-color 0.15s;
}
.och-editor:focus {
  border-color: var(--interactive-accent);
}
.och-editor:empty::before {
  content: attr(data-placeholder);
  color: var(--text-faint);
  pointer-events: none;
}
.och-editor[data-disabled="true"] {
  opacity: 0.5;
  pointer-events: none;
}

/* Inline pills inside contenteditable */
.och-pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  vertical-align: baseline;
  line-height: 1.6;
  user-select: all;
}
.och-pill--file {
  color: var(--text-accent);
  background: rgba(var(--interactive-accent-rgb, 72, 120, 255), 0.12);
}
.och-pill--agent {
  color: var(--text-warning, #e6a700);
  background: rgba(230, 167, 0, 0.1);
}

/* Submit button — dark circle, white arrow, inverted from background */
.opencode-hub-sidebar .och-submit-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none !important;
  border-radius: 50% !important;
  background: var(--text-normal) !important;
  color: var(--background-primary) !important;
  cursor: pointer;
  transition: opacity 0.15s;
  margin-left: auto;
  padding: 0 !important;
}
.opencode-hub-sidebar .och-submit-btn:hover { opacity: 0.85; }
.opencode-hub-sidebar .och-submit-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.opencode-hub-sidebar .och-submit-btn svg {
  width: 16px;
  height: 16px;
  color: var(--background-primary);
}

/* Spinner for submit */
.och-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--text-on-accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: och-spin 0.65s linear infinite;
}
@keyframes och-spin { to { transform: rotate(360deg); } }

/* ── Dock tray (below input) ─────────────────────────────── */
.och-dock-tray {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 6px;
  font-size: 11px;
  position: relative;
}

/* Tray select (ghost button) */
.och-tray-select {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background 0.1s, color 0.1s;
}
.och-tray-select:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
.och-tray-chevron {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  opacity: 0.6;
}

/* Tray separator dot */
.och-tray-sep {
  color: var(--text-faint);
  opacity: 0.4;
  font-size: 10px;
}

/* Server info items (read-only model, thinking, agent labels) */
.och-tray-label {
  font-size: 11px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Dropdown (used for agent, model, variant selects) ───── */
.och-dropdown {
  position: absolute;
  bottom: calc(100% + 4px);
  min-width: 160px;
  max-height: 240px;
  overflow-y: auto;
  z-index: 200;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  padding: 4px;
}
.och-dropdown-search {
  display: block;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-bottom: 1px solid var(--background-modifier-border);
  background: transparent;
  color: var(--text-normal);
  font-size: 11px;
  font-family: inherit;
  outline: none;
  margin-bottom: 2px;
}
.och-dropdown-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-normal);
}
.och-dropdown-item:hover,
.och-dropdown-item--active {
  background: var(--background-modifier-hover);
}
.och-dropdown-item--selected {
  font-weight: 600;
}
.och-dropdown-item-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--text-muted);
}
.och-dropdown-item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.och-dropdown-item-desc {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.och-dropdown-item-tag {
  flex-shrink: 0;
  font-size: 9px;
  color: var(--text-faint);
  padding: 0 4px;
  border-radius: 3px;
  background: var(--background-secondary);
}

/* ── Popover (slash & @ mention) ─────────────────────────── */
.och-popover {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 320px;
  overflow-y: auto;
  z-index: 200;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.15);
  padding: 4px;
}
.och-popover-section {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-faint);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 8px 2px;
}
.och-popover-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.och-popover-item:hover,
.och-popover-item--active {
  background: var(--background-modifier-hover);
}
.och-popover-item-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--text-muted);
}
.och-popover-item-label {
  font-weight: 500;
  color: var(--text-normal);
  white-space: nowrap;
}
.och-popover-item-desc {
  flex: 1;
  min-width: 0;
  color: var(--text-faint);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.och-popover-item-tag {
  flex-shrink: 0;
  font-size: 9px;
  color: var(--text-faint);
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--background-secondary);
}
.och-popover-item-shortcut {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-faint);
  font-family: var(--font-monospace);
}
.och-popover-empty {
  padding: 12px;
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
}
`;

// ---------------------------------------------------------------------------
// Sidebar view
// ---------------------------------------------------------------------------

/**
 * Sidebar chat view for OpenCode Hub in Obsidian.
 *
 * Layout (top → bottom):
 *   Header
 *   Chat area (with jump-to-bottom FAB)
 *   Composer region:
 *     Attachments preview
 *     Input row (contenteditable + submit) + popovers
 *     Dock tray (agent · model · variant · context)
 */
export class SidebarView extends ItemView {
  private plugin: OpenCodeHubPlugin;

  // State
  private messages: ParsedMessage[] = [];
  private sessions: Session[] = [];
  private waiting = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** SSE-driven session status: "idle" | "busy" | "retry" | undefined (no SSE data yet) */
  private _sessionStatus: string | undefined;
  /** Throttle timer for poll triggered by SSE events */
  private _pollThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether a poll is currently in flight (prevents concurrent polls) */
  private _pollInFlight = false;
  /** Pending question from question.asked SSE event */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _pendingQuestion: {
    id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    questions: any[];
    tab: number;              // current question index
    answers: string[][];      // answers[questionIdx] = [selected labels]
  } | null = null;
  private pendingAttachments: PendingAttachment[] = [];
  private promptHistory: string[] = [];
  private historyIdx = -1;

  // Popover state
  private activePopover: "slash" | "mention" | null = null;
  private popoverItems: PopoverItem[] = [];
  private popoverActiveIdx = 0;
  private mentionSearchTimer: ReturnType<typeof setTimeout> | null = null;

  // Dropdown state (agent, model, variant)
  private activeDropdown: "session" | "agent" | "model" | "variant" | null = null;

  // DOM refs
  private headerTitleEl!: HTMLElement;
  private sessionDropdownEl!: HTMLElement;
  private chatWrapEl!: HTMLElement; // relative wrapper for chat + FAB
  private chatEl!: HTMLElement;
  private jumpBottomEl!: HTMLElement;
  private composerEl!: HTMLElement;
  private attachmentsEl!: HTMLElement;
  private inputRowEl!: HTMLElement;
  private editorEl!: HTMLDivElement;
  private submitBtnEl!: HTMLButtonElement;
  private popoverEl!: HTMLElement;
  private dockTrayEl!: HTMLElement;
  private agentSelectEl!: HTMLElement;
  private modelLabelEl!: HTMLElement;
  private dropdownEl!: HTMLElement; // shared dropdown element

  constructor(leaf: WorkspaceLeaf, plugin: OpenCodeHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return SIDEBAR_VIEW_TYPE; }
  getDisplayText(): string { return "OpenCode Hub"; }
  getIcon(): string { return "message-circle"; }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  async onOpen(): Promise<void> {
    ensureStyles();

    // Use contentEl (Obsidian's .view-content) directly — not containerEl.children[1]
    // See: https://github.com/mtymek/opencode-obsidian for reference pattern
    this.contentEl.empty();
    this.contentEl.addClass("opencode-hub-sidebar");

    this.buildHeader(this.contentEl);
    this.buildChatArea(this.contentEl);
    this.buildComposer(this.contentEl);

    // Close dropdowns/popovers on outside click
    this.registerDomEvent(document, "mousedown", (e: MouseEvent) => {
      const t = e.target as Node;
      if (this.activeDropdown === "session" && !this.sessionDropdownEl.contains(t)) {
        const anchor = this.sessionDropdownEl.parentElement;
        if (!anchor?.contains(t)) this.closeDropdown();
      }
      if (this.activeDropdown && this.activeDropdown !== "session" && !this.dropdownEl.contains(t)) {
        if (!this.agentSelectEl.contains(t)) {
          this.closeDropdown();
        }
      }
      if (this.activePopover && !this.popoverEl.contains(t) && !this.editorEl.contains(t)) {
        this.closePopover();
      }
    });

    await this.refreshSessions();
    await this.loadMessages();
    this.refreshContextStrip();
  }

  async onClose(): Promise<void> {
    this.stopPolling();
  }

  // =========================================================================
  // 1. HEADER
  // =========================================================================

  private buildHeader(root: HTMLElement): void {
    const header = root.createDiv({ cls: "och-header" });

    this.headerTitleEl = header.createDiv({ cls: "och-header-title" });
    this.updateHeaderTitle();

    const actions = header.createDiv({ cls: "och-header-actions" });

     // Clock — session history (dropdown anchored to header, not to this button)
    const clockBtn = actions.createEl("button", {
      cls: "och-icon-btn",
      attr: { "aria-label": "Session history" },
    });
    setIcon(clockBtn, "clock");
    clockBtn.addEventListener("click", () => this.toggleSessionDropdown());

    // Dropdown is a child of .och-header (position: relative) for full-width alignment
    this.sessionDropdownEl = header.createDiv({ cls: "och-session-dropdown" });
    this.sessionDropdownEl.style.display = "none";

    // New chat
    const newBtn = actions.createEl("button", {
      cls: "och-icon-btn",
      attr: { "aria-label": "New chat" },
    });
    setIcon(newBtn, "message-square-plus");
    newBtn.addEventListener("click", () => this.createNewSession());
  }

  private updateHeaderTitle(): void {
    const active = this.sessions.find((s) => s.id === this.plugin.currentSessionId);
    if (!active) {
      this.headerTitleEl.textContent = "New Session";
      return;
    }
    // Server default title is "New session - <ISO timestamp>" — show "New Session" instead
    const title = active.title || "";
    const isDefault = /^(New session|Child session) - \d{4}-/.test(title);
    this.headerTitleEl.textContent = isDefault ? "New Session" : (title || "New Session");
  }

  // ── Session dropdown ────────────────────────────────────────

  private toggleSessionDropdown(): void {
    if (this.activeDropdown === "session") {
      this.closeDropdown();
    } else {
      this.openSessionDropdown();
    }
  }

  private async openSessionDropdown(): Promise<void> {
    this.closeDropdown();
    this.closePopover();
    await this.refreshSessions();
    this.renderSessionDropdown();
    this.sessionDropdownEl.style.display = "block";
    this.activeDropdown = "session";
  }

  private renderSessionDropdown(): void {
    this.sessionDropdownEl.empty();

    // Search input
    const searchInput = this.sessionDropdownEl.createEl("input", {
      cls: "och-session-search",
      attr: { type: "text", placeholder: "Search sessions\u2026" },
    });

    // Scrollable session list
    const listEl = this.sessionDropdownEl.createDiv({ cls: "och-session-list" });

    const renderList = (filter: string) => {
      listEl.empty();
      const lowerFilter = filter.toLowerCase();
      const filtered = filter
        ? this.sessions.filter((s) => {
            const title = s.title || s.id;
            return title.toLowerCase().includes(lowerFilter);
          })
        : this.sessions;

      if (filtered.length === 0) {
        const empty = listEl.createDiv({ cls: "och-session-item" });
        empty.createSpan({ cls: "och-session-item-title", text: filter ? "No matches" : "No sessions" });
        return;
      }

      for (const session of filtered) {
        const item = listEl.createDiv({ cls: "och-session-item" });
        if (session.id === this.plugin.currentSessionId) item.addClass("och-session-item--active");

        item.createSpan({
          cls: "och-session-item-title",
          text: session.title || `Session ${session.id.slice(0, 8)}`,
        });

        // Relative time — handle both formats:
        //   server sends time.updated (epoch ms), client type says updatedAt (string)
        item.createSpan({
          cls: "och-session-item-time",
          text: this.relativeTime(this.parseSessionTime(session)),
        });

        const delBtn = item.createEl("button", {
          cls: "och-session-delete-btn",
          attr: { "aria-label": "Delete session" },
        });
        setIcon(delBtn, "x");

        item.addEventListener("click", (e) => {
          if (!(e.target as HTMLElement).closest(".och-session-delete-btn")) {
            this.switchSession(session.id);
          }
        });
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.deleteSession(session.id);
        });
      }
    };

    // Initial render
    renderList("");

    // Filter on input
    searchInput.addEventListener("input", () => renderList(searchInput.value));

    // Focus search input
    setTimeout(() => searchInput.focus(), 50);
  }

  /** Parse session timestamp — handles both `updatedAt` (string) and `time.updated` (epoch ms) */
  private parseSessionTime(session: Session): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = session as any;
    // Server format: time: { updated: number, created: number }
    if (s.time && typeof s.time === "object") {
      if (typeof s.time.updated === "number" && s.time.updated > 0) return s.time.updated;
      if (typeof s.time.created === "number" && s.time.created > 0) return s.time.created;
    }
    // Client type format: updatedAt / createdAt as string
    if (s.updatedAt) {
      const ms = new Date(s.updatedAt).getTime();
      if (!isNaN(ms)) return ms;
    }
    if (s.createdAt) {
      const ms = new Date(s.createdAt).getTime();
      if (!isNaN(ms)) return ms;
    }
    return 0;
  }

  private async refreshSessions(): Promise<void> {
    if (!this.plugin.client) { this.sessions = []; return; }
    try {
      this.sessions = await this.plugin.client.listSessions();
      this.sessions.sort((a, b) => this.parseSessionTime(b) - this.parseSessionTime(a));
    } catch { this.sessions = []; }
    this.updateHeaderTitle();
  }

  private async switchSession(sessionId: string): Promise<void> {
    this.closeDropdown();
    if (sessionId === this.plugin.currentSessionId) return;
    this.plugin.currentSessionId = sessionId;
    this.stopPolling();
    this.updateHeaderTitle();
    await this.loadMessages();
  }

  private async createNewSession(): Promise<void> {
    if (!this.plugin.client) return;
    try {
      // Don't set title — server auto-generates from first message
      const session = await this.plugin.client.createSession({});
      this.plugin.currentSessionId = session.id;
      this.stopPolling();
      this.messages = [];
      this.renderChat();
      await this.refreshSessions();
    } catch { this.showError("Failed to create new session."); }
  }

  private async deleteSession(sessionId: string): Promise<void> {
    if (!this.plugin.client) return;
    try {
      await this.plugin.client.deleteSession(sessionId);
      if (sessionId === this.plugin.currentSessionId) {
        this.plugin.currentSessionId = null;
        this.messages = [];
      }
      await this.refreshSessions();
      if (!this.plugin.currentSessionId && this.sessions.length > 0) {
        await this.switchSession(this.sessions[0].id);
      } else {
        this.renderChat();
        this.renderSessionDropdown();
      }
    } catch { this.showError("Failed to delete session."); }
  }

  // =========================================================================
  // 2. CHAT AREA
  // =========================================================================

  private buildChatArea(root: HTMLElement): void {
    // Wrapper for chat + jump-to-bottom FAB
    this.chatWrapEl = root.createDiv({ cls: "och-chat-wrap" });
    this.chatEl = this.chatWrapEl.createDiv({ cls: "och-chat" });

    // Jump-to-bottom button (hidden by default)
    this.jumpBottomEl = this.chatWrapEl.createDiv({ cls: "och-jump-bottom" });
    this.jumpBottomEl.style.display = "none";
    setIcon(this.jumpBottomEl, "chevron-down");
    this.jumpBottomEl.addEventListener("click", () => this.scrollToBottom());

    // Show/hide jump button based on scroll position
    this.chatEl.addEventListener("scroll", () => {
      const { scrollTop, scrollHeight, clientHeight } = this.chatEl;
      const distFromBottom = scrollHeight - scrollTop - clientHeight;
      this.jumpBottomEl.style.display = distFromBottom > 120 ? "flex" : "none";
    });
  }

  private renderChat(): void {
    this.chatEl.empty();

    if (this.messages.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Group messages into turns (user + following assistant messages)
    let i = 0;
    while (i < this.messages.length) {
      const turnEl = this.chatEl.createDiv({ cls: "och-turn" });
      const msg = this.messages[i];

      if (msg.role === "user") {
        this.renderUserMessage(turnEl, msg);
        i++;
        // Render following assistant messages in same turn
        while (i < this.messages.length && this.messages[i].role === "assistant") {
          this.renderAssistantMessage(turnEl, this.messages[i], i === this.messages.length - 1);
          i++;
        }
      } else {
        // Orphan assistant message (no preceding user msg)
        this.renderAssistantMessage(turnEl, msg, i === this.messages.length - 1);
        i++;
      }
    }

    // Render pending question card (from question.asked SSE event)
    if (this._pendingQuestion) {
      this.renderPendingQuestion();
    }

    this.scrollToBottom();
  }

  /** Render the pending question card at the bottom of chat (TUI style with tabs) */
  private renderPendingQuestion(): void {
    if (!this._pendingQuestion) return;
    const pq = this._pendingQuestion;
    const { questions, tab, answers } = pq;
    const single = questions.length === 1;
    // Clamp tab to valid range
    if (tab >= questions.length) pq.tab = questions.length - 1;
    const q = questions[pq.tab];
    if (!q) return;

    const card = this.chatEl.createDiv({ cls: "och-question-card" });

    // Tab bar for multi-question (like TUI horizontal tabs)
    if (!single) {
      const tabBar = card.createDiv({ cls: "och-question-tabs" });
      questions.forEach((qq: { header?: string }, i: number) => {
        const tabEl = tabBar.createEl("button", {
          cls: "och-question-tab",
          text: qq.header || `Q${i + 1}`,
        });
        if (i === tab) tabEl.dataset.active = "true";
        if (answers[i] && answers[i].length > 0) tabEl.dataset.answered = "true";
        tabEl.addEventListener("click", () => {
          pq.tab = i;
          this.renderChat();
        });
      });
      // Confirm tab
      const confirmTab = tabBar.createEl("button", {
        cls: "och-question-tab",
        text: "Confirm",
      });
      const allAnswered = answers.every((a) => a.length > 0);
      if (allAnswered) confirmTab.dataset.ready = "true";
      confirmTab.addEventListener("click", () => {
        if (allAnswered) this.submitQuestion();
      });
    }

    // Header
    if (q.header) {
      card.createDiv({ cls: "och-question-header", text: q.header });
    }

    // Question text
    const multi = q.multiple === true;
    const qText = q.question + (multi ? " (select all that apply)" : "");
    card.createDiv({ cls: "och-question-text", text: qText });

    // Options
    if (Array.isArray(q.options) && q.options.length > 0) {
      const optionsEl = card.createDiv({ cls: "och-question-options" });
      const currentAnswers = answers[tab] || [];

      q.options.forEach((opt: { label: string; description?: string }, idx: number) => {
        const picked = currentAnswers.includes(opt.label);
        const btn = optionsEl.createEl("button", { cls: "och-question-option" });
        btn.dataset.picked = String(picked);

        // Label row: "1. [✓] JSON" or "1. JSON ✓"
        const labelRow = btn.createDiv({ cls: "och-question-option-label-row" });
        labelRow.createSpan({ cls: "och-question-option-num", text: `${idx + 1}.` });
        if (multi) {
          labelRow.createSpan({
            cls: "och-question-option-check",
            text: picked ? "[✓]" : "[ ]",
          });
        }
        labelRow.createSpan({ cls: "och-question-option-label", text: opt.label });
        if (!multi && picked) {
          labelRow.createSpan({ cls: "och-question-option-checkmark", text: " ✓" });
        }

        // Description
        if (opt.description) {
          btn.createDiv({ cls: "och-question-option-desc", text: opt.description });
        }

        btn.addEventListener("click", () => {
          if (multi) {
            // Toggle selection
            if (currentAnswers.includes(opt.label)) {
              pq.answers[tab] = currentAnswers.filter((a) => a !== opt.label);
            } else {
              pq.answers[tab] = [...currentAnswers, opt.label];
            }
            this.renderChat();
          } else {
            // Single select: pick and advance
            pq.answers[pq.tab] = [opt.label];
            if (single) {
              // Only one question: submit immediately
              this.submitQuestion();
            } else {
              // Advance to next unanswered question, or stay on last
              const curTab = pq.tab;
              const nextTab = questions.findIndex((_: unknown, i: number) => i > curTab && (!pq.answers[i] || pq.answers[i].length === 0));
              if (nextTab >= 0) {
                pq.tab = nextTab;
              } else {
                // All answered — stay on current, user can click Submit
              }
              this.renderChat();
            }
          }
        });
      });

      // Custom answer input
      const customRow = card.createDiv({ cls: "och-question-custom" });
      const customInput = customRow.createEl("input", {
        cls: "och-question-custom-input",
        attr: { type: "text", placeholder: "Type your own answer..." },
      });
      const customBtn = customRow.createEl("button", {
        cls: "och-question-footer-btn",
        text: "Send",
      });
      const submitCustom = () => {
        const val = customInput.value.trim();
        if (!val) return;
        if (single) {
          pq.answers[pq.tab] = [val];
          this.submitQuestion();
        } else {
          pq.answers[pq.tab] = [val];
          const curTab = pq.tab;
          const nextTab = questions.findIndex((_: unknown, i: number) => i > curTab && (!pq.answers[i] || pq.answers[i].length === 0));
          if (nextTab >= 0) pq.tab = nextTab;
          this.renderChat();
        }
      };
      customBtn.addEventListener("click", submitCustom);
      customInput.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); submitCustom(); }
      });
      }

    // Footer: Dismiss | Back | Next/Submit
    const footer = card.createDiv({ cls: "och-question-footer" });

    // Dismiss
    const dismissBtn = footer.createEl("button", { cls: "och-question-footer-btn och-question-dismiss", text: "Dismiss" });
    dismissBtn.addEventListener("click", async () => {
      try { await this.plugin.client?.rejectQuestion(pq.id); } catch { /* ignore */ }
      this._pendingQuestion = null;
      this.setWaiting(true);
      this.editorEl.dataset.placeholder = "Message\u2026";
      this.startPolling();
      this.renderChat();
    });

    const actionsEl = footer.createDiv({ cls: "och-question-footer-actions" });

    // Back (multi-question only)
    if (!single && pq.tab > 0) {
      const backBtn = actionsEl.createEl("button", { cls: "och-question-footer-btn", text: "Back" });
      backBtn.addEventListener("click", () => { pq.tab = pq.tab - 1; this.renderChat(); });
    }

    // Submit (single) or Next/Submit (multi)
    if (single) {
      // Single question: just a submit button (or user clicks an option to auto-submit)
    } else {
      const curTab = pq.tab;
      const isLast = curTab >= questions.length - 1;
      const allAnswered = pq.answers.every((a) => a.length > 0);
      const btnText = isLast ? (allAnswered ? "Submit" : "Submit") : "Next";
      const btnCls = isLast && allAnswered ? "och-question-footer-btn och-question-submit" : "och-question-footer-btn";
      const nextBtn = actionsEl.createEl("button", { cls: btnCls, text: btnText });
      if (isLast && !allAnswered) nextBtn.disabled = true;
      nextBtn.addEventListener("click", () => {
        if (isLast && allAnswered) {
          this.submitQuestion();
        } else if (!isLast) {
          pq.tab = curTab + 1;
          this.renderChat();
        }
      });
    }
  }

  /** Submit all accumulated question answers */
  private async submitQuestion(): Promise<void> {
    if (!this._pendingQuestion) return;
    const pq = this._pendingQuestion;
    try {
      await this.plugin.client?.replyQuestion(pq.id, pq.answers);
    } catch {
      // Fallback: send first answer as text
      const firstAnswer = pq.answers.flat()[0];
      if (firstAnswer) {
        this.editorEl.textContent = firstAnswer;
        this.handleSend();
      }
      return;
    }
    this._pendingQuestion = null;
    this.setWaiting(true);
    this.editorEl.dataset.placeholder = "Message\u2026";
    this.startPolling();
    this.renderChat();
  }

  private renderEmptyState(): void {
    const empty = this.chatEl.createDiv({ cls: "och-empty-state" });
    empty.createDiv({ cls: "och-empty-title", text: "Start a conversation" });
    empty.createDiv({ cls: "och-empty-hint", text: "Ask about your notes, or paste an image" });
  }

  private renderUserMessage(parent: HTMLElement, msg: ParsedMessage): void {
    const row = parent.createDiv({ cls: "och-user-msg" });

    const bubble = row.createDiv({ cls: "och-user-bubble" });
    this.renderUserTextWithPills(bubble, msg.content);

    // Meta row below bubble: timestamp + copy (appears on hover)
    const actions = row.createDiv({ cls: "och-user-msg-actions" });
    // Timestamp
    const time = new Date(msg.timestamp);
    const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    actions.createSpan({ cls: "och-user-msg-time", text: timeStr });
    // Copy button
    const copyBtn = actions.createEl("button", {
      cls: "och-msg-action-btn",
      attr: { "aria-label": "Copy" },
    });
    setIcon(copyBtn, "copy");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(msg.content);
      copyBtn.empty();
      setIcon(copyBtn, "check");
      setTimeout(() => { copyBtn.empty(); setIcon(copyBtn, "copy"); }, 1500);
    });
  }

  /** Render user text, highlighting @file and @agent references as inline pills */
  private renderUserTextWithPills(container: HTMLElement, text: string): void {
    // Match @something patterns
    const regex = /@([\w.\/\-]+)/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      // Text before match
      if (match.index > lastIdx) {
        container.appendText(text.slice(lastIdx, match.index));
      }
      // Determine pill type (simple heuristic: if contains / or ., it's a file)
      const ref = match[1];
      const isFile = ref.includes("/") || ref.includes(".");
      const pill = container.createSpan({
        cls: `och-inline-pill ${isFile ? "och-inline-pill--file" : "och-inline-pill--agent"}`,
        text: `@${ref}`,
      });
      lastIdx = match.index + match[0].length;
    }
    // Remaining text
    if (lastIdx < text.length) {
      container.appendText(text.slice(lastIdx));
    }
  }

  private renderAssistantMessage(parent: HTMLElement, msg: ParsedMessage, isLast: boolean): void {
    const el = parent.createDiv({ cls: "och-assistant-msg" });

    // Tool calls (grouped by category) — before content
    if (msg.toolParts.length > 0) {
      this.renderToolGroups(el, msg.toolParts);
    }

    // Reasoning (collapsible)
    if (msg.reasoning) {
      this.renderReasoning(el, msg.reasoning);
    }

    // Content
    if (!msg.content && isLast && this.waiting) {
      // Thinking shimmer
      const thinkEl = el.createDiv({ cls: "och-thinking" });
      thinkEl.createSpan({ text: "Thinking\u2026" });
    } else if (msg.content) {
      const contentEl = el.createDiv({ cls: "och-assistant-content" });
      MarkdownRenderer.render(this.app, msg.content, contentEl, "", this.plugin);
    }

    // Metadata + actions
    if (msg.content) {
      const meta = el.createDiv({ cls: "och-msg-meta" });
      const metaItems: string[] = [];

      // Agent
      if (msg.agent) metaItems.push(msg.agent);

      // Model (prefer message-level, fallback to server config)
      const modelName = msg.model
        || (this.plugin as unknown as Record<string, unknown>)._serverModel as string | null;
      if (modelName) {
        const shortModel = modelName.split("/").pop()?.split("@")[0] || modelName;
        metaItems.push(shortModel);
      }

      // Duration
      if (msg.durationSec && msg.durationSec > 0) {
        if (msg.durationSec >= 60) {
          const m = Math.floor(msg.durationSec / 60);
          const s = msg.durationSec % 60;
          metaItems.push(`${m}m ${s}s`);
        } else {
          metaItems.push(`${msg.durationSec}s`);
        }
      } else {
        metaItems.push(this.relativeTime(msg.timestamp));
      }

      // Token count
      if (msg.tokens?.output) {
        metaItems.push(`${msg.tokens.output} tokens`);
      }

      // Cost
      if (msg.cost && msg.cost > 0) {
        metaItems.push(`$${msg.cost.toFixed(4)}`);
      }

      // Render meta items with separators
      metaItems.forEach((item, i) => {
        if (i > 0) meta.createSpan({ cls: "och-msg-meta-sep", text: "\u00B7" });
        meta.createSpan({ text: item });
      });

      // Actions
      const actions = meta.createDiv({ cls: "och-msg-actions" });
      const copyBtn = actions.createEl("button", {
        cls: "och-msg-action-btn",
        attr: { "aria-label": "Copy" },
      });
      setIcon(copyBtn, "copy");
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(msg.content);
        copyBtn.empty();
        setIcon(copyBtn, "check");
        setTimeout(() => { copyBtn.empty(); setIcon(copyBtn, "copy"); }, 1500);
      });
    }
  }

  /** Render reasoning/thinking content as a collapsible section */
  private renderReasoning(parent: HTMLElement, reasoning: string): void {
    const container = parent.createDiv({ cls: "och-reasoning" });

    const header = container.createEl("button", { cls: "och-reasoning-header" });
    const label = header.createSpan({ cls: "och-reasoning-label", text: "Reasoning" });

    // Extract first heading or first line as summary
    const headingMatch = reasoning.match(/^#+\s+(.+)$/m);
    const summary = headingMatch?.[1] || reasoning.split("\n")[0]?.slice(0, 80) || "...";
    header.createSpan({ cls: "och-reasoning-summary", text: summary });

    const chevron = header.createSpan({ cls: "och-tool-group-chevron" });
    setIcon(chevron, "chevron-right");

    const details = container.createDiv({ cls: "och-reasoning-content" });
    details.style.display = "none";

    // Render markdown content
    MarkdownRenderer.render(this.app, reasoning, details, "", this.plugin);

    let expanded = false;
    header.addEventListener("click", () => {
      expanded = !expanded;
      details.style.display = expanded ? "block" : "none";
      chevron.empty();
      setIcon(chevron, expanded ? "chevron-down" : "chevron-right");
    });
  }

  // ── Tool calls — grouped ──────────────────────────────────

  /** Group tools by category and render */
  private renderToolGroups(parent: HTMLElement, tools: ToolPart[]): void {
    // Separate question tools — they render as inline cards, not grouped entries
    const questionTools: ToolPart[] = [];
    const regularTools: ToolPart[] = [];
    for (const t of tools) {
      if (t.type.toLowerCase() === "question") {
        questionTools.push(t);
      } else {
        regularTools.push(t);
      }
    }

    // Group: context (read, glob, grep, list, search) vs others
    const contextTypes = new Set(["read", "glob", "grep", "list", "search", "folder-search"]);
    const contextTools: ToolPart[] = [];
    const otherTools: ToolPart[] = [];

    for (const t of regularTools) {
      const lower = t.type.toLowerCase();
      const isContext = [...contextTypes].some((ct) => lower.includes(ct));
      if (isContext) {
        contextTools.push(t);
      } else {
        otherTools.push(t);
      }
    }

    // Render context tools as a collapsed group
    if (contextTools.length > 0) {
      const ctxSummary = contextTools.length === 1
        ? this.getToolShortDetail(contextTools[0])
        : `${contextTools.length} operations`;
      const ctxLabel = contextTools.length === 1
        ? `${this.getToolDisplayName(contextTools[0].type)}`
        : "Gathering context";
      this.renderToolGroup(parent, "search", ctxLabel, ctxSummary, contextTools);
    }

    // Group remaining tools by type
    const groups = new Map<string, ToolPart[]>();
    for (const t of otherTools) {
      const key = this.toolCategory(t.type);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    for (const [category, items] of groups) {
      const icon = this.getToolIcon(items[0].type);
      let label: string;
      let summary = "";
      if (items.length === 1) {
        // For single tools, show display name + short detail in header
        const t = items[0];
        label = this.getToolDisplayName(t.type);
        summary = this.getToolShortDetail(t);
      } else {
        label = `${category} (${items.length})`;
      }
      this.renderToolGroup(parent, icon, label, summary, items);
    }

    // Render question tools as inline interactive cards
    for (const q of questionTools) {
      this.renderQuestionCard(parent, q);
    }
  }

  /** Render a question tool as an interactive card with clickable options */
  private renderQuestionCard(parent: HTMLElement, tool: ToolPart): void {
    const args = tool.args;
    if (!args || !Array.isArray(args.questions)) {
      // Fallback: render as normal tool entry
      this.renderToolGroup(parent, "message-circle", "question", "", [tool]);
      return;
    }

    for (const q of args.questions) {
      const card = parent.createDiv({ cls: "och-question-card" });

      // Question header
      if (q.header) {
        const headerEl = card.createDiv({ cls: "och-question-header" });
        headerEl.textContent = q.header;
      }

      // Question text
      const textEl = card.createDiv({ cls: "och-question-text" });
      textEl.textContent = q.question || "";

      // Options
      if (Array.isArray(q.options) && q.options.length > 0) {
        const optionsEl = card.createDiv({ cls: "och-question-options" });

        // Check if question was already answered (tool has result)
        const isAnswered = tool.status === "success";

        for (const opt of q.options) {
          const btn = optionsEl.createEl("button", { cls: "och-question-option" });
          btn.createSpan({ text: opt.label || "" });
          if (opt.description) {
            btn.createSpan({ cls: "och-question-option-desc", text: ` - ${opt.description}` });
          }

          if (isAnswered) {
            btn.disabled = true;
            btn.style.opacity = "0.6";
            btn.style.cursor = "default";
          } else {
            btn.addEventListener("click", () => {
              // Send the selected option label as the answer
              // Set the editor text and send
              this.editorEl.textContent = opt.label;
              this.handleSend();
              // Disable all options after selection
              optionsEl.querySelectorAll("button").forEach((b: HTMLButtonElement) => {
                b.disabled = true;
                b.style.opacity = "0.6";
                b.style.cursor = "default";
              });
              btn.style.opacity = "1";
              btn.style.background = "var(--interactive-accent)";
              btn.style.color = "var(--text-on-accent)";
            });
          }
        }

        // "Type your own answer" hint when question allows custom input
        if (!isAnswered) {
          const hint = card.createDiv({ attr: { style: "margin-top: 6px; font-size: 11px; color: var(--text-faint);" } });
          hint.textContent = "Or type your own answer in the input below";
        }
      }
    }
  }

  private renderToolGroup(parent: HTMLElement, icon: string, label: string, summary: string, tools: ToolPart[]): void {
    const group = parent.createDiv({ cls: "och-tool-group" });

    const header = group.createDiv({ cls: "och-tool-group-header" });
    const iconEl = header.createSpan({ cls: "och-tool-group-icon" });
    setIcon(iconEl, icon);
    header.createSpan({ text: label });
    if (summary) {
      header.createSpan({ text: ` ${summary}`, attr: { style: "color: var(--text-faint);" } });
    }
    const chevron = header.createSpan({ cls: "och-tool-group-chevron" });
    setIcon(chevron, "chevron-right");

    const details = group.createDiv({ cls: "och-tool-group-details" });

    for (const tool of tools) {
      const entry = details.createDiv({ cls: "och-tool-entry" });

      // TUI-style display name only, no icon
      const displayName = this.getToolDisplayName(tool.type);
      entry.createSpan({ cls: "och-tool-entry-name", text: displayName });

      // TUI-style detail (file path with params, pattern with match count, etc.)
      const shortDetail = this.getToolShortDetail(tool);
      if (shortDetail) {
        entry.createSpan({ cls: "och-tool-entry-detail", text: shortDetail });
      }

      if (tool.status && tool.status === "error") {
        entry.createSpan({ cls: "och-tool-entry-status och-tool-entry-status--error", text: "error" });
      }

      // Detail pane (toggle on click)
      if (tool.detail) {
        const detailPane = details.createDiv({ cls: "och-tool-detail-pane" });
        detailPane.textContent = tool.detail;
        entry.addEventListener("click", () => detailPane.classList.toggle("och-tool-detail-pane--open"));
      }
    }

    header.addEventListener("click", () => {
      const isOpen = details.classList.toggle("och-tool-group-details--open");
      chevron.classList.toggle("och-tool-group-chevron--open", isOpen);
    });
  }

  /**
   * Extract a TUI-style short detail from tool args.
   * Examples:
   *   Read: "/path/to/file.ts [offset=635, limit=25]"
   *   Grep: "formatMinimalContext" in src (3 matches)
   *   Glob: "**\/*.ts" in src
   *   Bash: "npm run build"
   */
  private getToolShortDetail(tool: ToolPart): string {
    if (!tool.detail) return "";
    try {
      const rawDetail = tool.detail;
      const inputPart = rawDetail.split("\n--- Output ---")[0].split("\n--- Result ---")[0];
      const parsed = JSON.parse(inputPart);
      if (typeof parsed !== "object" || parsed === null) return "";

      const lower = tool.type.toLowerCase();

      // --- Context tools: TUI-style detail ---

      if (lower === "read") {
        const path = parsed.filePath || parsed.path || "";
        const extras: string[] = [];
        if (parsed.offset != null) extras.push(`offset=${parsed.offset}`);
        if (parsed.limit != null) extras.push(`limit=${parsed.limit}`);
        return extras.length > 0 ? `${path} [${extras.join(", ")}]` : path;
      }

      if (lower === "grep") {
        const pattern = parsed.pattern || "";
        const path = parsed.path || "";
        // Try to extract match count from result
        const matchCount = this.extractMatchCount(rawDetail);
        const suffix = matchCount != null ? ` (${matchCount} matches)` : "";
        return path ? `"${pattern}" in ${this.shortenPath(path)}${suffix}` : `"${pattern}"${suffix}`;
      }

      if (lower === "glob") {
        const pattern = parsed.pattern || "";
        const path = parsed.path || "";
        const matchCount = this.extractMatchCount(rawDetail);
        const suffix = matchCount != null ? ` (${matchCount} files)` : "";
        return path ? `${pattern} in ${this.shortenPath(path)}${suffix}` : `${pattern}${suffix}`;
      }

      if (lower === "list") {
        return parsed.path || parsed.filePath || "";
      }

      // --- Non-context tools ---

      if (lower === "task") {
        const parts: string[] = [];
        if (parsed.subagent_type) parts.push(parsed.subagent_type);
        if (parsed.description) parts.push(parsed.description);
        return parts.join(" — ") || "";
      }
      if (lower === "skill") return parsed.name || "";
      if (lower === "webfetch") return parsed.url || "";
      if (lower === "websearch" || lower === "codesearch") return parsed.query || "";

      if (lower === "edit" || lower === "write") {
        return parsed.filePath || parsed.path || "";
      }

      if (lower === "bash") {
        const cmd = parsed.command || "";
        return cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd;
      }

      // Generic fallbacks
      if (parsed.filePath) return parsed.filePath;
      if (parsed.path) return parsed.path;
      if (parsed.pattern) return parsed.pattern;
      if (parsed.query) return parsed.query;
      if (parsed.command) {
        const cmd = parsed.command;
        return cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd;
      }
      if (parsed.url) return parsed.url;
      if (parsed.description) return parsed.description;
    } catch {
      const pathMatch = tool.detail.match(/(?:^|\s)([\w./\-]+\.\w{1,6})/);
      if (pathMatch) return pathMatch[1];
    }
    return "";
  }

  /** Extract match/file count from tool result text */
  private extractMatchCount(detail: string): number | null {
    // Look for "Found N matches" or similar in result section
    const resultSection = detail.split("--- Output ---")[1] || detail.split("--- Result ---")[1] || "";
    // Count lines that look like file paths or matches
    const matchLine = resultSection.match(/Found (\d+) match/i);
    if (matchLine) return parseInt(matchLine[1], 10);
    // For grep/glob: count non-empty result lines
    const lines = resultSection.trim().split("\n").filter((l) => l.trim());
    return lines.length > 0 ? lines.length : null;
  }

  /** Shorten a path for display: keep last 2 segments */
  private shortenPath(path: string): string {
    const parts = path.replace(/\/$/, "").split("/").filter(Boolean);
    if (parts.length <= 2) return path;
    return parts.slice(-2).join("/");
  }

  /** Human-readable tool name matching TUI style */
  private getToolDisplayName(type: string): string {
    const map: Record<string, string> = {
      read: "Read",
      grep: "Grep",
      glob: "Glob",
      list: "List",
      edit: "Edit",
      write: "Write",
      apply_patch: "Patch",
      bash: "Shell",
      task: "Agent",
      skill: "Skill",
      webfetch: "Fetch",
      websearch: "Search",
      codesearch: "Code Search",
      question: "Question",
    };
    return map[type.toLowerCase()] || type;
  }

  private toolCategory(type: string): string {
    const lower = type.toLowerCase();
    if (lower.includes("bash") || lower.includes("shell") || lower.includes("terminal")) return "Shell";
    if (lower.includes("edit") || lower.includes("write") || lower.includes("patch") || lower === "apply_patch") return "Edit";
    if (lower === "task") return "Agent";
    if (lower === "webfetch" || lower === "websearch" || lower === "codesearch") return "Web";
    if (lower === "skill") return "Skill";
    if (lower === "question") return "Question";
    return "Tool";
  }

  /** Map tool name to Obsidian icon — matching official OpenCode icons where possible */
  private getToolIcon(type: string): string {
    const lower = type.toLowerCase();
    // Context / read tools
    if (lower === "read") return "glasses";
    if (lower === "glob" || lower === "grep" || lower === "list" || lower === "folder-search") return "search";
    // File mutation
    if (lower === "edit" || lower === "write" || lower === "apply_patch") return "pencil";
    // Shell
    if (lower === "bash" || lower.includes("shell") || lower.includes("terminal")) return "terminal";
    // Web tools
    if (lower === "webfetch" || lower === "websearch") return "globe";
    if (lower === "codesearch") return "code";
    // Agent / task
    if (lower === "task") return "bot";
    // Skill
    if (lower === "skill") return "brain";
    // Question
    if (lower === "question") return "message-circle";
    // Fallback by category keyword
    if (lower.includes("search")) return "search";
    if (lower.includes("edit") || lower.includes("write")) return "pencil";
    if (lower.includes("web") || lower.includes("fetch")) return "globe";
    return "wrench";
  }

  private relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.chatEl.scrollTop = this.chatEl.scrollHeight;
    });
  }

  private showError(text: string): void {
    const el = this.chatEl.createDiv({ cls: "och-error-msg" });
    el.textContent = text;
    this.scrollToBottom();
  }

  // =========================================================================
  // 3. COMPOSER REGION
  // =========================================================================

  private contextStripEl!: HTMLElement;

  private buildComposer(root: HTMLElement): void {
    this.composerEl = root.createDiv({ cls: "och-composer" });

    // Context strip — active file + open tabs (above input)
    this.contextStripEl = this.composerEl.createDiv({ cls: "och-context-strip" });
    this.refreshContextStrip();

    // Attachments preview (hidden initially)
    this.attachmentsEl = this.composerEl.createDiv({ cls: "och-attachments" });
    this.attachmentsEl.style.display = "none";

    // Input row (+ popover)
    this.inputRowEl = this.composerEl.createDiv({ cls: "och-input-row" });

    // Popover (shared for slash and @ mention)
    this.popoverEl = this.inputRowEl.createDiv({ cls: "och-popover" });
    this.popoverEl.style.display = "none";

    // Contenteditable editor
    this.editorEl = this.inputRowEl.createEl("div", {
      cls: "och-editor",
      attr: {
        contenteditable: "true",
        role: "textbox",
        "aria-multiline": "true",
        "data-placeholder": "Ask about your notes\u2026",
      },
    });

    // Input event — triggers popover logic
    this.editorEl.addEventListener("input", () => this.onEditorInput());

    // Keydown — Enter, Escape, arrow keys, history
    this.editorEl.addEventListener("keydown", (e) => this.onEditorKeydown(e));

    // Paste — handle images
    this.editorEl.addEventListener("paste", (e) => this.onEditorPaste(e));

    // Dock tray (below input) — includes submit button
    this.buildDockTray();
  }

  // ── Editor event handlers ────────────────────────────────

  private onEditorInput(): void {
    const text = this.getEditorText().trim();

    // Slash trigger: entire text is /something (no spaces)
    const slashMatch = text.match(/^\/(\S*)$/);
    if (slashMatch) {
      this.openSlashPopover(slashMatch[1]);
      return;
    }

    // Close slash popover if text no longer matches
    if (this.activePopover === "slash" && !text.startsWith("/")) {
      this.closePopover();
    }

    // @ mention trigger
    const mentionQuery = this.getMentionQuery();
    if (mentionQuery !== null) {
      if (this.mentionSearchTimer) clearTimeout(this.mentionSearchTimer);
      this.mentionSearchTimer = setTimeout(() => this.openMentionPopover(mentionQuery), 120);
    } else if (this.activePopover === "mention") {
      this.closePopover();
    }
  }

  private onEditorKeydown(e: KeyboardEvent): void {
    // Popover keyboard navigation
    if (this.activePopover && this.popoverItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.popoverActiveIdx = (this.popoverActiveIdx + 1) % this.popoverItems.length;
        this.highlightPopoverItem();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this.popoverActiveIdx = (this.popoverActiveIdx - 1 + this.popoverItems.length) % this.popoverItems.length;
        this.highlightPopoverItem();
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const item = this.popoverItems[this.popoverActiveIdx];
        if (item) item.action();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.closePopover();
        return;
      }
    }

    // Enter to send (without shift)
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.handleSend();
      return;
    }

    // Escape — close popover or blur
    if (e.key === "Escape") {
      if (this.activePopover) {
        this.closePopover();
      }
      return;
    }

    // Arrow Up at start of empty editor — history
    if (e.key === "ArrowUp" && this.isEditorEmpty()) {
      e.preventDefault();
      this.navigateHistory(-1);
      return;
    }
    if (e.key === "ArrowDown" && this.isEditorEmpty()) {
      e.preventDefault();
      this.navigateHistory(1);
      return;
    }
  }

  private onEditorPaste(e: ClipboardEvent): void {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) this.handleImageUpload(blob);
        return;
      }
    }
    // For text paste, let the browser handle it but strip formatting
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") || "";
    document.execCommand("insertText", false, text);
  }

  // ── Editor helpers ─────────────────────────────────────────

  /** Get plain text from contenteditable, reading pills as @references */
  private getEditorText(): string {
    let text = "";
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || "";
      } else if (node instanceof HTMLElement) {
        if (node.classList.contains("och-pill")) {
          text += node.textContent || "";
        } else if (node.tagName === "BR") {
          text += "\n";
        } else {
          for (const child of Array.from(node.childNodes)) {
            walk(child);
          }
          // Add newline after block elements (div, p) unless last
          if ((node.tagName === "DIV" || node.tagName === "P") && node.nextSibling) {
            text += "\n";
          }
        }
      }
    };
    walk(this.editorEl);
    return text;
  }

  private isEditorEmpty(): boolean {
    return this.getEditorText().trim() === "";
  }

  private clearEditor(): void {
    this.editorEl.innerHTML = "";
  }

  private setEditorText(text: string): void {
    this.editorEl.textContent = text;
    // Move cursor to end
    const sel = window.getSelection();
    if (sel && this.editorEl.childNodes.length > 0) {
      const range = document.createRange();
      range.selectNodeContents(this.editorEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  /** Insert an inline pill into the editor at current cursor position */
  private insertPill(type: "file" | "agent", label: string): void {
    // First, remove the @query text before cursor
    this.removeMentionQueryFromEditor();

    const pill = document.createElement("span");
    pill.className = `och-pill och-pill--${type}`;
    pill.contentEditable = "false";
    pill.textContent = `@${label}`;
    pill.dataset.type = type;
    pill.dataset.ref = label;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(pill);
      // Insert a space after and move cursor there
      const space = document.createTextNode("\u00A0");
      pill.after(space);
      range.setStartAfter(space);
      range.setEndAfter(space);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      this.editorEl.appendChild(pill);
      this.editorEl.appendChild(document.createTextNode("\u00A0"));
    }
    this.closePopover();
  }

  /** Remove the @query portion from the editor before inserting a pill */
  private removeMentionQueryFromEditor(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return;

    const text = container.textContent || "";
    const cursorOffset = range.startOffset;

    // Search backwards for @
    let atIdx = -1;
    for (let i = cursorOffset - 1; i >= 0; i--) {
      if (text[i] === "@") {
        atIdx = i;
        break;
      }
    }
    if (atIdx >= 0) {
      // Delete from @ to cursor
      const newText = text.slice(0, atIdx) + text.slice(cursorOffset);
      container.textContent = newText;
      // Reposition cursor
      const newRange = document.createRange();
      newRange.setStart(container, atIdx);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }

  /** Get the @query at current cursor position (null if not in mention context) */
  private getMentionQuery(): string | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return null;

    const text = container.textContent || "";
    const cursorOffset = range.startOffset;

    for (let i = cursorOffset - 1; i >= 0; i--) {
      if (text[i] === "@") {
        if (i === 0 || text[i - 1] === " " || text[i - 1] === "\n" || text[i - 1] === "\u00A0") {
          return text.slice(i + 1, cursorOffset);
        }
        return null;
      }
      if (text[i] === " " || text[i] === "\n" || text[i] === "\u00A0") return null;
    }
    return null;
  }

  // ── History ────────────────────────────────────────────────

  private navigateHistory(direction: -1 | 1): void {
    if (this.promptHistory.length === 0) return;
    this.historyIdx = Math.max(0, Math.min(this.promptHistory.length - 1, this.historyIdx + direction));
    this.setEditorText(this.promptHistory[this.historyIdx]);
  }

  // ── Attachments ────────────────────────────────────────────

  private renderAttachmentPreview(): void {
    this.attachmentsEl.empty();
    if (this.pendingAttachments.length === 0) {
      this.attachmentsEl.style.display = "none";
      return;
    }
    this.attachmentsEl.style.display = "flex";
    for (let i = 0; i < this.pendingAttachments.length; i++) {
      const att = this.pendingAttachments[i];
      const thumb = this.attachmentsEl.createDiv({ cls: "och-attachment-thumb" });
      const img = thumb.createEl("img", {
        attr: { src: `data:${att.mimeType};base64,${att.data}`, alt: att.name },
      });
      img.draggable = false;
      const removeBtn = thumb.createEl("button", {
        cls: "och-attachment-remove",
        attr: { "aria-label": "Remove" },
      });
      removeBtn.textContent = "\u00D7";
      const idx = i;
      removeBtn.addEventListener("click", () => {
        this.pendingAttachments.splice(idx, 1);
        this.renderAttachmentPreview();
      });
    }
  }

  private async handleImageUpload(blob: Blob): Promise<void> {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      if (!base64) return;
      this.pendingAttachments.push({
        type: "image",
        data: base64,
        mimeType: blob.type,
        name: `image-${Date.now()}.${blob.type.split("/")[1] || "png"}`,
      });
      this.renderAttachmentPreview();
    };
    reader.readAsDataURL(blob);
  }

  // =========================================================================
  // 4. DOCK TRAY (below input)
  // =========================================================================

  private buildDockTray(): void {
    this.dockTrayEl = this.composerEl.createDiv({ cls: "och-dock-tray" });

    // Shared dropdown element (reused for agent select)
    this.dropdownEl = this.dockTrayEl.createDiv({ cls: "och-dropdown" });
    this.dropdownEl.style.display = "none";

    // Agent select (clickable, no chevron — shows checkmark in dropdown)
    this.agentSelectEl = this.dockTrayEl.createDiv({ cls: "och-tray-select" });
    this.updateAgentSelect();
    this.agentSelectEl.addEventListener("click", () => this.toggleTrayDropdown("agent"));

    // Separator
    this.dockTrayEl.createSpan({ cls: "och-tray-sep", text: "\u00B7" });

    // Model + thinking label (read-only, updated dynamically)
    this.modelLabelEl = this.dockTrayEl.createSpan({ cls: "och-tray-label" });
    this.updateModelLabel();

    // Submit button (dark circle, white arrow, right side)
    this.submitBtnEl = this.dockTrayEl.createEl("button", {
      cls: "och-submit-btn",
      attr: { "aria-label": "Send" },
    });
    setIcon(this.submitBtnEl, "arrow-up");
    this.submitBtnEl.addEventListener("click", () => this.handleSend());
  }

  private updateModelLabel(): void {
    if (!this.modelLabelEl) return;
    const serverModel = (this.plugin as unknown as Record<string, unknown>)._serverModel as string | null;
    if (serverModel) {
      const shortName = serverModel.split("/").pop()?.split("@")[0] || serverModel;
      this.modelLabelEl.textContent = shortName;
    } else {
      this.modelLabelEl.textContent = this.plugin.isConnected ? "auto" : "";
    }
  }

  private updateAgentSelect(): void {
    this.agentSelectEl.empty();
    const name = this.plugin.currentAgent || "build";
    this.agentSelectEl.createSpan({ text: name.charAt(0).toUpperCase() + name.slice(1) });
  }

  private refreshContextStrip(): void {
    if (!this.contextStripEl) return;
    this.contextStripEl.empty();

    if (!this.plugin.vaultContext) return;
    const ws = this.plugin.vaultContext.getWorkspaceState();

    // Active file chip (highlighted)
    if (ws.activeFile) {
      const chip = this.contextStripEl.createDiv({ cls: "och-context-chip och-context-chip--active" });
      const icon = chip.createSpan({ cls: "och-context-chip-icon" });
      setIcon(icon, "file-text");
      chip.createSpan({ cls: "och-context-chip-name", text: ws.activeFile.name });
    }

    // Other open tabs (not active)
    const otherTabs = ws.openTabs.filter((t) => t.filePath && t.fileName && !t.isActive);
    const maxVisible = 3;
    for (let i = 0; i < Math.min(otherTabs.length, maxVisible); i++) {
      const tab = otherTabs[i];
      const chip = this.contextStripEl.createDiv({ cls: "och-context-chip" });
      const icon = chip.createSpan({ cls: "och-context-chip-icon" });
      setIcon(icon, "file");
      chip.createSpan({ cls: "och-context-chip-name", text: tab.fileName! });
    }

    // "+N more" if there are additional tabs
    if (otherTabs.length > maxVisible) {
      this.contextStripEl.createSpan({
        cls: "och-context-more",
        text: `+${otherTabs.length - maxVisible} more`,
      });
    }
  }

  // ── Tray dropdowns ─────────────────────────────────────────

  private toggleTrayDropdown(type: "agent"): void {
    if (this.activeDropdown === type) {
      this.closeDropdown();
    } else {
      this.openTrayDropdown(type);
    }
  }

  private closeDropdown(): void {
    if (this.activeDropdown === "session") {
      this.sessionDropdownEl.style.display = "none";
    } else {
      this.dropdownEl.style.display = "none";
    }
    this.activeDropdown = null;
  }

  private async openTrayDropdown(type: "agent"): Promise<void> {
    this.closeDropdown();
    this.closePopover();

    // Position dropdown above the agent select
    const trayRect = this.dockTrayEl.getBoundingClientRect();
    const selectRect = this.agentSelectEl.getBoundingClientRect();
    this.dropdownEl.style.left = `${selectRect.left - trayRect.left}px`;

    await this.renderAgentDropdown();

    this.dropdownEl.style.display = "block";
    this.activeDropdown = type;
  }

  private async renderAgentDropdown(): Promise<void> {
    this.dropdownEl.empty();
    const agents = await this.plugin.listAgents();
    // Only show primary agents that are not hidden (filter out sub-agents like title, summary)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visible = agents.filter((a) => {
      const aa = a as any;
      if (aa.hidden) return false;
      // mode: "primary" | "subagent" | "all" — only show primary
      if (aa.mode && aa.mode === "subagent") return false;
      return true;
    });

    const currentAgent = this.plugin.currentAgent || "build";
    for (const agent of visible) {
      const isCurrent = agent.name === currentAgent;
      const item = this.dropdownEl.createDiv({ cls: "och-dropdown-item" });
      if (isCurrent) item.addClass("och-dropdown-item--selected");
      item.createSpan({ cls: "och-dropdown-item-label", text: agent.name });
      if (isCurrent) {
        const checkEl = item.createSpan({ attr: { style: "margin-left: auto; width: 12px; height: 12px; flex-shrink: 0; color: var(--text-accent);" } });
        setIcon(checkEl, "check");
      }
      item.addEventListener("click", () => {
        this.plugin.setAgent(agent.name === "build" ? "" : agent.name);
        this.updateAgentSelect();
        this.closeDropdown();
      });
    }
  }

  // Model/variant selection removed — using server defaults.
  // The server's configured model and thinking level are used automatically.

  // =========================================================================
  // 5. SLASH POPOVER
  // =========================================================================

  private async openSlashPopover(query: string): Promise<void> {
    // Set active immediately so concurrent input events don't close us
    this.activePopover = "slash";
    const commands = await this.plugin.listCommands();

    // Build items from commands
    const allItems: PopoverItem[] = commands.map((cmd) => {
      const source = (cmd as unknown as Record<string, unknown>).source;
      const tag = typeof source === "string" && source ? source : undefined;
      return {
        id: cmd.id || cmd.name,
        label: `/${cmd.name}`,
        icon: this.getSkillIcon(cmd.name),
        tag,
        action: () => {
          // Replace editor text with the command
          this.setEditorText(`/${cmd.name} `);
          this.closePopover();
          this.editorEl.focus();
        },
      };
    });

    // Fuzzy filter
    let filtered: PopoverItem[];
    if (query) {
      const results = fuzzysort.go(query, allItems, {
        keys: ["label", "description"],
        limit: 20,
        threshold: -5000,
      });
      filtered = results.map((r) => r.obj);
    } else {
      filtered = allItems.slice(0, 20);
    }

    this.popoverItems = filtered;
    this.popoverActiveIdx = 0;
    this.renderPopover("Commands", filtered);
    this.popoverEl.style.display = "block";
    this.activePopover = "slash";
  }

  private getSkillIcon(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes("read") || lower.includes("book")) return "book";
    if (lower.includes("find") || lower.includes("search") || lower.includes("discover")) return "search";
    if (lower.includes("write") || lower.includes("create")) return "pencil";
    if (lower.includes("obsidian")) return "file-text";
    if (lower.includes("track")) return "list-checks";
    if (lower.includes("remotion") || lower.includes("video")) return "video";
    return "terminal";
  }

  // =========================================================================
  // 6. @ MENTION POPOVER
  // =========================================================================

  private async openMentionPopover(query: string): Promise<void> {
    this.activePopover = "mention";
    const items: PopoverItem[] = [];
    const lowerQuery = query.toLowerCase();

    // Agents
    try {
      const agents = await this.plugin.listAgents();
      const visible = agents.filter((a) => !(a as unknown as Record<string, boolean>).hidden);
      for (const agent of visible) {
        items.push({
          id: `agent:${agent.name}`,
          label: `@${agent.name}`,
          description: agent.description || "",
          icon: "bot",
          tag: "Agent",
          action: () => this.insertPill("agent", agent.name),
        });
      }
    } catch { /* ignore */ }

    // Open notes
    if (this.plugin.vaultContext) {
      const ws = this.plugin.vaultContext.getWorkspaceState();
      for (const tab of ws.openTabs) {
        if (!tab.filePath || !tab.fileName) continue;
        items.push({
          id: `file:${tab.filePath}`,
          label: `@${tab.fileName}`,
          description: tab.filePath,
          icon: "file-text",
          tag: tab.isActive ? "Active" : "Open",
          action: () => this.insertPill("file", tab.fileName!),
        });
      }
    }

    // Vault file search (only if query is non-empty)
    if (query.length > 0) {
      try {
        const files = await this.plugin.searchFiles(query, 15);
        for (const filePath of files) {
          // Skip duplicates from open tabs
          if (items.some((it) => it.id === `file:${filePath}`)) continue;
          // Filter out node_modules, .opencode, .git, .obsidian
          if (/\/(node_modules|\.opencode|\.git|\.obsidian)\//.test(filePath)) continue;
          const fileName = filePath.split("/").pop() || filePath;
          items.push({
            id: `file:${filePath}`,
            label: `@${fileName}`,
            description: filePath,
            icon: "file",
            action: () => this.insertPill("file", filePath),
          });
        }
      } catch { /* ignore */ }
    }

    // Fuzzy filter
    let filtered: PopoverItem[];
    if (lowerQuery) {
      const results = fuzzysort.go(lowerQuery, items, {
        keys: ["label", "description"],
        limit: 12,
        threshold: -5000,
      });
      filtered = results.map((r) => r.obj);
    } else {
      filtered = items.slice(0, 12);
    }

    this.popoverItems = filtered;
    this.popoverActiveIdx = 0;
    this.renderPopover("Mentions", filtered);
    this.popoverEl.style.display = "block";
    this.activePopover = "mention";
  }

  // =========================================================================
  // SHARED POPOVER RENDERING
  // =========================================================================

  private renderPopover(sectionLabel: string, items: PopoverItem[]): void {
    this.popoverEl.empty();

    if (items.length === 0) {
      this.popoverEl.createDiv({ cls: "och-popover-empty", text: "No results" });
      return;
    }

    // Group items by tag for display
    const grouped = new Map<string, PopoverItem[]>();
    for (const item of items) {
      const group = item.tag || sectionLabel;
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group)!.push(item);
    }

    let globalIdx = 0;
    for (const [group, groupItems] of grouped) {
      this.popoverEl.createDiv({ cls: "och-popover-section", text: group });
      for (const item of groupItems) {
        const el = this.popoverEl.createDiv({
          cls: "och-popover-item",
          attr: { "data-idx": String(globalIdx) },
        });
        if (globalIdx === this.popoverActiveIdx) el.addClass("och-popover-item--active");

        const iconEl = el.createDiv({ cls: "och-popover-item-icon" });
        setIcon(iconEl, item.icon);
        el.createSpan({ cls: "och-popover-item-label", text: item.label });
        if (item.description) {
          el.createSpan({ cls: "och-popover-item-desc", text: item.description });
        }

        el.addEventListener("click", () => item.action());
        el.addEventListener("mouseenter", () => {
          this.popoverActiveIdx = parseInt(el.dataset.idx || "0");
          this.highlightPopoverItem();
        });

        globalIdx++;
      }
    }
  }

  private highlightPopoverItem(): void {
    const items = this.popoverEl.querySelectorAll(".och-popover-item");
    items.forEach((el, idx) => {
      el.classList.toggle("och-popover-item--active", idx === this.popoverActiveIdx);
    });
    // Scroll active item into view
    const active = items[this.popoverActiveIdx] as HTMLElement | undefined;
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  private closePopover(): void {
    this.popoverEl.style.display = "none";
    this.activePopover = null;
    this.popoverItems = [];
    this.popoverActiveIdx = 0;
  }

  // =========================================================================
  // MESSAGE FLOW
  // =========================================================================

  private async handleSend(): Promise<void> {
    if (this.waiting) return;
    const text = this.getEditorText().trim();
    if (!text && this.pendingAttachments.length === 0) return;

    // Save to history
    if (text) {
      this.promptHistory.push(text);
      this.historyIdx = this.promptHistory.length;
    }

    this.clearEditor();
    this.setWaiting(true);

    // Optimistic user message
    const localMsg: ParsedMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      toolParts: [],
      timestamp: Date.now(),
    };
    this.messages.push(localMsg);
    this.renderChat();

    try {
      // Build parts
      const parts: Array<Record<string, unknown>> = [];
      if (text) parts.push({ type: "text", text });
      for (const att of this.pendingAttachments) {
        parts.push({ type: "image", image: att.data, mimeType: att.mimeType });
      }
      this.pendingAttachments = [];
      this.renderAttachmentPreview();

      if (this.plugin.client && this.plugin.currentSessionId) {
        // Only inject vault context if the session already has messages.
        // Skip on the first message to avoid polluting title generation.
        const isFirstMessage = this.messages.length <= 1; // only the local optimistic msg
        if (!isFirstMessage) {
          await this.plugin.injectVaultContext();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = { parts };
        if (this.plugin.currentAgent) body.agent = this.plugin.currentAgent;
        await this.plugin.client.sendMessageAsync(this.plugin.currentSessionId, body);
      }

      this.startPolling();
    } catch (err) {
      this.setWaiting(false);
      this.showError(err instanceof Error ? err.message : "Failed to send message.");
    }
  }

  private setWaiting(waiting: boolean): void {
    this.waiting = waiting;
    this.editorEl.dataset.disabled = waiting ? "true" : "false";
    if (waiting) {
      this.editorEl.setAttribute("contenteditable", "false");
      this.editorEl.dataset.placeholder = "Thinking\u2026";
    } else {
      this.editorEl.setAttribute("contenteditable", "true");
      this.editorEl.dataset.placeholder = "Ask about your notes\u2026";
    }
    this.submitBtnEl.disabled = waiting;
    this.submitBtnEl.empty();
    if (waiting) {
      this.submitBtnEl.createSpan({ cls: "och-spinner" });
    } else {
      setIcon(this.submitBtnEl, "arrow-up");
    }
  }

  // =========================================================================
  // SSE-DRIVEN POLLING
  // =========================================================================

  /**
   * Throttled poll — rate-limits rapid SSE events while ensuring timely updates.
   * Unlike debounce (which delays until events stop), throttle fires the first
   * event promptly then ignores subsequent events within the cooldown window.
   * This ensures the UI updates during active streaming, not just after it ends.
   */
  private throttledPoll(intervalMs = 200): void {
    // If a poll is already scheduled or in flight, skip (throttle)
    if (this._pollThrottleTimer || this._pollInFlight) return;
    this._pollThrottleTimer = setTimeout(() => {
      this._pollThrottleTimer = null;
      this.poll();
    }, intervalMs);
  }

  // =========================================================================
  // POLLING
  // =========================================================================

  private startPolling(): void {
    this.stopPolling();
    setTimeout(() => this.poll(), 500);
    this.pollTimer = setInterval(() => this.poll(), 1500);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this._pollThrottleTimer) {
      clearTimeout(this._pollThrottleTimer);
      this._pollThrottleTimer = null;
    }
  }

  private async poll(): Promise<void> {
    if (!this.plugin.client || !this.plugin.currentSessionId) return;
    if (this._pollInFlight) return; // Prevent concurrent polls
    this._pollInFlight = true;
    try {
      const raw = await this.plugin.client.listMessages(this.plugin.currentSessionId);
      const parsed = this.parseMessages(raw);
      this.messages = parsed;
      this.renderChat();

      // Check completion: use SSE-driven status if available, otherwise check message state
      let isDone = false;

      // Method 1: Check SSE-driven session status (set by handleSSEEvent)
      if (this._sessionStatus) {
        isDone = this._sessionStatus === "idle";
      } else {
        // Method 2: Fallback — check via REST API
        try {
          const statuses = await this.plugin.client.sessionStatuses();
          const status = statuses[this.plugin.currentSessionId];
          if (status) {
            // Server knows about this session: busy/retry = running, idle = done
            isDone = status.type === "idle";
          } else {
            // Session not in statuses map = idle (server removes idle sessions from map)
            // But if we just sent and there's no assistant reply yet, keep polling
            const lastMsg = parsed[parsed.length - 1];
            const hasAssistantReply = lastMsg && lastMsg.role === "assistant";
            isDone = hasAssistantReply || !this.waiting;
          }
        } catch {
          // API failed — check message-level completion (TUI fallback method)
          const lastMsg = parsed[parsed.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const timeCompleted = (lastMsg as any).timeCompleted;
            isDone = !!timeCompleted;
          }
        }
      }

      // Check if agent is waiting for user input (question tool)
      if (!isDone) {
        const lastAssistant = [...parsed].reverse().find((m) => m.role === "assistant");
        if (lastAssistant) {
          const hasQuestionTool = lastAssistant.toolParts.some(
            (t) => t.type.toLowerCase() === "question" && t.status !== "success"
          );
          if (hasQuestionTool) {
            this.setWaiting(false);
            this.editorEl.dataset.placeholder = "Type your answer\u2026";
            // Keep polling — user will answer
            return;
          }
        }
      }

      if (isDone) {
        this.stopPolling();
        this.setWaiting(false);
        this._sessionStatus = undefined; // Reset for next interaction

        // Refresh session title (title agent runs async after response)
        // SSE session.updated should handle this, but poll as fallback
        this.refreshSessions();
        setTimeout(() => this.refreshSessions(), 3000);
        setTimeout(() => this.refreshSessions(), 8000);
        setTimeout(() => this.refreshSessions(), 15000);

        // Update model label from the last assistant message's actual model
        const last = parsed[parsed.length - 1];
        if (last?.model) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const resolved = (this.plugin as any).resolveModelName
            ? (this.plugin as any).resolveModelName(last.model)
            : last.model;
          (this.plugin as unknown as Record<string, unknown>)._serverModel = resolved;
        }
        this.updateModelLabel();
      }
    } catch { /* non-fatal */ } finally {
      this._pollInFlight = false;
    }
  }

  // =========================================================================
  // DATA PARSING
  // =========================================================================

  /** Detect vault context injection messages (sent by injectVaultContext, should be hidden) */
  private isVaultContextMessage(msg: MessageResponse): boolean {
    if (msg.info?.role !== "user") return false;
    const parts = msg.parts ?? [];
    const text = parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n");
    // Vault context messages start with our context header or legacy prefixes
    return /^(\[Obsidian Workspace Context|Active Note:|Open Notes:|Outgoing Links:|Backlinks:)/.test(text.trim());
  }

  private parseMessages(raw: MessageResponse[]): ParsedMessage[] {
    return raw
      .filter((msg) => {
        const role = msg.info?.role;
        if (role !== "user" && role !== "assistant") return false;
        // Hide vault context injection messages from display
        if (this.isVaultContextMessage(msg)) return false;
        return true;
      })
      .map((msg) => {
        const role = msg.info.role as "user" | "assistant";
        const parts: MessagePartResponse[] = msg.parts ?? [];

        // Text content
        const textParts = parts
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text as string);

        // Reasoning content
        const reasoningParts = parts
          .filter((p) => p.type === "reasoning" && typeof p.text === "string" && p.text)
          .map((p) => p.text as string);
        const reasoning = reasoningParts.length > 0 ? reasoningParts.join("\n") : undefined;

        // Tool parts — only "tool" type parts, skip everything else
        // Server part types: text, reasoning, tool, step-start, step-finish,
        // file, agent, snapshot, patch, compaction, subtask, retry
        // Hide: todowrite (internal), question (rendered via SSE as card)
        // Also log any tools that slip through for debugging
        const HIDDEN_TOOLS = new Set(["todowrite", "question"]);
        // Temporarily log tool names to debug "invalid" display
        const allToolNames = parts.filter((p) => p.type === "tool").map((p) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = p as any;
          return r.tool || "unknown";
        });
        if (allToolNames.length > 0) console.log("[OCH-TOOL-NAMES]", allToolNames);

        const toolParts: ToolPart[] = parts
          .filter((p) => p.type === "tool")
          .map((p) => this.parseToolPart(p))
          .filter((t) => !HIDDEN_TOOLS.has(t.type.toLowerCase()));

        // Timestamp
        let timestamp = Date.now();
        const infoAny = msg.info as unknown as Record<string, unknown>;
        if (typeof infoAny.createdAt === "string") {
          const ms = new Date(infoAny.createdAt as string).getTime();
          if (!isNaN(ms)) timestamp = ms;
        }
        const timeObj = infoAny.time as Record<string, unknown> | undefined;
        if (timeObj && typeof timeObj === "object") {
          if (typeof timeObj.created === "number" && (timeObj.created as number) > 0) {
            timestamp = timeObj.created as number;
          }
        }

        // Duration: from message info.time (created → completed)
        // Server schema: info.time = { created: number, completed?: number }
        let durationSec: number | undefined;
        if (timeObj) {
          const created = typeof timeObj.created === "number" ? timeObj.created as number : 0;
          const completed = typeof timeObj.completed === "number" ? timeObj.completed as number : 0;
          if (created > 0 && completed > 0) {
            durationSec = Math.round((completed - created) / 1000);
          }
        }
        // Fallback: extract cost/tokens from step-finish part
        const stepFinish = parts.find((p) => p.type === "step-finish");

        // Agent name: info.agent (string)
        const agent = typeof infoAny.agent === "string" ? infoAny.agent as string : undefined;

        // Model name: assistant messages have info.providerID + info.modelID
        let model: string | undefined;
        if (typeof infoAny.modelID === "string") {
          const providerID = typeof infoAny.providerID === "string" ? infoAny.providerID as string : "";
          model = providerID ? `${providerID}/${infoAny.modelID}` : infoAny.modelID as string;
        }

        // Token counts and cost (assistant messages)
        // Primary: from info.tokens + info.cost
        // Fallback: from step-finish part
        let tokens: ParsedMessage["tokens"];
        let cost: number | undefined;
        if (role === "assistant") {
          // Try message-level info first
          const t = infoAny.tokens as Record<string, unknown> | undefined;
          if (t && typeof t === "object") {
            tokens = {
              input: typeof t.input === "number" ? t.input as number : undefined,
              output: typeof t.output === "number" ? t.output as number : undefined,
              reasoning: typeof t.reasoning === "number" ? t.reasoning as number : undefined,
            };
          }
          if (typeof infoAny.cost === "number") cost = infoAny.cost as number;

          // Fallback: step-finish part has tokens and cost
          if (!tokens && stepFinish) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sf = stepFinish as any;
            if (sf.tokens && typeof sf.tokens === "object") {
              tokens = {
                input: typeof sf.tokens.input === "number" ? sf.tokens.input : undefined,
                output: typeof sf.tokens.output === "number" ? sf.tokens.output : undefined,
                reasoning: typeof sf.tokens.reasoning === "number" ? sf.tokens.reasoning : undefined,
              };
            }
            if (cost == null && typeof sf.cost === "number") cost = sf.cost;
          }
        }

        return {
          id: msg.info.id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role,
          content: textParts.join("\n"),
          toolParts,
          reasoning,
          timestamp,
          durationSec,
          agent,
          model,
          tokens,
          cost,
        };
      });
  }

  /**
   * Parse a tool part from the server.
   *
   * OpenCode server format (from message-v2.ts):
   * {
   *   type: "tool",
   *   tool: "read" | "bash" | "question" | ...,   // actual tool name
   *   callID: string,
   *   state: {                                      // ToolState discriminated union
   *     status: "pending" | "running" | "completed" | "error",
   *     input: { filePath, command, ... },           // tool args
   *     output?: string,                             // result (completed only)
   *     title?: string,                              // display title
   *     error?: string,                              // error message (error only)
   *     time?: { start, end? },
   *   }
   * }
   */
  private parseToolPart(p: MessagePartResponse): ToolPart {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = p as any;
    const toolName = typeof raw.tool === "string" ? raw.tool : String(raw.type ?? "tool");

    // Parse state — may be object or JSON string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stateObj: any = null;
    if (raw.state && typeof raw.state === "object") {
      stateObj = raw.state;
    } else if (typeof raw.state === "string") {
      try { stateObj = JSON.parse(raw.state); } catch { /* ignore */ }
    }

    const status = stateObj?.status as string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args: any = stateObj?.input || undefined;

    // Build detail string: input JSON + output/error
    let detail = "";
    if (args && typeof args === "object") {
      try { detail = JSON.stringify(args, null, 2); } catch { /* ignore */ }
    }
    if (typeof stateObj?.output === "string" && stateObj.output) {
      const out = stateObj.output.length > 2000
        ? stateObj.output.slice(0, 2000) + "\n... (truncated)"
        : stateObj.output;
      detail += detail ? `\n\n--- Output ---\n${out}` : out;
    }
    if (typeof stateObj?.error === "string" && stateObj.error) {
      detail += detail ? `\n\n--- Error ---\n${stateObj.error}` : stateObj.error;
    }

    // Use server-provided title if available (e.g., "Read /path/to/file")
    const title = typeof stateObj?.title === "string" && stateObj.title
      ? stateObj.title
      : toolName;

    return { type: toolName, title, detail, status, args };
  }

  // =========================================================================
  // DATA LOADING
  // =========================================================================

  private async loadMessages(): Promise<void> {
    if (!this.plugin.client || !this.plugin.currentSessionId) {
      this.messages = [];
      this.renderChat();
      return;
    }
    try {
      const raw = await this.plugin.client.listMessages(this.plugin.currentSessionId);
      this.messages = this.parseMessages(raw);
    } catch { this.messages = []; }
    this.renderChat();
  }

  // =========================================================================
  // PUBLIC API — called by the plugin
  // =========================================================================

  handleSSEEvent(event: unknown): void {
    const e = event as { type?: string; properties?: Record<string, unknown> } | undefined;
    if (!e?.type) { this.poll(); return; }

    switch (e.type) {
      case "session.status": {
        // Server format: { sessionID: string, status: { type: "idle" | "busy" | "retry", ... } }
        const sessionID = e.properties?.sessionID as string | undefined;
        if (sessionID && sessionID !== this.plugin.currentSessionId) break;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statusObj = e.properties?.status as any;
        const statusType = statusObj?.type as string | undefined;
        this._sessionStatus = statusType;

        if (statusType === "idle") {
          // Final poll to get complete data, then stop
          this.poll();
        } else if (statusType === "busy") {
          this.setWaiting(true);
          this.startPolling();
        } else if (statusType === "retry") {
          // Keep polling, show retry info if needed
          this.setWaiting(true);
        }
        break;
      }

      case "session.updated": {
        // Session title or other metadata changed — refresh session list & header
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info = (e.properties as any)?.info;
        if (info && info.id === this.plugin.currentSessionId && info.title) {
          // Fast path: update title directly from SSE event without re-fetching
          const session = this.sessions.find((s) => s.id === info.id);
          if (session) {
            session.title = info.title;
          }
          this.updateHeaderTitle();
        } else {
          // Refresh full session list
          this.refreshSessions();
        }
        break;
      }

      case "message.part.delta":
        // Content is streaming — throttle polls for near-real-time updates
        this.throttledPoll(200);
        break;

      case "message.part.updated":
      case "message.updated":
      case "message.created":
        // Structure changed (tool result, new message, etc.) — poll quickly
        this.throttledPoll(50);
        break;

      case "question.asked": {
        // Agent is asking user a question — render it and unlock input
        const qSessionID = e.properties?.sessionID as string | undefined;
        if (qSessionID === this.plugin.currentSessionId) {
          this.handleQuestionAsked(e.properties as Record<string, unknown>);
        }
        break;
      }

      default:
        // Ignore unknown events — don't poll on every event
        break;
    }
  }

  /** Handle a question.asked SSE event — store in state and re-render */
  private handleQuestionAsked(props: Record<string, unknown>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const request = props as any;
    if (!request.id || !Array.isArray(request.questions)) return;

    // Store pending question in state (survives re-renders)
    this._pendingQuestion = {
      id: request.id,
      questions: request.questions,
      tab: 0,
      answers: request.questions.map(() => [] as string[]),
    };

    // Unlock input for custom answers
    this.setWaiting(false);
    this.editorEl.dataset.placeholder = "Type your answer\u2026";

    // Re-render to show the question card
    this.renderChat();
  }

  onActiveFileChanged(): void { this.refreshContextStrip(); }

  onConnectionChanged(_connected: boolean): void {
    this.updateModelLabel();
    this.updateAgentSelect();
  }

  async onSessionChanged(): Promise<void> {
    this.stopPolling();
    this.setWaiting(false);
    await this.refreshSessions();
    await this.loadMessages();
    this.refreshContextStrip();
  }
}
