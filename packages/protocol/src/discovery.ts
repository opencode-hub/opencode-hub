// Workspace discovery — how clients find available workspaces.
// Hub maintains ~/.opencode-hub/discovery.json for local discovery.

/**
 * Status of a workspace.
 */
export type WorkspaceStatus = "running" | "stopped" | "starting" | "error";

/**
 * Information about a single workspace.
 */
export interface WorkspaceInfo {
  /** Unique workspace ID. */
  id: string;

  /** Human-readable name. */
  name: string;

  /** Absolute path to the workspace root directory. */
  path: string;

  /** Port the OpenCode server is listening on. */
  port: number;

  /** Current status. */
  status: WorkspaceStatus;

  /** PID of the OpenCode server process (if running). */
  pid?: number;

  /** When the workspace was last started. */
  startedAt?: string;

  /** Whether to auto-start this workspace when Hub launches. */
  autoStart: boolean;

  /** Optional server password for HTTP Basic Auth. */
  password?: string;
}

/**
 * Record of a connected client, maintained by Hub.
 */
export interface ClientRecord {
  /** Client instance ID. */
  clientId: string;

  /** Client type. */
  clientType: string;

  /** Client display name. */
  clientName: string;

  /** Which workspace this client is connected to. */
  workspaceId: string;

  /** When the client registered. */
  registeredAt: string;
}

/**
 * The discovery file at ~/.opencode-hub/discovery.json
 * Read by clients to find available workspaces.
 */
export interface DiscoveryFile {
  /** All configured workspaces. */
  workspaces: WorkspaceInfo[];

  /** Currently connected clients. */
  clients: ClientRecord[];

  /** When this file was last updated. */
  updatedAt: string;
}

/**
 * Default path for the discovery file.
 */
export const DISCOVERY_FILE_PATH = ".opencode-hub/discovery.json";

/**
 * Default base port for workspace allocation.
 */
export const DEFAULT_BASE_PORT = 4096;

/**
 * Default hostname for local servers.
 */
export const DEFAULT_HOSTNAME = "127.0.0.1";
