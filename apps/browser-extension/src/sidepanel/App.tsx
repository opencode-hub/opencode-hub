import { useState, useEffect } from "react";
import { SidebarHeader } from "./components/SidebarHeader";
import { ChatView } from "./components/ChatView";
import { ChatInput } from "./components/ChatInput";
import { SettingsPanel } from "./components/SettingsPanel";
import { useConnectionStore } from "./store/connection";

export function App() {
  const [showSettings, setShowSettings] = useState(false);
  const { connected, connect, checkStatus } = useConnectionStore();

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Show settings if not connected
  useEffect(() => {
    if (!connected) {
      setShowSettings(true);
    }
  }, [connected]);

  return (
    <div className="flex flex-col h-screen">
      <SidebarHeader
        onSettingsToggle={() => setShowSettings(!showSettings)}
        showSettings={showSettings}
      />

      {showSettings ? (
        <SettingsPanel
          onConnected={() => setShowSettings(false)}
        />
      ) : (
        <>
          <ChatView />
          <ChatInput />
        </>
      )}
    </div>
  );
}
