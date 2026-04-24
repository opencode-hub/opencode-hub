import { useEffect, useRef } from "react";
import { useChatStore } from "../store/chat";
import { ChatMessage } from "./ChatMessage";

export function ChatView() {
  const { messages, loadMessages } = useChatStore();
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
        // Handle streaming text events
        if (event.type === "message.part.updated" || event.type === "message.created") {
          // Reload messages to get latest state
          loadMessages();
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [loadMessages]);

  // Auto-scroll
  useEffect(() => {
    if (isAtBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isAtBottom.current = scrollHeight - scrollTop - clientHeight < 40;
  };

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
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
    </div>
  );
}
