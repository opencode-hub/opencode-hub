import { useState } from "react";
import { useConnectionStore } from "../store/connection";

interface SettingsPanelProps {
  onConnected: () => void;
}

export function SettingsPanel({ onConnected }: SettingsPanelProps) {
  const { serverUrl, connected, error, connect, disconnect } =
    useConnectionStore();
  const [url, setUrl] = useState(serverUrl);
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    await connect(url, password || undefined);
    setConnecting(false);
    if (useConnectionStore.getState().connected) {
      onConnected();
    }
  };

  return (
    <div className="flex-1 px-4 py-4 space-y-4">
      <div className="space-y-1.5">
        <label
          className="text-xs font-medium"
          style={{ color: "var(--hub-text-secondary)" }}
        >
          Server URL
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://127.0.0.1:4096"
          className="w-full px-3 py-2 text-sm rounded-md border outline-none font-mono focus:ring-2 focus:ring-blue-500/30"
          style={{
            backgroundColor: "var(--hub-bg-secondary)",
            borderColor: "var(--hub-border)",
            color: "var(--hub-text-primary)",
          }}
        />
      </div>

      <div className="space-y-1.5">
        <label
          className="text-xs font-medium"
          style={{ color: "var(--hub-text-secondary)" }}
        >
          Password (optional)
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Leave empty if no auth"
          className="w-full px-3 py-2 text-sm rounded-md border outline-none focus:ring-2 focus:ring-blue-500/30"
          style={{
            backgroundColor: "var(--hub-bg-secondary)",
            borderColor: "var(--hub-border)",
            color: "var(--hub-text-primary)",
          }}
        />
      </div>

      {error && (
        <div
          className="text-xs px-3 py-2 rounded-md"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "var(--hub-status-error)",
          }}
        >
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {connected ? (
          <button
            onClick={disconnect}
            className="flex-1 py-2 px-3 text-xs font-medium rounded-md transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--hub-bg-tertiary)",
              color: "var(--hub-text-primary)",
            }}
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting || !url.trim()}
            className="flex-1 py-2 px-3 text-xs font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{
              backgroundColor: "var(--hub-accent)",
              color: "#fff",
            }}
          >
            {connecting ? "Connecting..." : "Connect"}
          </button>
        )}
      </div>

      <div
        className="text-xs pt-2"
        style={{ color: "var(--hub-text-tertiary)" }}
      >
        Connect to an OpenCode workspace. Start one with{" "}
        <code
          className="px-1 py-0.5 rounded text-xs"
          style={{ backgroundColor: "var(--hub-bg-tertiary)" }}
        >
          opencode serve
        </code>{" "}
        or use OpenCode Hub desktop app.
      </div>
    </div>
  );
}
