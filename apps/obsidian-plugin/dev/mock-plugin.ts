/**
 * Mock OpenCodeHubPlugin with fake data for testing sidebar-view.ts
 */

export interface MockSession {
  id: string;
  title: string;
  updatedAt: string;
}

export interface MockMessage {
  info: {
    id: string;
    role: "user" | "assistant";
    createdAt: string;
    agent?: string;
  };
  parts: Array<{
    type: string;
    text?: string;
    name?: string;
    tool?: string;
    input?: unknown;
    output?: string;
    status?: string;
    error?: boolean;
  }>;
}

// ── Fake data ──────────────────────────────────────────────

const SESSIONS: MockSession[] = [
  { id: "s1", title: "Obsidian Chat", updatedAt: new Date().toISOString() },
  { id: "s2", title: "Refactor vault-context.ts", updatedAt: new Date(Date.now() - 3600000).toISOString() },
  { id: "s3", title: "Debug CSS layout", updatedAt: new Date(Date.now() - 86400000).toISOString() },
];

const MESSAGES: MockMessage[] = [
  {
    info: { id: "m1", role: "user", createdAt: new Date(Date.now() - 120000).toISOString() },
    parts: [{ type: "text", text: "Explain how @vault-context.ts works and check @build agent" }],
  },
  {
    info: { id: "m2", role: "assistant", createdAt: new Date(Date.now() - 110000).toISOString(), agent: "build" },
    parts: [
      { type: "step-start" },
      { type: "tool-call", name: "Read", tool: "read", input: { filePath: "src/vault-context.ts" }, output: "// file contents...", status: "success" },
      { type: "tool-call", name: "Grep", tool: "grep", input: { pattern: "getWorkspaceState" }, output: "3 matches found", status: "success" },
      { type: "tool-call", name: "Glob", tool: "glob", input: { pattern: "src/**/*.ts" }, output: "4 files", status: "success" },
      { type: "tool-call", name: "Bash", tool: "bash", input: { command: "wc -l src/vault-context.ts" }, output: "245 src/vault-context.ts", status: "success" },
      { type: "tool-call", name: "Edit", tool: "edit", input: { filePath: "src/vault-context.ts", oldString: "foo", newString: "bar" }, output: "Applied", status: "success" },
      { type: "step-finish" },
      {
        type: "text",
        text: `The \`vault-context.ts\` file manages workspace state for the Obsidian plugin. Here's a breakdown:

## Key Components

1. **\`VaultContext\` class** — tracks active file, open tabs, recent files, and cursor position
2. **\`getWorkspaceState()\`** — returns a snapshot of current workspace state
3. **\`formatMinimalContext()\`** — generates a compact string with just links and titles

### Code Example

\`\`\`typescript
const ctx = new VaultContext(app);
const state = ctx.getWorkspaceState();
console.log(state.activeFile?.name);
\`\`\`

The **@build** agent is the primary agent used for code generation tasks.`,
      },
    ],
  },
  {
    info: { id: "m3", role: "user", createdAt: new Date(Date.now() - 60000).toISOString() },
    parts: [{ type: "text", text: "Can you fix the CSS layout issue in the sidebar?" }],
  },
  {
    info: { id: "m4", role: "assistant", createdAt: new Date(Date.now() - 50000).toISOString(), agent: "build" },
    parts: [
      { type: "tool-call", name: "Read", tool: "read", input: { filePath: "src/sidebar-view.ts" }, output: "...", status: "success" },
      { type: "tool-call", name: "Search", tool: "grep", input: { pattern: "och-dock-tray" }, output: "1 match", status: "success" },
      { type: "tool-call", name: "Bash", tool: "bash", input: { command: "npx tsc --noEmit" }, output: "No errors", status: "success" },
      {
        type: "text",
        text: "I've identified the issue. The dock tray items aren't using `display: flex` properly. Let me fix that.",
      },
    ],
  },
];

const AGENTS = [
  { id: "build", name: "build", description: "Primary agent for code generation", hidden: false },
  { id: "explore", name: "explore", description: "Fast codebase exploration", hidden: false },
  { id: "general", name: "general", description: "General-purpose tasks", hidden: false },
  { id: "plan", name: "plan", description: "Planning and task breakdown", hidden: false },
  { id: "title", name: "title", description: "Generate session titles", hidden: true },
  { id: "summary", name: "summary", description: "Summarize conversations", hidden: true },
];

const COMMANDS = [
  { id: "obsidian-cli", name: "obsidian-cli", description: "Interact with Obsidian vault via CLI", source: "skill" },
  { id: "zhao-read", name: "zhao-read", description: "Create reading reflections from articles", source: "skill" },
  { id: "zhao-track", name: "zhao-track", description: "Track learning progress and goals", source: "skill" },
  { id: "remotion-bp", name: "remotion-best-practices", description: "Best practices for Remotion video creation", source: "skill" },
  { id: "find-skills", name: "find-skills", description: "Discover and install agent skills", source: "system" },
  { id: "compact", name: "compact", description: "Compact conversation history", source: "builtin" },
];

// ── Mock plugin ────────────────────────────────────────────

export function createMockPlugin(): any {
  return {
    currentSessionId: "s1",
    currentAgent: null as string | null,
    currentVariant: null as string | null,

    selectedModel: { providerID: "google", modelID: "gemini-3-pro-preview" } as { providerID: string; modelID: string } | null,

    _modelInfo: {
      providerID: "google",
      modelID: "gemini-3-pro-preview",
      variants: ["default", "low", "medium", "high", "max"],
    },

    _allModels: [
      { providerID: "google", providerName: "Google", modelID: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", variants: ["default", "low", "medium", "high", "max"], isDefault: true },
      { providerID: "google", providerName: "Google", modelID: "gemini-2.5-flash", name: "Gemini 2.5 Flash", variants: ["default", "low", "medium", "high"], isDefault: false },
      { providerID: "anthropic", providerName: "Anthropic", modelID: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", variants: ["default", "low", "medium", "high", "max"], isDefault: true },
      { providerID: "anthropic", providerName: "Anthropic", modelID: "claude-haiku-3.5", name: "Claude Haiku 3.5", variants: [], isDefault: false },
      { providerID: "openai", providerName: "OpenAI", modelID: "o3", name: "o3", variants: ["default", "low", "medium", "high"], isDefault: true },
      { providerID: "openai", providerName: "OpenAI", modelID: "gpt-4.1", name: "GPT-4.1", variants: [], isDefault: false },
    ],

    client: {
      listSessions: async () => SESSIONS,
      createSession: async (opts: { title: string }) => {
        const s = { id: `s${Date.now()}`, title: opts.title, updatedAt: new Date().toISOString() };
        SESSIONS.unshift(s);
        return s;
      },
      deleteSession: async (id: string) => {
        const idx = SESSIONS.findIndex((s) => s.id === id);
        if (idx >= 0) SESSIONS.splice(idx, 1);
      },
      listMessages: async (_sessionId: string) => MESSAGES,
      sendMessageAsync: async (_sessionId: string, _body: unknown) => {
        console.log("[mock] sendMessageAsync", _body);
      },
    },

    vaultContext: {
      getWorkspaceState: () => ({
        activeFile: { name: "Go 语言八股.md", path: "Notes/Go 语言八股.md" },
        openTabs: [
          { filePath: "Notes/Go 语言八股.md", fileName: "Go 语言八股.md", isActive: true },
          { filePath: "Notes/Kubernetes Deep Dive.md", fileName: "Kubernetes Deep Dive.md", isActive: false },
          { filePath: "Projects/opencode-hub/README.md", fileName: "README.md", isActive: false },
        ],
        recentFiles: [],
        cursor: null,
        selection: null,
      }),
    },

    setAgent(name: string) {
      this.currentAgent = name || null;
    },

    setModel(providerID: string, modelID: string) {
      this.selectedModel = { providerID, modelID };
    },

    setVariant(variant: string | null) {
      this.currentVariant = variant;
    },

    async listAgents() {
      return AGENTS;
    },

    async listCommands() {
      return COMMANDS;
    },

    async searchFiles(query: string, _limit: number) {
      // Fake file search results
      const allFiles = [
        "src/main.ts",
        "src/sidebar-view.ts",
        "src/vault-context.ts",
        "src/settings.ts",
        "Notes/Go 语言八股.md",
        "Notes/Kubernetes Deep Dive.md",
        "Notes/React Patterns.md",
        "Projects/opencode-hub/README.md",
      ];
      return allFiles.filter((f) => f.toLowerCase().includes(query.toLowerCase()));
    },

    async injectVaultContext() {
      console.log("[mock] injectVaultContext");
    },
  };
}
