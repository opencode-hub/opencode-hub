import { useWorkspaces } from "../hooks/useWorkspaces";
import { StatusDot } from "./StatusDot";

interface WorkspaceListProps {
  onSelect: (id: string) => void;
}

export function WorkspaceList({ onSelect }: WorkspaceListProps) {
  const { workspaces, loading, startWorkspace, stopWorkspace } =
    useWorkspaces();

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-12"
        style={{ color: "var(--hub-text-tertiary)" }}
      >
        Loading...
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div
          className="text-3xl mb-3"
          style={{ color: "var(--hub-text-tertiary)" }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--hub-text-tertiary)" }}
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <p
          className="text-sm mb-1"
          style={{ color: "var(--hub-text-secondary)" }}
        >
          No workspaces yet
        </p>
        <p className="text-xs" style={{ color: "var(--hub-text-tertiary)" }}>
          Click + to create your first workspace
        </p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {workspaces.map((workspace) => (
        <div
          key={workspace.id}
          className="group flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors"
          onClick={() => onSelect(workspace.id)}
        >
          <StatusDot status={workspace.status} className="mt-1.5" />

          <div className="flex-1 min-w-0">
            <div
              className="text-sm font-medium truncate"
              style={{ color: "var(--hub-text-primary)" }}
            >
              {workspace.name}
            </div>
            <div
              className="text-xs truncate mt-0.5"
              style={{ color: "var(--hub-text-tertiary)" }}
            >
              {workspace.path.replace(/^\/Users\/[^/]+/, "~")}
            </div>
            <div
              className="text-xs mt-0.5"
              style={{ color: "var(--hub-text-tertiary)" }}
            >
              :{workspace.port}
              {workspace.status === "running" && " · running"}
            </div>
          </div>

          <button
            className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-7 h-7 rounded-md transition-all hover:bg-black/5 dark:hover:bg-white/5"
            onClick={(e) => {
              e.stopPropagation();
              if (workspace.status === "running") {
                stopWorkspace(workspace.id);
              } else {
                startWorkspace(workspace.id);
              }
            }}
            title={workspace.status === "running" ? "Stop" : "Start"}
            aria-label={workspace.status === "running" ? "Stop" : "Start"}
          >
            {workspace.status === "running" ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="6,4 20,12 6,20" />
              </svg>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
