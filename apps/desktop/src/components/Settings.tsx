import { useEffect, useState } from "react";
import {
  enable,
  disable,
  isEnabled,
} from "@tauri-apps/plugin-autostart";

interface SettingsProps {
  onBack: () => void;
}

export function Settings({ onBack }: SettingsProps) {
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    isEnabled().then((enabled) => {
      setAutoLaunch(enabled);
      setLoading(false);
    });
  }, []);

  const handleToggle = async () => {
    const newValue = !autoLaunch;
    setAutoLaunch(newValue);
    try {
      if (newValue) {
        await enable();
      } else {
        await disable();
      }
    } catch (err) {
      // Revert on failure
      setAutoLaunch(!newValue);
      console.error("Failed to toggle autostart:", err);
    }
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {/* General section */}
      <div className="space-y-3">
        <h2
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--hub-text-secondary)" }}
        >
          General
        </h2>

        <div
          className="flex items-center justify-between px-3 py-2.5 rounded-md border"
          style={{
            borderColor: "var(--hub-border)",
            backgroundColor: "var(--hub-bg-primary)",
          }}
        >
          <div>
            <p
              className="text-sm"
              style={{ color: "var(--hub-text-primary)" }}
            >
              Launch at login
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--hub-text-secondary)" }}
            >
              Start OpenCode Hub when you log in
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoLaunch}
            disabled={loading}
            onClick={handleToggle}
            className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: autoLaunch
                ? "var(--hub-accent, #3b82f6)"
                : "var(--hub-bg-tertiary, #d1d5db)",
            }}
          >
            <span
              className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out"
              style={{
                transform: autoLaunch
                  ? "translateX(17px)"
                  : "translateX(3px)",
              }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
