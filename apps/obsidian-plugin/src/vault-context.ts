import { App, TFile } from "obsidian";
import { formatContext } from "@opencode-hub/protocol";
import type { ContextEnvelope } from "@opencode-hub/protocol";

/**
 * Extracts context from the Obsidian vault for injection into OpenCode sessions.
 */
export class VaultContext {
  constructor(private app: App) {}

  /**
   * Get context for the currently active note, including content,
   * frontmatter, links, backlinks, and tags.
   */
  async getCurrentNoteContext(): Promise<string | null> {
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;

    const content = await this.app.vault.cachedRead(file);
    const cache = this.app.metadataCache.getFileCache(file);

    // Collect metadata
    const metadata: Record<string, string> = {
      "File": file.path,
      "Modified": new Date(file.stat.mtime).toISOString(),
    };

    // Tags
    const tags = cache?.tags?.map((t) => t.tag) ?? [];
    if (cache?.frontmatter?.tags) {
      const fmTags = Array.isArray(cache.frontmatter.tags)
        ? cache.frontmatter.tags
        : [cache.frontmatter.tags];
      tags.push(...fmTags.map((t: string) => (t.startsWith("#") ? t : `#${t}`)));
    }
    if (tags.length > 0) {
      metadata["Tags"] = [...new Set(tags)].join(", ");
    }

    // Outgoing links
    const outlinks = cache?.links?.map((l) => l.link) ?? [];
    if (outlinks.length > 0) {
      metadata["Outlinks"] = outlinks.map((l) => `[[${l}]]`).join(", ");
    }

    // Backlinks
    // @ts-ignore — getBacklinksForFile exists but isn't in the public types
    const backlinksData = this.app.metadataCache.getBacklinksForFile?.(file);
    const backlinks = backlinksData?.data
      ? Object.keys(backlinksData.data)
      : [];
    if (backlinks.length > 0) {
      metadata["Backlinks"] = backlinks.map((l) => `[[${l}]]`).join(", ");
    }

    // Frontmatter (excluding tags which we already handle)
    if (cache?.frontmatter) {
      const { tags: _tags, ...rest } = cache.frontmatter;
      for (const [key, value] of Object.entries(rest)) {
        if (key !== "position" && value !== undefined) {
          metadata[`FM:${key}`] = String(value);
        }
      }
    }

    const envelope: ContextEnvelope = {
      source: {
        clientType: "obsidian",
        providerId: "current-note",
        label: file.basename,
      },
      capturedAt: new Date().toISOString(),
      metadata,
      content,
    };

    return formatContext(envelope);
  }

  /**
   * Get context for multiple linked notes (one hop from current note).
   */
  async getLinkedNotesContext(file: TFile, maxNotes = 5): Promise<string[]> {
    const cache = this.app.metadataCache.getFileCache(file);
    const linkedPaths = cache?.links?.map((l) => l.link) ?? [];
    const contexts: string[] = [];

    for (const linkPath of linkedPaths.slice(0, maxNotes)) {
      const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
        linkPath,
        file.path,
      );
      if (linkedFile instanceof TFile) {
        const content = await this.app.vault.cachedRead(linkedFile);
        const envelope: ContextEnvelope = {
          source: {
            clientType: "obsidian",
            providerId: "linked-note",
            label: linkedFile.basename,
          },
          capturedAt: new Date().toISOString(),
          metadata: {
            "File": linkedFile.path,
            "Linked from": file.path,
          },
          content: content.slice(0, 2000), // Truncate for context window
        };
        contexts.push(formatContext(envelope));
      }
    }

    return contexts;
  }
}
