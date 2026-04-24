// Client capability declarations — MCP-inspired registration protocol.
// Each client declares what context it can provide and what actions it can perform.

/**
 * JSON Schema subset for describing data shapes.
 * Kept minimal — full JSON Schema validation is not required at the protocol level.
 */
export interface JSONSchemaFragment {
  type?: string;
  properties?: Record<string, JSONSchemaFragment>;
  items?: JSONSchemaFragment;
  required?: string[];
  description?: string;
  enum?: string[];
}

/**
 * Declares a type of context this client can provide.
 *
 * Examples:
 * - Browser: "current-page", "selected-text", "open-tabs"
 * - Obsidian: "current-note", "backlinks", "vault-structure"
 * - Figma (future): "selected-layers", "design-tokens"
 */
export interface ContextProviderDeclaration {
  /** Unique identifier for this context type. */
  id: string;

  /** Human-readable name. */
  name: string;

  /** Description of what this context contains. */
  description: string;

  /**
   * If true, this context is automatically attached to every message
   * sent from this client. If false, user must explicitly request it.
   * @default false
   */
  autoAttach?: boolean;

  /** JSON Schema describing the shape of context data. */
  schema?: JSONSchemaFragment;
}

/**
 * Declares an action this client can perform.
 *
 * Examples:
 * - Browser: "open-url", "screenshot", "extract-content"
 * - Obsidian: "insert-text", "create-note", "search-vault"
 */
export interface ActionDeclaration {
  /** Unique identifier for this action. */
  id: string;

  /** Human-readable name. */
  name: string;

  /** Description of what this action does. */
  description: string;

  /** JSON Schema for action input parameters. */
  inputSchema?: JSONSchemaFragment;

  /** JSON Schema for action output. */
  outputSchema?: JSONSchemaFragment;
}

/**
 * Basic information about a client instance.
 */
export interface ClientInfo {
  /** Unique client instance ID (generated per installation). */
  id: string;

  /** Client type identifier. */
  type: string;

  /** Human-readable display name. */
  name: string;

  /** Client version. */
  version: string;
}

/**
 * What a client can provide and do.
 */
export interface ClientCapabilities {
  /** Context types this client can provide. */
  contextProviders: ContextProviderDeclaration[];

  /** Actions this client can perform. */
  actions: ActionDeclaration[];
}

/**
 * Full registration payload sent by a client to Hub.
 */
export interface ClientRegistration {
  /** Client identity. */
  client: ClientInfo;

  /** ID of the workspace this client is connecting to. */
  workspaceId: string;

  /** Client capabilities. */
  capabilities: ClientCapabilities;
}
