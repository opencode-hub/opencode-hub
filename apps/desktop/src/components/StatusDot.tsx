import type { WorkspaceStatus } from "@opencode-hub/protocol";

interface StatusDotProps {
  status: WorkspaceStatus;
  className?: string;
}

const statusColors: Record<WorkspaceStatus, string> = {
  running: "var(--hub-status-success)",
  stopped: "var(--hub-text-tertiary)",
  starting: "var(--hub-status-warning)",
  error: "var(--hub-status-error)",
};

export function StatusDot({ status, className = "" }: StatusDotProps) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${className}`}
      style={{ backgroundColor: statusColors[status] }}
      title={status}
    />
  );
}
