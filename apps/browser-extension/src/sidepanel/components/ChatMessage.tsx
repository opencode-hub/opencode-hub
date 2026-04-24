import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ChatMessage as ChatMessageType,
  ToolPart,
  ReasoningPart,
} from "../store/chat";
import {
  getMessageText,
  getMessageReasoning,
  getMessageTools,
  isContextTool,
  getToolCategory,
} from "../store/chat";

// ─── Icons (inline SVGs to avoid dependencies) ──────────────

function ToolIcon({ name }: { name: string }) {
  const lower = name.toLowerCase();
  let path: string;
  if (lower.includes("bash") || lower.includes("shell")) {
    path = "M4 17l6-6-6-6M12 19h8"; // terminal
  } else if (lower.includes("edit") || lower.includes("write") || lower.includes("apply_patch")) {
    path = "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"; // edit
  } else if (lower.includes("read") || lower.includes("glob") || lower.includes("grep") || lower.includes("search")) {
    path = "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"; // search
  } else if (lower.includes("task")) {
    path = "M12 2a4 4 0 014 4v1h2a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4zM9 14l2 2 4-4"; // bot/task
  } else if (lower.includes("webfetch") || lower.includes("websearch") || lower.includes("codesearch")) {
    path = "M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2"; // globe
  } else {
    path = "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"; // wrench
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--hub-text-tertiary)", flexShrink: 0 }}>
      <path d={path} />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--hub-status-success)" }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" className="hub-spinner"
      style={{ color: "var(--hub-accent)" }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--hub-status-error)" }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{
        color: "var(--hub-text-tertiary)",
        transition: "transform 150ms ease",
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
      }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

// ─── Tool display components ─────────────────────────────────

function ToolStatusIcon({ state }: { state: ToolPart["state"] }) {
  switch (state) {
    case "pending":
    case "running":
      return <SpinnerIcon />;
    case "completed":
      return <CheckIcon />;
    case "error":
      return <ErrorIcon />;
  }
}

function ToolEntry({ tool }: { tool: ToolPart }) {
  const [expanded, setExpanded] = useState(false);

  // Format tool description
  const desc = formatToolDescription(tool);

  return (
    <div className="hub-tool-entry">
      <button
        className="hub-tool-entry-header"
        onClick={() => setExpanded(!expanded)}
      >
        <ToolStatusIcon state={tool.state} />
        <ToolIcon name={tool.name} />
        <span className="hub-tool-name">{tool.name}</span>
        {desc && <span className="hub-tool-desc">{desc}</span>}
        {(tool.input || tool.output) && <ChevronIcon expanded={expanded} />}
      </button>
      {expanded && (tool.input || tool.output) && (
        <div className="hub-tool-detail">
          {tool.input != null && (
            <pre className="hub-tool-detail-content">
              {typeof tool.input === "string" ? tool.input : JSON.stringify(tool.input, null, 2) as string}
            </pre>
          )}
          {tool.output && (
            <>
              <div className="hub-tool-detail-separator">Output</div>
              <pre className="hub-tool-detail-content">{tool.output}</pre>
            </>
          )}
          {tool.error && (
            <div className="hub-tool-error">{tool.error}</div>
          )}
        </div>
      )}
    </div>
  );
}

function formatToolDescription(tool: ToolPart): string {
  if (!tool.input) return "";
  const inp = tool.input as Record<string, unknown>;

  const lower = tool.name.toLowerCase();
  if (lower.includes("bash")) {
    return typeof inp.command === "string" ? `$ ${inp.command.slice(0, 60)}` : "";
  }
  if (lower.includes("read")) {
    return typeof inp.filePath === "string" ? inp.filePath : "";
  }
  if (lower.includes("edit") || lower.includes("write")) {
    return typeof inp.filePath === "string" ? inp.filePath : "";
  }
  if (lower.includes("glob")) {
    return typeof inp.pattern === "string" ? inp.pattern : "";
  }
  if (lower.includes("grep")) {
    return typeof inp.pattern === "string" ? inp.pattern : "";
  }
  if (lower.includes("webfetch")) {
    return typeof inp.url === "string" ? inp.url.slice(0, 60) : "";
  }
  if (lower.includes("websearch") || lower.includes("codesearch")) {
    return typeof inp.query === "string" ? inp.query.slice(0, 60) : "";
  }
  if (lower.includes("task")) {
    const desc = typeof inp.description === "string" ? inp.description : "";
    const agent = typeof inp.subagent_type === "string" ? `[${inp.subagent_type}]` : "";
    return [agent, desc].filter(Boolean).join(" ");
  }
  return "";
}

/** Group context tools into a collapsible summary */
function ContextToolGroup({ tools }: { tools: ToolPart[] }) {
  const [expanded, setExpanded] = useState(false);
  const allDone = tools.every((t) => t.state === "completed");
  const hasError = tools.some((t) => t.state === "error");

  return (
    <div className="hub-tool-group">
      <button
        className="hub-tool-group-header"
        onClick={() => setExpanded(!expanded)}
      >
        {hasError ? <ErrorIcon /> : allDone ? <CheckIcon /> : <SpinnerIcon />}
        <span className="hub-tool-group-label">
          {allDone ? "Gathered context" : "Gathering context"}
        </span>
        <span className="hub-tool-group-count">{tools.length} operations</span>
        <ChevronIcon expanded={expanded} />
      </button>
      {expanded && (
        <div className="hub-tool-group-body">
          {tools.map((tool, i) => (
            <ToolEntry key={i} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Render all tool parts, grouping context tools together */
function ToolParts({ tools }: { tools: ToolPart[] }) {
  const contextTools = tools.filter((t) => isContextTool(t.name));
  const otherTools = tools.filter((t) => !isContextTool(t.name));

  return (
    <div className="hub-tools">
      {contextTools.length > 0 && <ContextToolGroup tools={contextTools} />}
      {otherTools.map((tool, i) => (
        <ToolEntry key={i} tool={tool} />
      ))}
    </div>
  );
}

// ─── Reasoning display ───────────────────────────────────────

function ReasoningDisplay({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // Extract first heading or first line as summary
  const headingMatch = text.match(/^#+\s+(.+)$/m);
  const summary = headingMatch?.[1] || text.split("\n")[0]?.slice(0, 80) || "Thinking...";

  return (
    <div className="hub-reasoning">
      <button className="hub-reasoning-header" onClick={() => setExpanded(!expanded)}>
        <span className="hub-reasoning-label">Reasoning</span>
        <span className="hub-reasoning-summary">{summary}</span>
        <ChevronIcon expanded={expanded} />
      </button>
      {expanded && (
        <div className="hub-reasoning-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

// ─── Thinking shimmer ────────────────────────────────────────

function ThinkingShimmer() {
  return (
    <div className="hub-thinking">
      <span className="hub-thinking-text">Thinking</span>
      <span className="hub-thinking-dots">
        <span className="hub-thinking-dot" />
        <span className="hub-thinking-dot" />
        <span className="hub-thinking-dot" />
      </span>
    </div>
  );
}

// ─── Metadata bar ────────────────────────────────────────────

function MessageMeta({ message }: { message: ChatMessageType }) {
  const items: string[] = [];
  if (message.agent) items.push(message.agent);
  if (message.model) {
    // Shorten model name: "anthropic/claude-sonnet-4-20250514" -> "claude-sonnet-4-20250514"
    const short = message.model.split("/").pop()?.split("@")[0] || message.model;
    items.push(short);
  }
  if (message.duration && message.duration > 0) {
    if (message.duration >= 60) {
      const m = Math.floor(message.duration / 60);
      const s = message.duration % 60;
      items.push(`${m}m ${s}s`);
    } else {
      items.push(`${message.duration}s`);
    }
  }
  if (message.tokens?.output) {
    items.push(`${message.tokens.output} tokens`);
  }
  if (message.cost && message.cost > 0) {
    items.push(`$${message.cost.toFixed(4)}`);
  }
  if (message.error) {
    items.push("error");
  }

  if (items.length === 0) return null;

  return (
    <div className="hub-msg-meta">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="hub-msg-meta-sep">{" \u00B7 "}</span>}
          <span className={item === "error" ? "hub-msg-meta-error" : ""}>{item}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Main ChatMessage component ──────────────────────────────

interface ChatMessageProps {
  message: ChatMessageType;
  isLast?: boolean;
  busy?: boolean;
}

export function ChatMessage({ message, isLast, busy }: ChatMessageProps) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  const reasoning = getMessageReasoning(message);
  const tools = getMessageTools(message);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const showThinking = isLast && busy && !text && tools.length === 0;

  return (
    <div
      className={`hub-message ${isUser ? "hub-message--user" : "hub-message--assistant"}`}
    >
      {/* Label */}
      <div className="hub-message-label">
        <span className="hub-message-label-text">
          {isUser ? "You" : message.agent || "Assistant"}
        </span>
      </div>

      {/* Tool calls (before text, matching OpenCode's layout) */}
      {!isUser && tools.length > 0 && <ToolParts tools={tools} />}

      {/* Reasoning (collapsible) */}
      {!isUser && reasoning && <ReasoningDisplay text={reasoning} />}

      {/* Thinking indicator */}
      {showThinking && <ThinkingShimmer />}

      {/* Text content */}
      {text && (
        <div className="prose prose-sm dark:prose-invert max-w-none hub-message-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {text}
          </ReactMarkdown>
        </div>
      )}

      {/* Error */}
      {message.error && (
        <div className="hub-message-error">
          {message.error}
        </div>
      )}

      {/* Metadata + actions (assistant only, after content) */}
      {!isUser && text && (
        <div className="hub-message-footer">
          <MessageMeta message={message} />
          <div className="hub-message-actions">
            <button
              className="hub-action-btn"
              onClick={handleCopy}
              aria-label="Copy"
              title="Copy"
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
