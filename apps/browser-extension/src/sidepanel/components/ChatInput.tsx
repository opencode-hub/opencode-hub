import { useState, useRef, useCallback } from "react";
import { useChatStore } from "../store/chat";

export function ChatInput() {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { addUserMessage, streaming } = useChatStore();

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    addUserMessage(trimmed);
    setText("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Send to background
    await chrome.runtime.sendMessage({
      type: "SEND_MESSAGE",
      text: trimmed,
    });
  }, [text, streaming, addUserMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  return (
    <div
      className="shrink-0 border-t px-3 py-3"
      style={{ borderColor: "var(--hub-border)" }}
    >
      <div
        className="flex items-end gap-2 rounded-lg border px-3 py-2"
        style={{
          borderColor: "var(--hub-border)",
          backgroundColor: "var(--hub-bg-secondary)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          rows={1}
          className="flex-1 resize-none bg-transparent border-none outline-none text-sm"
          style={{
            color: "var(--hub-text-primary)",
            minHeight: "20px",
            maxHeight: "120px",
          }}
          disabled={streaming}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || streaming}
          className="flex items-center justify-center w-7 h-7 rounded-md transition-colors disabled:opacity-30"
          style={{ backgroundColor: "var(--hub-accent)", color: "#fff" }}
          aria-label="Send"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
