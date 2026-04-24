import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  port: number;
  status: "running" | "stopped" | "starting" | "error";
  pid?: number;
  startedAt?: string;
  autoStart: boolean;
  password?: string;
}

export interface CreateWorkspaceConfig {
  name: string;
  path: string;
  port?: number;
  autoStart?: boolean;
  password?: string;
}

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

/**
 * Hook for managing workspaces via Tauri invoke() commands.
 */
export function useWorkspaces(): UseWorkspacesReturn {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await invoke<WorkspaceInfo[]>("list_workspaces");
      setWorkspaces(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startWorkspace = async (id: string) => {
    try {
      await invoke("start_workspace", { id });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const stopWorkspace = async (id: string) => {
    try {
      await invoke("stop_workspace", { id });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const createWorkspace = async (config: CreateWorkspaceConfig) => {
    try {
      await invoke("create_workspace", {
        input: {
          name: config.name,
          path: config.path,
          port: config.port ?? null,
          autoStart: config.autoStart ?? false,
          password: config.password ?? null,
        },
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteWorkspace = async (id: string) => {
    try {
      await invoke("delete_workspace", { id });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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
