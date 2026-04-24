import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage as ChatMessageType } from "../store/chat";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className="rounded-lg px-3 py-2.5 text-sm leading-relaxed"
      style={{
        backgroundColor: isUser
          ? "var(--hub-msg-user-bg)"
          : "var(--hub-msg-assistant-bg)",
        border: isUser ? "none" : `1px solid var(--hub-border)`,
      }}
    >
      <div
        className="text-xs font-medium mb-1.5"
        style={{ color: "var(--hub-text-tertiary)" }}
      >
        {isUser ? "You" : "Assistant"}
        {message.streaming && (
          <span className="ml-2 animate-pulse" style={{ color: "var(--hub-accent)" }}>
            typing...
          </span>
        )}
      </div>

      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.content || " "}
        </ReactMarkdown>
      </div>

      {!isUser && !message.streaming && message.content && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t" style={{ borderColor: "var(--hub-border)" }}>
          <button
            className="text-xs px-2 py-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: "var(--hub-text-tertiary)" }}
            onClick={() => navigator.clipboard.writeText(message.content)}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}
