import { useConnectionStore } from "../store/connection";

interface SidebarHeaderProps {
  onSettingsToggle: () => void;
  showSettings: boolean;
}

export function SidebarHeader({
  onSettingsToggle,
  showSettings,
}: SidebarHeaderProps) {
  const { connected } = useConnectionStore();

  return (
    <header
      className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
      style={{
        borderColor: "var(--hub-border)",
        backgroundColor: "var(--hub-bg-secondary)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{
            backgroundColor: connected
              ? "var(--hub-status-success)"
              : "var(--hub-status-error)",
          }}
        />
        <span className="text-sm font-semibold">OpenCode Hub</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onSettingsToggle}
          className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          title="Settings"
          aria-label="Settings"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: showSettings ? "var(--hub-accent)" : "var(--hub-text-secondary)" }}
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>
    </header>
  );
}
