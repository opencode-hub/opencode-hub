// @opencode-hub/protocol
// Protocol definitions for OpenCode Hub client ecosystem.

export type {
  ClientRegistration,
  ClientInfo,
  ClientCapabilities,
  ContextProviderDeclaration,
  ActionDeclaration,
} from "./capabilities.js";

export type {
  ContextEnvelope,
  ContextSource,
} from "./context.js";

export { formatContext, formatContextList } from "./context.js";

export type {
  WorkspaceInfo,
  WorkspaceStatus,
  DiscoveryFile,
  ClientRecord,
} from "./discovery.js";

export {
  DISCOVERY_FILE_PATH,
  DEFAULT_BASE_PORT,
  DEFAULT_HOSTNAME,
} from "./discovery.js";

export type {
  HubEvent,
  HubEventType,
  WorkspaceEvent,
  ClientEvent,
} from "./events.js";
