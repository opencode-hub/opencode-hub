import { App, TFile, MarkdownView, CachedMetadata, EventRef } from "obsidian";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface ActiveFileInfo {
  path: string;
  name: string;
  extension: string;
}

export interface OpenTab {
  filePath: string | null;
  fileName: string | null;
  viewType: string;
  isActive: boolean;
}

export interface CursorPosition {
  line: number;
  ch: number;
}

export interface WorkspaceState {
  activeFile: ActiveFileInfo | null;
  openTabs: OpenTab[];
  recentFiles: string[];
  activeView: string | null;
  cursorPosition: CursorPosition | null;
  selection: string | null;
}

export interface HeadingInfo {
  heading: string;
  level: number;
}

export interface NoteContext {
  path: string;
  name: string;
  extension: string;
  content: string;
  tags: string[];
  outgoingLinks: string[];
  backlinks: string[];
  frontmatter: Record<string, unknown>;
  headings: HeadingInfo[];
  wordCount: number;
}

// ---------------------------------------------------------------------------
// Internal helper – lightweight XML-style context formatter
// ---------------------------------------------------------------------------

function formatContext(
  source: string,
  label: string,
  metadata: Record<string, string>,
  content: string,
): string {
  const metaLines = Object.entries(metadata)
    .map(([k, v]) => `  <${k}>${v}</${k}>`)
    .join("\n");

  return [
    `<context source="${source}" label="${escapeXml(label)}">`,
    `<metadata>`,
    metaLines,
    `</metadata>`,
    `<content>`,
    content,
    `</content>`,
    `</context>`,
  ].join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// VaultContext
// ---------------------------------------------------------------------------

/**
 * Comprehensive workspace context provider for Obsidian.
 *
 * Exposes structured data about the active file, open tabs, recent files,
 * cursor/selection state, note metadata, linked notes, and formatted context
 * strings suitable for injection into AI conversations.
 */
export class VaultContext {
  constructor(private app: App) {}

  // -----------------------------------------------------------------------
  // 1. getWorkspaceState
  // -----------------------------------------------------------------------

  /**
   * Returns a structured snapshot of the current workspace state including
   * the active file, open tabs, recent files, active view type, cursor
   * position, and any selected text.
   */
  getWorkspaceState(): WorkspaceState {
    // Active file
    const activeFile = this.app.workspace.getActiveFile();
    const activeFileInfo: ActiveFileInfo | null = activeFile
      ? {
          path: activeFile.path,
          name: activeFile.basename,
          extension: activeFile.extension,
        }
      : null;

    // Open tabs (deduplicated by file path)
    const openTabs: OpenTab[] = [];
    const seenPaths = new Set<string>();
    const activeLeaf = this.app.workspace.activeLeaf;
    this.app.workspace.iterateAllLeaves((leaf) => {
      const viewState = leaf.getViewState();
      const filePath: string | null =
        viewState.state?.file != null ? String(viewState.state.file) : null;
      if (!filePath || seenPaths.has(filePath)) return;
      seenPaths.add(filePath);
      const file = filePath
        ? this.app.vault.getAbstractFileByPath(filePath)
        : null;
      openTabs.push({
        filePath: file instanceof TFile ? file.path : filePath,
        fileName: file instanceof TFile ? file.basename : null,
        viewType: viewState.type ?? "unknown",
        isActive: leaf === activeLeaf,
      });
    });

    // Recent files – Obsidian stores a "file-open" history on the workspace.
    // The internal `recentFileTracker` is not in the public API so we fall
    // back gracefully.
    let recentFiles: string[] = [];
    try {
      // @ts-ignore — recentFileTracker is internal
      const tracker = this.app.workspace.recentFileTracker;
      if (tracker && Array.isArray(tracker.lastOpenFiles)) {
        recentFiles = (tracker.lastOpenFiles as string[]).slice(0, 5);
      }
    } catch {
      // Ignore – feature is best-effort.
    }

    // Active view type
    const activeView = activeLeaf?.getViewState().type ?? null;

    // Cursor & selection (only available in a MarkdownView)
    let cursorPosition: CursorPosition | null = null;
    let selection: string | null = null;
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (mdView) {
      const editor = mdView.editor;
      const cursor = editor.getCursor();
      cursorPosition = { line: cursor.line, ch: cursor.ch };
      const sel = editor.getSelection();
      if (sel.length > 0) {
        selection = sel;
      }
    }

    return {
      activeFile: activeFileInfo,
      openTabs,
      recentFiles,
      activeView,
      cursorPosition,
      selection,
    };
  }

  // -----------------------------------------------------------------------
  // 2. getCurrentNoteContext
  // -----------------------------------------------------------------------

  /**
   * Returns rich metadata and content for the currently active note.
   * Returns `null` when no file is open.
   */
  async getCurrentNoteContext(): Promise<NoteContext | null> {
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;

    const content = await this.app.vault.read(file);
    const cache: CachedMetadata | null =
      this.app.metadataCache.getFileCache(file);

    // --- Tags (inline + frontmatter, deduplicated) ---
    const tagSet = new Set<string>();
    if (cache?.tags) {
      for (const t of cache.tags) {
        tagSet.add(t.tag);
      }
    }
    if (cache?.frontmatter?.tags) {
      const fmTags = Array.isArray(cache.frontmatter.tags)
        ? cache.frontmatter.tags
        : [cache.frontmatter.tags];
      for (const t of fmTags) {
        tagSet.add(String(t).startsWith("#") ? String(t) : `#${t}`);
      }
    }

    // --- Outgoing links ---
    const outgoingLinks = cache?.links?.map((l) => l.link) ?? [];

    // --- Backlinks ---
    let backlinks: string[] = [];
    try {
      // @ts-ignore — getBacklinksForFile exists but is not in public types
      const blData = this.app.metadataCache.getBacklinksForFile(file);
      if (blData?.data) {
        backlinks = Object.keys(blData.data);
      }
    } catch {
      // Graceful fallback
    }

    // --- Frontmatter (exclude position & tags, already handled) ---
    const frontmatter: Record<string, unknown> = {};
    if (cache?.frontmatter) {
      for (const [key, value] of Object.entries(cache.frontmatter)) {
        if (key !== "position" && key !== "tags" && value !== undefined) {
          frontmatter[key] = value;
        }
      }
    }

    // --- Headings ---
    const headings: HeadingInfo[] =
      cache?.headings?.map((h) => ({
        heading: h.heading,
        level: h.level,
      })) ?? [];

    // --- Word count ---
    const wordCount = content
      .replace(/^---[\s\S]*?---/, "") // strip frontmatter block
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    return {
      path: file.path,
      name: file.basename,
      extension: file.extension,
      content,
      tags: [...tagSet],
      outgoingLinks,
      backlinks,
      frontmatter,
      headings,
      wordCount,
    };
  }

  // -----------------------------------------------------------------------
  // 3. getLinkedNotesContext
  // -----------------------------------------------------------------------

  /**
   * Returns formatted context strings for notes linked from `file`.
   * Useful for expanding one-hop context around the active note.
   */
  async getLinkedNotesContext(
    file: TFile,
    maxNotes = 5,
  ): Promise<string[]> {
    const cache = this.app.metadataCache.getFileCache(file);
    const linkedPaths = cache?.links?.map((l) => l.link) ?? [];
    const contexts: string[] = [];

    for (const linkPath of linkedPaths.slice(0, maxNotes)) {
      const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
        linkPath,
        file.path,
      );
      if (!(linkedFile instanceof TFile)) continue;

      const content = await this.app.vault.cachedRead(linkedFile);
      contexts.push(
        formatContext("linked-note", linkedFile.basename, {
          File: linkedFile.path,
          "Linked from": file.path,
        }, content.slice(0, 2000)),
      );
    }

    return contexts;
  }

  // -----------------------------------------------------------------------
  // 4. getOpenTabsContext
  // -----------------------------------------------------------------------

  /**
   * Returns a human-readable formatted string describing all open tabs
   * in the workspace.
   */
  getOpenTabsContext(): string {
    const state = this.getWorkspaceState();
    if (state.openTabs.length === 0) {
      return "No tabs are currently open.";
    }

    const lines = state.openTabs.map((tab) => {
      const marker = tab.isActive ? "(active) " : "";
      const name = tab.filePath ?? "(no file)";
      return `- ${marker}[${tab.viewType}] ${name}`;
    });

    return `Open tabs (${state.openTabs.length}):\n${lines.join("\n")}`;
  }

  // -----------------------------------------------------------------------
  // 5. formatWorkspaceContext
  // -----------------------------------------------------------------------

  /**
   * Combines workspace state, current note context, and open tabs into a
   * single formatted context string suitable for injection into AI prompts.
   * Uses XML-like tags for structured parsing.
   */
  async formatWorkspaceContext(): Promise<string> {
    const parts: string[] = [];

    // Workspace state
    const ws = this.getWorkspaceState();
    const wsMetadata: Record<string, string> = {};
    if (ws.activeFile) {
      wsMetadata["ActiveFile"] = ws.activeFile.path;
    }
    if (ws.activeView) {
      wsMetadata["ActiveView"] = ws.activeView;
    }
    if (ws.cursorPosition) {
      wsMetadata["Cursor"] = `line ${ws.cursorPosition.line + 1}, col ${ws.cursorPosition.ch + 1}`;
    }
    if (ws.selection) {
      wsMetadata["Selection"] = ws.selection.length > 200
        ? ws.selection.slice(0, 200) + "..."
        : ws.selection;
    }
    if (ws.recentFiles.length > 0) {
      wsMetadata["RecentFiles"] = ws.recentFiles.join(", ");
    }

    parts.push(
      formatContext(
        "workspace-state",
        "Obsidian Workspace",
        wsMetadata,
        this.getOpenTabsContext(),
      ),
    );

    // Current note
    const note = await this.getCurrentNoteContext();
    if (note) {
      const noteMetadata: Record<string, string> = {
        File: note.path,
        Name: note.name,
        Extension: note.extension,
        WordCount: String(note.wordCount),
      };
      if (note.tags.length > 0) {
        noteMetadata["Tags"] = note.tags.join(", ");
      }
      if (note.outgoingLinks.length > 0) {
        noteMetadata["OutgoingLinks"] = note.outgoingLinks
          .map((l) => `[[${l}]]`)
          .join(", ");
      }
      if (note.backlinks.length > 0) {
        noteMetadata["Backlinks"] = note.backlinks
          .map((l) => `[[${l}]]`)
          .join(", ");
      }
      if (note.headings.length > 0) {
        noteMetadata["Headings"] = note.headings
          .map((h) => `${"#".repeat(h.level)} ${h.heading}`)
          .join(" | ");
      }
      for (const [key, value] of Object.entries(note.frontmatter)) {
        noteMetadata[`FM:${key}`] = String(value);
      }

      parts.push(
        formatContext("current-note", note.name, noteMetadata, note.content),
      );
    }

    return parts.join("\n\n");
  }

  // -----------------------------------------------------------------------
  // 6. formatMinimalContext
  // -----------------------------------------------------------------------

  /**
   * Returns a lightweight context string with just links and titles —
   * no full note content. Suitable for always-on context injection.
   */
  async formatMinimalContext(): Promise<string> {
    const ws = this.getWorkspaceState();
    const parts: string[] = [];

    // Active file
    if (ws.activeFile) {
      parts.push(`Active Note: ${ws.activeFile.name} (${ws.activeFile.path})`);
    }

    // Open tabs - just titles
    const tabs = ws.openTabs
      .filter((t) => t.filePath)
      .map((t) => t.fileName || t.filePath || "")
      .filter(Boolean);
    if (tabs.length > 0) {
      parts.push(`Open Notes: ${tabs.join(", ")}`);
    }

    // Current note links only (no content)
    const file = this.app.workspace.getActiveFile();
    if (file) {
      const cache = this.app.metadataCache.getFileCache(file);
      const links = cache?.links?.map((l) => `[[${l.link}]]`) ?? [];
      if (links.length > 0) {
        parts.push(`Outgoing Links: ${links.join(", ")}`);
      }

      // Backlinks
      let backlinks: string[] = [];
      try {
        // @ts-ignore
        const blData = this.app.metadataCache.getBacklinksForFile(file);
        if (blData?.data) backlinks = Object.keys(blData.data);
      } catch {
        // Graceful fallback
      }
      if (backlinks.length > 0) {
        parts.push(`Backlinks: ${backlinks.map((b) => `[[${b}]]`).join(", ")}`);
      }

      // Tags
      const tagSet = new Set<string>();
      if (cache?.tags) cache.tags.forEach((t) => tagSet.add(t.tag));
      if (cache?.frontmatter?.tags) {
        const fmTags = Array.isArray(cache.frontmatter.tags)
          ? cache.frontmatter.tags
          : [cache.frontmatter.tags];
        fmTags.forEach((t) =>
          tagSet.add(String(t).startsWith("#") ? String(t) : `#${t}`),
        );
      }
      if (tagSet.size > 0) {
        parts.push(`Tags: ${[...tagSet].join(", ")}`);
      }
    }

    if (parts.length === 0) return "";

    // Wrap with instruction and terminology mapping
    return [
      "[Obsidian Workspace Context — DO NOT act on this context unless the user explicitly asks about these notes.",
      "This is background metadata only. If the user's question is unrelated (e.g. math, coding, general questions), answer normally and completely ignore this context.",
      "Terminology: \"active note\" / \"current page\" = the note the user is viewing; \"open notes\" / \"open tabs\" / \"opened pages\" = notes open in Obsidian.]",
      ...parts,
    ].join("\n");
  }

  // -----------------------------------------------------------------------
  // 7. onActiveFileChange
  // -----------------------------------------------------------------------

  /**
   * Registers a callback that fires whenever the active file changes.
   * Returns an unsubscribe function.
   */
  onActiveFileChange(callback: (file: TFile | null) => void): () => void {
    const ref: EventRef = this.app.workspace.on(
      "active-leaf-change",
      () => {
        const file = this.app.workspace.getActiveFile();
        callback(file);
      },
    );

    return () => {
      this.app.workspace.offref(ref);
    };
  }

  // -----------------------------------------------------------------------
  // 8. onFileModified
  // -----------------------------------------------------------------------

  /**
   * Registers a callback that fires whenever a vault file is modified.
   * Returns an unsubscribe function.
   */
  onFileModified(callback: (file: TFile) => void): () => void {
    const ref: EventRef = this.app.vault.on("modify", (abstractFile) => {
      if (abstractFile instanceof TFile) {
        callback(abstractFile);
      }
    });

    return () => {
      this.app.vault.offref(ref);
    };
  }
}
