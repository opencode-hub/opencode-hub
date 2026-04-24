import { useState, useEffect, useCallback } from "react";
import type { WorkspaceInfo } from "@opencode-hub/protocol";

// In Tauri, we'll use invoke() to call Rust commands.
// For now, stub with local state until Tauri backend is implemented.

interface UseWorkspacesReturn {
  workspaces: WorkspaceInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  startWorkspace: (id: string) => Promise<void>;
  stopWorkspace: (id: string) => Promise<void>;
  createWorkspace: (config: CreateWorkspaceConfig) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
}

export interface CreateWorkspaceConfig {
  name: string;
  path: string;
  port?: number;
  autoStart?: boolean;
  password?: string;
}

/**
 * Hook for managing workspaces.
 * Currently uses local state — will be wired to Tauri invoke() commands.
 */
export function useWorkspaces(): UseWorkspacesReturn {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Replace with Tauri invoke("list_workspaces")
      // For now, try reading from discovery file or use empty state
      const stored = localStorage.getItem("opencode-hub-workspaces");
      if (stored) {
        setWorkspaces(JSON.parse(stored));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = (updated: WorkspaceInfo[]) => {
    setWorkspaces(updated);
    localStorage.setItem("opencode-hub-workspaces", JSON.stringify(updated));
  };

  const startWorkspace = async (id: string) => {
    // TODO: Tauri invoke("start_workspace", { id })
    persist(
      workspaces.map((w) =>
        w.id === id ? { ...w, status: "running" as const, startedAt: new Date().toISOString() } : w,
      ),
    );
  };

  const stopWorkspace = async (id: string) => {
    // TODO: Tauri invoke("stop_workspace", { id })
    persist(
      workspaces.map((w) =>
        w.id === id ? { ...w, status: "stopped" as const, pid: undefined, startedAt: undefined } : w,
      ),
    );
  };

  const createWorkspace = async (config: CreateWorkspaceConfig) => {
    const newWorkspace: WorkspaceInfo = {
      id: `ws-${Date.now().toString(36)}`,
      name: config.name,
      path: config.path,
      port: config.port ?? 4096 + workspaces.length,
      status: "stopped",
      autoStart: config.autoStart ?? false,
      password: config.password,
    };
    // TODO: Tauri invoke("create_workspace", { config })
    persist([...workspaces, newWorkspace]);
  };

  const deleteWorkspace = async (id: string) => {
    // TODO: Tauri invoke("delete_workspace", { id })
    persist(workspaces.filter((w) => w.id !== id));
  };

  return {
    workspaces,
    loading,
    error,
    refresh,
    startWorkspace,
    stopWorkspace,
    createWorkspace,
    deleteWorkspace,
  };
}
