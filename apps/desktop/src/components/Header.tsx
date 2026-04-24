interface HeaderProps {
  view: string;
  onBack?: () => void;
  onCreate?: () => void;
  onSettings?: () => void;
}

export function Header({ view, onBack, onCreate, onSettings }: HeaderProps) {
  // Sub-pages show a title; list view shows nothing (the window title is hidden)
  const title =
    view === "create"
      ? "New Workspace"
      : view === "settings"
        ? "Settings"
        : view === "detail"
          ? "Workspace"
          : null;

  return (
    <header
      className="flex items-center justify-between px-4 py-3 border-b"
      style={{
        borderColor: "var(--hub-border)",
        backgroundColor: "var(--hub-bg-secondary)",
        // Leave room for macOS traffic-light buttons (overlay title bar)
        paddingLeft: "76px",
      }}
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            aria-label="Back"
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
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        {title && (
          <h1
            className="text-sm font-semibold"
            style={{ color: "var(--hub-text-primary)" }}
          >
            {title}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-1">
        {onSettings && (
          <button
            onClick={onSettings}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
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
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
        {onCreate && (
          <button
            onClick={onCreate}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="New Workspace"
            aria-label="New Workspace"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
