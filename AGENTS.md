# AGENTS.md

## What this repo is

OpenCode Hub — a multi-platform client ecosystem that connects to OpenCode Server instances via REST API + SSE. It manages workspace processes and provides AI chat UIs for browser, desktop, and Obsidian.

## Monorepo structure

```
packages/protocol    — shared TypeScript types (capabilities, context, discovery, events)
packages/client      — zero-dep TS SDK wrapping OpenCode Server REST API + SSE
apps/browser-extension — Chrome extension (React 19, Vite, CRXJS, Tailwind v4, Zustand)
apps/desktop         — macOS menu bar app (Tauri v2 + React 19, Vite, Tailwind v4)
apps/obsidian-plugin — Obsidian plugin (esbuild, no framework, DOM-based UI)
```

`packages/opencode-plugin-obsidian` — empty/orphan directory, not in workspace. Ignore it.

### Dependency graph

`protocol` has no deps. `client` depends on `protocol`. All three apps depend on both `client` and `protocol`. Turbo's `build` task uses `dependsOn: ["^build"]`, so **protocol must build before client, and both must build before any app**.

## Commands

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Build all | `pnpm build` (runs `turbo run build`) |
| Build one package | `pnpm --filter @opencode-hub/protocol build` |
| Typecheck all | `pnpm typecheck` |
| Typecheck one | `pnpm --filter @opencode-hub/client typecheck` |
| Dev (all) | `pnpm dev` |
| Clean | `pnpm clean` |

There is **no test suite, no linter, and no formatter** configured in this repo. Verification is `pnpm typecheck`.

## Build specifics by app

- **browser-extension**: `tsc && vite build` via `@crxjs/vite-plugin`. Output is a Chrome extension in `dist/`. Manifest is `apps/browser-extension/manifest.json` (Manifest V3).
- **desktop**: `tsc && vite build` for the frontend. The Rust/Tauri backend is in `apps/desktop/src-tauri/`. Running `pnpm tauri dev` from `apps/desktop/` starts the full Tauri dev cycle (Vite on port 1420 + Rust compilation). Requires **Rust toolchain** and Tauri v2 CLI.
- **obsidian-plugin**: Uses **esbuild** (not Vite) for production. Bundles to `dist/main.js` as CJS. `obsidian` and `electron` are externals. A separate `dev/vite.config.ts` provides a browser preview harness with Obsidian API mocks on port 5199.

## Key architecture details

- **Discovery protocol**: All clients find workspaces via `~/.opencode-hub/discovery.json`. The desktop app's Rust backend (`workspace.rs`) writes this file. Clients read it to get `{port, status, password}` per workspace.
- **OpenCode Server communication**: Clients talk to OpenCode Server (a separate Go process) via HTTP REST + SSE on `http://127.0.0.1:{port}`. Auth is optional HTTP Basic. The SDK default port is 4096.
- **Desktop starts server processes**: `WorkspaceManager` in Rust spawns `opencode serve --port N --cors *` as child processes and manages their lifecycle. Workspaces are persisted as JSON in `~/.opencode-hub/workspaces/`.
- **Obsidian uses `requestUrl`**: The Obsidian plugin wraps Obsidian's `requestUrl` as a fetch shim (`obsidianFetch` in `main.ts`) to bypass CORS in Electron. SSE uses a custom `EventSubscriber` from the client SDK.
- **Vault context injection**: The Obsidian plugin silently injects workspace context (active file, open tabs, links, tags) into OpenCode sessions via `injectContext()` — a user message with `noReply: true`.

## TypeScript conventions

- All packages use `"type": "module"` (ESM).
- Base tsconfig: `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `strict: true`, `composite: true`.
- Obsidian plugin overrides: `composite: false`, `declaration: false` (esbuild handles bundling, not tsc project references).
- Import paths use `.js` extensions (e.g., `from "./api.js"`) per ESM convention.

## Gotchas

- The obsidian plugin's `sidebar-view.ts` is a 3600+ line single file containing all UI, CSS (as a template literal), message parsing, SSE handling, and polling logic. Changes here require careful attention to the interleaved concerns.
- `packages/client/src/types.ts` defines the SDK types but OpenCode Server's actual response format sometimes diverges (e.g., `time.updated` as epoch number vs `updatedAt` as ISO string). The plugin handles both — see `parseSessionTime()`.
- No CI/CD pipelines exist in this repo.
