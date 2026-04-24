import { useMemo } from "react";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { StatusDot } from "./StatusDot";

interface WorkspaceDetailProps {
  workspaceId: string;
  onBack: () => void;
}

export function WorkspaceDetail({ workspaceId, onBack }: WorkspaceDetailProps) {
  const { workspaces, startWorkspace, stopWorkspace, deleteWorkspace } =
    useWorkspaces();

  const workspace = useMemo(
    () => workspaces.find((w) => w.id === workspaceId),
    [workspaces, workspaceId],
  );

  if (!workspace) {
    return (
      <div
        className="flex items-center justify-center py-12"
        style={{ color: "var(--hub-text-tertiary)" }}
      >
        Workspace not found
      </div>
    );
  }

  const isRunning = workspace.status === "running";

  const formatUptime = (startedAt?: string) => {
    if (!startedAt) return "—";
    const diff = Date.now() - new Date(startedAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ${mins % 60}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Status overview */}
      <div
        className="rounded-lg p-4 space-y-2"
        style={{ backgroundColor: "var(--hub-bg-secondary)" }}
      >
        <div className="flex items-center gap-2">
          <StatusDot status={workspace.status} />
          <span
            className="text-sm font-medium capitalize"
            style={{ color: "var(--hub-text-primary)" }}
          >
            {workspace.status}
          </span>
        </div>

        <InfoRow label="Port" value={`:${workspace.port}`} />
        <InfoRow
          label="Path"
          value={workspace.path.replace(/^\/Users\/[^/]+/, "~")}
        />
        <InfoRow label="Uptime" value={formatUptime(workspace.startedAt)} />
        {workspace.pid && (
          <InfoRow label="PID" value={String(workspace.pid)} />
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {isRunning ? (
          <>
            <ActionButton
              label="Open WebUI"
              onClick={() =>
                window.open(
                  `http://127.0.0.1:${workspace.port}`,
                  "_blank",
                )
              }
              variant="primary"
            />
            <ActionButton
              label="Stop"
              onClick={() => stopWorkspace(workspace.id)}
              variant="secondary"
            />
          </>
        ) : (
          <>
            <ActionButton
              label="Start"
              onClick={() => startWorkspace(workspace.id)}
              variant="primary"
            />
            <ActionButton
              label="Delete"
              onClick={() => {
                deleteWorkspace(workspace.id);
                onBack();
              }}
              variant="danger"
            />
          </>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: "var(--hub-text-secondary)" }}>{label}</span>
      <span
        className="font-mono"
        style={{ color: "var(--hub-text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  variant,
}: {
  label: string;
  onClick: () => void;
  variant: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: {
      backgroundColor: "var(--hub-accent)",
      color: "#fff",
    },
    secondary: {
      backgroundColor: "var(--hub-bg-tertiary)",
      color: "var(--hub-text-primary)",
    },
    danger: {
      backgroundColor: "transparent",
      color: "var(--hub-status-error)",
      border: "1px solid var(--hub-status-error)",
    },
  };

  return (
    <button
      onClick={onClick}
      className="flex-1 py-2 px-3 text-xs font-medium rounded-md transition-opacity hover:opacity-80"
      style={styles[variant]}
    >
      {label}
    </button>
  );
}
