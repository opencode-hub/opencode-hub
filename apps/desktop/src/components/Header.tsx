interface HeaderProps {
  view: string;
  onBack?: () => void;
  onCreate?: () => void;
}

export function Header({ view, onBack, onCreate }: HeaderProps) {
  const title =
    view === "list"
      ? "OpenCode Hub"
      : view === "create"
        ? "New Workspace"
        : "Workspace";

  return (
    <header
      className="flex items-center justify-between px-4 py-3 border-b"
      style={{
        borderColor: "var(--hub-border)",
        backgroundColor: "var(--hub-bg-secondary)",
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
        <h1
          className="text-sm font-semibold"
          style={{ color: "var(--hub-text-primary)" }}
        >
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-1">
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
