// Hub-level events for workspace and client lifecycle.
// These are Hub's own events, separate from OpenCode Server's SSE events.

export type HubEventType =
  | "workspace.created"
  | "workspace.started"
  | "workspace.stopped"
  | "workspace.error"
  | "workspace.deleted"
  | "client.registered"
  | "client.disconnected";

/**
 * Base event type for all Hub events.
 */
export interface HubEvent {
  type: HubEventType;
  timestamp: string;
}

/**
 * Events related to workspace lifecycle.
 */
export interface WorkspaceEvent extends HubEvent {
  type:
    | "workspace.created"
    | "workspace.started"
    | "workspace.stopped"
    | "workspace.error"
    | "workspace.deleted";
  workspaceId: string;
  workspaceName: string;
  /** Error message if type is "workspace.error". */
  error?: string;
}

/**
 * Events related to client connections.
 */
export interface ClientEvent extends HubEvent {
  type: "client.registered" | "client.disconnected";
  clientId: string;
  clientType: string;
  clientName: string;
  workspaceId: string;
}
