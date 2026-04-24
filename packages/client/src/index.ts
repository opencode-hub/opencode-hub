// @opencode-hub/client
// TypeScript SDK for OpenCode Server — zero UI dependencies.

export { OpenCodeClient, OpenCodeError } from "./api.js";
export { EventSubscriber } from "./sse.js";
export {
  resolveDiscoveryPath,
  parseDiscoveryFile,
  createEmptyDiscoveryFile,
  findWorkspace,
  getRunningWorkspaces,
  workspaceToUrl,
} from "./discovery.js";

// Re-export types
export type {
  ClientOptions,
  HealthResponse,
  Project,
  Session,
  SessionStatus,
  CreateSessionBody,
  UpdateSessionBody,
  SendMessageBody,
  MessagePart,
  ModelRef,
  MessageResponse,
  MessageInfo,
  MessagePartResponse,
  Command,
  RunCommandBody,
  FileNode,
  FileContent,
  FileDiff,
  Provider,
  ProviderModel,
  ConfigResponse,
  Agent,
  Todo,
} from "./types.js";

export type {
  SSEEvent,
  SSEEventHandler,
  SSEErrorHandler,
  SSEStatusHandler,
  EventSubscriberOptions,
} from "./sse.js";
