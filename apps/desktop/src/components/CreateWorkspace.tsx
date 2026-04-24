import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
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

  const handleBrowse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Working Directory",
    });
    if (selected) {
      setPath(selected);
      // Auto-fill name from directory name if empty
      if (!name.trim()) {
        const dirName = selected.split("/").filter(Boolean).pop();
        if (dirName) setName(dirName);
      }
    }
  };

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
        <div className="flex gap-2">
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="~/workspaces/my-project"
            className="flex-1 min-w-0 px-3 py-2 text-sm rounded-md border outline-none focus:ring-2 focus:ring-blue-500/30 font-mono"
            style={{
              backgroundColor: "var(--hub-bg-primary)",
              borderColor: "var(--hub-border)",
              color: "var(--hub-text-primary)",
            }}
          />
          <button
            type="button"
            onClick={handleBrowse}
            className="flex items-center justify-center px-3 py-2 rounded-md border text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
            style={{
              borderColor: "var(--hub-border)",
              color: "var(--hub-text-secondary)",
            }}
            title="Browse for folder"
            aria-label="Browse for folder"
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
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
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
