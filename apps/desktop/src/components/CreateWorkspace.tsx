import { useState } from "react";
import { useWorkspaces } from "../hooks/useWorkspaces";

interface CreateWorkspaceProps {
  onCreated: () => void;
  onCancel: () => void;
}

export function CreateWorkspace({ onCreated, onCancel }: CreateWorkspaceProps) {
  const { createWorkspace } = useWorkspaces();

  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const canCreate = name.trim() && path.trim();

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      await createWorkspace({
        name: name.trim(),
        path: path.trim(),
        autoStart,
        password: password || undefined,
      });
      onCreated();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <Field label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Project"
          className="w-full px-3 py-2 text-sm rounded-md border outline-none focus:ring-2 focus:ring-blue-500/30"
          style={{
            backgroundColor: "var(--hub-bg-primary)",
            borderColor: "var(--hub-border)",
            color: "var(--hub-text-primary)",
          }}
          autoFocus
        />
      </Field>

      <Field label="Working Directory">
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="~/workspaces/my-project"
          className="w-full px-3 py-2 text-sm rounded-md border outline-none focus:ring-2 focus:ring-blue-500/30 font-mono"
          style={{
            backgroundColor: "var(--hub-bg-primary)",
            borderColor: "var(--hub-border)",
            color: "var(--hub-text-primary)",
          }}
        />
      </Field>

      <Field label="Password (optional)">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Leave empty for no auth"
          className="w-full px-3 py-2 text-sm rounded-md border outline-none focus:ring-2 focus:ring-blue-500/30"
          style={{
            backgroundColor: "var(--hub-bg-primary)",
            borderColor: "var(--hub-border)",
            color: "var(--hub-text-primary)",
          }}
        />
      </Field>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="autoStart"
          checked={autoStart}
          onChange={(e) => setAutoStart(e.target.checked)}
          className="accent-blue-500"
        />
        <label
          htmlFor="autoStart"
          className="text-xs"
          style={{ color: "var(--hub-text-secondary)" }}
        >
          Auto-start when Hub launches
        </label>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 px-3 text-xs font-medium rounded-md transition-opacity hover:opacity-80"
          style={{
            backgroundColor: "var(--hub-bg-tertiary)",
            color: "var(--hub-text-primary)",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!canCreate || creating}
          className="flex-1 py-2 px-3 text-xs font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{
            backgroundColor: "var(--hub-accent)",
            color: "#fff",
          }}
        >
          {creating ? "Creating..." : "Create & Start"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        className="text-xs font-medium"
        style={{ color: "var(--hub-text-secondary)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
