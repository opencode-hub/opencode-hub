// OpenCode Server API types — derived from OpenAPI 3.1 spec at /doc.

// ─── Global ────────────────────────────────────────────────────

export interface HealthResponse {
  healthy: boolean;
  version: string;
}

// ─── Project ───────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  path: string;
}

// ─── Session ───────────────────────────────────────────────────

export interface Session {
  id: string;
  title?: string;
  parentID?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionStatus {
  running: boolean;
  tool?: string;
}

export interface CreateSessionBody {
  parentID?: string;
  title?: string;
}

export interface UpdateSessionBody {
  title?: string;
}

// ─── Message ───────────────────────────────────────────────────

export interface MessagePart {
  type: "text";
  text: string;
}

export interface ModelRef {
  providerID: string;
  modelID: string;
}

export interface OutputFormatText {
  type: "text";
}

export interface OutputFormatJsonSchema {
  type: "json_schema";
  schema: Record<string, unknown>;
  retryCount?: number;
}

export type OutputFormat = OutputFormatText | OutputFormatJsonSchema;

export interface SendMessageBody {
  /** Message content parts. */
  parts: MessagePart[];
  /** Override model for this message. */
  model?: ModelRef;
  /** Agent to use. */
  agent?: string;
  /** If true, inject context only — no AI response. */
  noReply?: boolean;
  /** System prompt override. */
  system?: string;
  /** Tool overrides. */
  tools?: string[];
  /** Structured output format. */
  format?: OutputFormat;
  /** Continue from a specific message. */
  messageID?: string;
}

export interface MessageInfo {
  id: string;
  role: "user" | "assistant" | "system";
  sessionID: string;
  createdAt: string;
  structured_output?: unknown;
}

export interface MessagePartResponse {
  type: string;
  [key: string]: unknown;
}

export interface MessageResponse {
  info: MessageInfo;
  parts: MessagePartResponse[];
}

// ─── Command ───────────────────────────────────────────────────

export interface Command {
  id: string;
  name: string;
  description: string;
}

export interface RunCommandBody {
  command: string;
  arguments: string;
  messageID?: string;
  agent?: string;
  model?: ModelRef;
}

// ─── File ──────────────────────────────────────────────────────

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

export interface FileContent {
  type: "raw" | "patch";
  content: string;
}

export interface FileDiff {
  path: string;
  status: string;
  diff?: string;
}

// ─── Config ────────────────────────────────────────────────────

export interface Provider {
  id: string;
  name: string;
  models: ProviderModel[];
}

export interface ProviderModel {
  id: string;
  name: string;
}

export interface ConfigResponse {
  [key: string]: unknown;
}

// ─── Agent ─────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  description: string;
}

// ─── Todo ──────────────────────────────────────────────────────

export interface Todo {
  id: string;
  content: string;
  status: string;
}

// ─── Client Options ────────────────────────────────────────────

export interface ClientOptions {
  /** Base URL of the OpenCode server. @default "http://127.0.0.1:4096" */
  baseUrl?: string;
  /** Username for HTTP Basic Auth. @default "opencode" */
  username?: string;
  /** Password for HTTP Basic Auth. */
  password?: string;
  /** Custom fetch implementation. */
  fetch?: typeof globalThis.fetch;
}
