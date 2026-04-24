// Standardized context format for injecting into OpenCode sessions.
// All clients use this format so the AI receives consistent, structured context.

/**
 * Identifies where the context came from.
 */
export interface ContextSource {
  /** Client type: "browser", "obsidian", "vscode", etc. */
  clientType: string;

  /** Specific context provider ID: "current-page", "current-note", etc. */
  providerId: string;

  /** Optional human-readable label. */
  label?: string;
}

/**
 * A standardized context envelope that wraps any context data
 * before injecting it into an OpenCode session.
 *
 * This is serialized into the message text using a structured format
 * that the AI can parse reliably.
 */
export interface ContextEnvelope {
  /** Where this context came from. */
  source: ContextSource;

  /** Timestamp when context was captured. */
  capturedAt: string;

  /** The actual context content as structured key-value pairs. */
  metadata: Record<string, string>;

  /** The main content body (e.g., page text, note content). */
  content: string;
}

/**
 * Serialize a ContextEnvelope into a text format suitable for
 * injecting into an OpenCode message.
 *
 * Uses XML-like tags for clear delimitation that LLMs parse well.
 */
export function formatContext(envelope: ContextEnvelope): string {
  const metaLines = Object.entries(envelope.metadata)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return [
    `<context source="${envelope.source.clientType}:${envelope.source.providerId}">`,
    metaLines,
    "",
    envelope.content,
    "</context>",
  ].join("\n");
}

/**
 * Format multiple context envelopes into a single text block.
 */
export function formatContextList(envelopes: ContextEnvelope[]): string {
  return envelopes.map(formatContext).join("\n\n");
}
