// Workspace discovery — read discovery.json to find available workspaces.
// Works in Node.js (Obsidian, Tauri backend) and via native messaging (Browser).

import type { DiscoveryFile, WorkspaceInfo } from "@opencode-hub/protocol";
import { DISCOVERY_FILE_PATH } from "@opencode-hub/protocol";

/**
 * Resolve the absolute path to discovery.json.
 * Uses HOME environment variable (works on macOS/Linux).
 */
export function resolveDiscoveryPath(homeDir?: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const home = homeDir ?? (typeof globalThis !== "undefined" && "process" in globalThis
    ? (globalThis as any).process?.env?.HOME as string | undefined
    : undefined);
  if (!home) {
    throw new Error("Cannot determine home directory for discovery file");
  }
  return `${home}/${DISCOVERY_FILE_PATH}`;
}

/**
 * Parse a discovery file from JSON string.
 */
export function parseDiscoveryFile(json: string): DiscoveryFile {
  const data = JSON.parse(json) as DiscoveryFile;
  return data;
}

/**
 * Create an empty discovery file.
 */
export function createEmptyDiscoveryFile(): DiscoveryFile {
  return {
    workspaces: [],
    clients: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Find a workspace by ID.
 */
export function findWorkspace(
  discovery: DiscoveryFile,
  workspaceId: string,
): WorkspaceInfo | undefined {
  return discovery.workspaces.find((w) => w.id === workspaceId);
}

/**
 * Get all running workspaces.
 */
export function getRunningWorkspaces(
  discovery: DiscoveryFile,
): WorkspaceInfo[] {
  return discovery.workspaces.filter((w) => w.status === "running");
}

/**
 * Build the OpenCode server base URL from workspace info.
 */
export function workspaceToUrl(workspace: WorkspaceInfo): string {
  return `http://127.0.0.1:${workspace.port}`;
}
