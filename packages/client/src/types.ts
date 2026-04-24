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

/** Session status — discriminated union matching server's SessionStatus.Info */
export type SessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number };

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
  /** If true, this part is system-generated context (not real user input). */
  synthetic?: boolean;
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
  /** Models is a dict keyed by modelID, not an array */
  models: Record<string, ProviderModel>;
}

export interface ProviderModel {
  id: string;
  name: string;
  capabilities?: {
    reasoning?: boolean;
    temperature?: boolean;
    attachment?: boolean;
    toolcall?: boolean;
  };
}

export interface ConfigResponse {
  /** Model in "provider/modelId" format, e.g. "anthropic/claude-sonnet-4-20250514" */
  model?: string;
  [key: string]: unknown;
}

// ─── Question ──────────────────────────────────────────────────

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionRequest {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: {
    messageID: string;
    callID: string;
  };
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
