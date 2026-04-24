import { useEffect, useRef, useCallback } from "react";
import { useChatStore } from "../store/chat";
import { ChatMessage } from "./ChatMessage";

export function ChatView() {
  const { messages, loadMessages, busy, setBusy } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Listen for SSE events from background
  useEffect(() => {
    const listener = (message: any) => {
      if (message.type === "SSE_EVENT") {
        const event = message.event;

        switch (event.type) {
          case "message.updated":
          case "message.part.updated":
          case "message.created":
          case "message.part.delta":
            // Reload messages to get latest state
            loadMessages();
            break;

          case "session.status": {
            // Track busy state from session status events
            const status = event.properties?.status;
            if (status === "idle" || status === "completed") {
              setBusy(false);
              // Final reload to get complete data
              loadMessages();
            } else if (status === "busy" || status === "running") {
              setBusy(true);
            }
            break;
          }
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [loadMessages, setBusy]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isAtBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isAtBottom.current = scrollHeight - scrollTop - clientHeight < 40;
  }, []);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <p
            className="text-sm"
            style={{ color: "var(--hub-text-secondary)" }}
          >
            Start a conversation or select text on any page to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      onScroll={handleScroll}
    >
      {messages.map((msg, idx) => (
        <ChatMessage
          key={msg.id}
          message={msg}
          isLast={idx === messages.length - 1}
          busy={busy}
        />
      ))}
    </div>
  );
}
