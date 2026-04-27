# Obsidian Plugin UI/UX Improvement Progress

Tracking UI/UX pain points, improvement plans, and implementation status for `apps/obsidian-plugin`.

---

## P0 — Critical Gaps

### 1. Stop/Abort Button Missing

- **Status**: `[x] Done`
- **Problem**: When the AI is responding, the submit button shows a spinner and is disabled. There is no way to abort a long-running response.
- **Location**: `sidebar-view.ts` — `setWaiting()` (line ~3161), `buildDockTray()` (line ~2767)
- **API available**: `OpenCodeClient.abortSession(id)` in `packages/client/src/api.ts:176`
- **Estimated effort**: ~58 lines changed in a single file. No SDK changes needed.

#### Implementation Plan

**Approach**: Repurpose the existing submit button to act as a stop button while `waiting === true`. Show a square stop icon (Lucide `"square"`) instead of spinner, keep button enabled.

**State transitions**:

| State | Button Icon | Enabled | Click Action | Escape Key |
|-------|-----------|---------|-------------|------------|
| Idle | `arrow-up` | Yes | `handleSend()` | Close popover |
| Waiting (AI responding) | `square` (stop) | Yes | `handleAbort()` | `handleAbort()` |
| Aborting (in-flight) | spinner | No | No-op | No-op |
| Question pending | spinner | No | No-op | No-op |

**Code changes** (all in `sidebar-view.ts`):

1. **Add state field** (line ~1232): `private aborting = false;`
2. **Modify `setWaiting()`** (line ~3161): Three-state button logic — stop icon when waiting, spinner when aborting/question, arrow-up when idle
3. **Change click handler** in `buildDockTray()` (line ~2772): Dispatch to `handleAbort()` when `waiting && !_pendingQuestion`, else `handleSend()`
4. **New `handleAbort()` method** (after line ~3159):
   - Guard against double-click via `aborting` flag
   - Show spinner while abort request is in-flight
   - Call `this.plugin.client.abortSession(this.plugin.currentSessionId)`
   - Server emits `session.status → idle` via SSE, which naturally triggers `clearStreamingState()` + `setWaiting(false)` in existing `handleSSEEvent()`
   - Safety timeout at 3s force-resets if SSE never fires
   - On failure: reset to stop icon so user can retry
5. **Add Escape shortcut** (line ~2514): Trigger abort when `waiting && !_pendingQuestion && !aborting`
6. **CSS tweak** (line ~984): Change disabled cursor from `not-allowed` to `wait`

**Edge cases handled**: double-click (aborting flag), abort failure (retry), abort during streaming (clearStreamingState), SSE timeout (3s safety), session switch during abort (onSessionChanged resets), view closed during abort (harmless orphan).

---

### 2. @mention Does Not Inject File Content

- **Status**: `[x] Done`
- **Problem**: `@filename` pills are visual-only. Sent messages contain plain text `@filename` with no file content attached.
- **Location**: `sidebar-view.ts` — `insertPill()` (line ~2602), `handleSend()` (line ~3104), `getEditorText()` (line ~2555)
- **Estimated effort**: ~120 lines added/changed in `sidebar-view.ts`. No SDK changes.

#### Implementation Plan

**Approach**: Resolve file content at send time (not at pill insertion time), prepend as synthetic `<file>` XML-wrapped text parts before the user's message.

**Message format** (using existing `synthetic: true` mechanism):
```
parts = [
  { type: "text", text: "<file path=\"src/utils/helper.ts\">\n...content...\n</file>", synthetic: true },
  { type: "text", text: "Can you refactor @src/utils/helper.ts to use..." },
]
```

**Code changes** (all in `sidebar-view.ts`):

1. **Fix `insertPill()` signature** (line ~2602): Add `refPath?: string` parameter. Store `pill.dataset.ref = refPath ?? label`. Currently open-tab pills store basename but search-result pills store full path — must normalize to always use full path.
2. **Fix call sites**:
   - Open tab action (line ~2989): Pass `tab.filePath!` as 3rd arg
   - Search result action (line ~3009): Pass `filePath` as ref
3. **New `extractFilePills()` method** (near line ~2578): Walk editor DOM, collect `{ref, type}` from pill `data-*` attributes, deduplicate by `ref`.
4. **New `resolveFileContent()` method**: Vault-first, workspace-fallback resolution:
   - Vault files: `app.vault.getAbstractFileByPath(ref)` → `app.vault.read(file)`
   - Workspace files: `client.readFile(ref)` → server API `GET /file/content?path=ref`
   - Binary detection via extension set (`png, jpg, pdf, zip, exe, ...`)
   - Returns `{content, source}` or `{binary: true}` or `null`
5. **Add constants**: `MAX_FILE_CHARS = 50_000`, `BINARY_EXTENSIONS` set, `truncateContent()` helper
6. **Modify `handleSend()`** (line ~3104):
   - Call `extractFilePills()` **before** `clearEditor()` (editor DOM destroyed on clear)
   - Resolve all file contents in parallel via `Promise.allSettled()`
   - Build synthetic `<file>` parts for each resolved file
   - Prepend file parts before user text parts in the `parts` array
   - Show `Notice` for truncated files, "not found" placeholder for missing files

**Edge cases**: Large files (50k char truncation + notice), binary files (skip with placeholder), missing files (not-found XML placeholder), duplicate mentions (deduplicate), vault vs workspace files (vault-first resolution), no pills (no regression).

---

## P1 — Important Improvements

### 3. No Connection Status in Sidebar

- **Status**: `[x] Done`
- **Problem**: No visual indicator of connection state. Empty state shows "Start a conversation" with no connect button.
- **Location**: `sidebar-view.ts` — `buildHeader()` (line ~1346), `renderEmptyState()` (line ~1822)
- **Estimated effort**: ~80 lines added/changed across `sidebar-view.ts`.

#### Implementation Plan

**Code changes**:

1. **Header status dot**: Add `statusDotEl` before the title in `buildHeader()`. 8px circle, green when connected (`var(--text-success)`), red when disconnected (`var(--text-error)`).
2. **Wire live updates**: Register as connection listener in `onOpen()` via `plugin.onConnectionChange()` (mechanism exists at `main.ts:352` but sidebar never registers). Unsubscribe in `onClose()`. Extend `onConnectionChanged()` to call `updateStatusDot()` and `renderChat()`.
3. **Connection-aware empty state**: When disconnected, show "Not connected" title + "Connect" button + "Switch workspace..." button (if workspaces exist in discovery). When connected, show current "Start a conversation" message.
4. **Click-to-connect on dot**: When disconnected, clicking dot triggers `plugin.connect()`. When connected, show Obsidian `Menu` with "Disconnect" and "Switch workspace..." options. Requires importing `Menu` from `obsidian`.

---

### 4. No Message Regeneration

- **Status**: `[x] Done`
- **Problem**: No way to regenerate AI responses or edit sent messages.
- **Location**: `sidebar-view.ts` — `renderAssistantMessage()` (line ~1881), `renderUserMessage()` (line ~1828)
- **Estimated effort**: ~80 lines added/changed.

#### Implementation Plan

**Code changes**:

1. **"Regenerate" button on assistant messages**: Add `refresh-cw` icon button in `och-msg-actions` after the copy button. Reuse existing button pattern.
2. **New `handleRegenerate(msg)` method**: Find the preceding user message, call `forkSession(sessionId, userMsg.id)` to create a clean branch, switch to the forked session, then resend the same user content. Preserves original conversation; user can switch back via session history dropdown.
3. **"Edit" button on user messages**: Add `pencil` icon button. On click, populate the composer with the original message text, store `_editingMessageId`. On next `handleSend()`, pass `messageID` in the body to branch from that point.
4. **API**: Uses existing `forkSession()` and `sendMessageAsync()` — no SDK changes.

**Edge cases**: Regenerating while streaming (guarded by `waiting` flag), regenerating the only message (works with fork), mid-conversation regeneration (creates branch preserving original), messages with image attachments (text-only for v1).

---

### 5. Debug console.log Left in Production Code

- **Status**: `[x] Done`
- **Problem**: `sidebar-view.ts:3358` logs `[OCH-TOOL-NAMES]` on every message parse. Explicitly temporary per comment on line 3352.
- **Estimated effort**: Delete 7 lines.

#### Implementation Plan

**Remove lines 3352-3358** (the `allToolNames` variable, eslint-disable comment, and console.log). These have zero side effects — the variable is only used by the log statement. The actual tool filtering uses independent code on lines 3360-3363.

**Other logs in the plugin** (keep all):
- `main.ts:295` — `console.log("[OpenCode Hub] SSE connected")` — operational logging
- `main.ts:297` — `console.warn("[OpenCode Hub] SSE disconnected...")` — recoverable error
- `main.ts:301` — `console.error("[OpenCode Hub] SSE error:...")` — error logging

---

## P2 — Usability Polish

### 6. Vault Context Injection Is Invisible

- **Status**: `[ ] Not Started` (deferred — requires settings.ts changes)
- **Problem**: Silent context injection with no visibility, no toggle, no failure feedback.
- **Location**: `sidebar-view.ts` — `handleSend()` (line ~3141), `main.ts` — `injectVaultContext()` (line ~646)
- **Estimated effort**: ~100 lines across `sidebar-view.ts` and `settings.ts`.

#### Implementation Plan

1. **Settings toggle**: Add `autoInjectContext: boolean` to `OpenCodeHubSettings` (default `true`). Add toggle in settings tab under "Context" heading.
2. **Context strip toggle chip**: Add a leading "Context" chip with zap icon in `refreshContextStrip()`. Clicking toggles `autoInjectContext` and persists. When off, file chips are dimmed (`.och-context-chip--disabled { opacity: 0.4 }`).
3. **Injection gate**: Add `&& this.plugin.settings.autoInjectContext` check at `sidebar-view.ts:3144`.
4. **Visual feedback**: Flash animation on context strip when injection occurs (`och-context-flash` keyframe, 0.8s ease-out).
5. **Preview panel**: Eye icon on toggle chip opens an expandable `<pre>` panel between context strip and attachments, showing the output of `formatMinimalContext()`. Closes on click or when injection is disabled.

---

### 7. Session Delete Has No Confirmation

- **Status**: `[x] Done`
- **Problem**: Instant delete on X click with no confirmation.
- **Location**: `sidebar-view.ts` — `renderSessionDropdown()` (line ~1461)
- **Estimated effort**: ~40 lines changed.

#### Implementation Plan

**Approach**: Inline confirmation (not modal). Replace the session item content with "Delete this session? [Delete] [Cancel]". Auto-reverts after 3 seconds if no action.

**Code changes**: Replace the `delBtn` click handler in `renderSessionDropdown()`. On click:
1. Guard: `if (item.querySelector(".och-confirm-overlay")) return;` (prevent double-click)
2. Hide existing children with `style.display = "none"` (preserve event listeners)
3. Append `.och-confirm-overlay` div with text + Delete (red) + Cancel buttons
4. Delete button calls `this.deleteSession(session.id)`
5. Cancel button or 3s timeout reverts (remove overlay, unhide children)
6. Add `overlay.addEventListener("click", e => e.stopPropagation())` to prevent session switch

---

### 8. Code Blocks Lack Copy Button

- **Status**: `[x] Done`
- **Problem**: Rendered code blocks have no copy button.
- **Location**: `sidebar-view.ts` — `renderAssistantMessage()` (line ~1900)
- **Estimated effort**: ~50 lines added.

#### Implementation Plan

**Approach**: Post-render DOM walk (not MutationObserver). `MarkdownRenderer.render()` is synchronous.

1. **New `addCodeCopyButtons(container)` method**: `querySelectorAll("pre > code")`, skip if button already exists (idempotent), add absolute-positioned button at top-right of `<pre>`.
2. **Call after every render**: After `MarkdownRenderer.render()` in `renderAssistantMessage()` (line ~1901) and `renderReasoning()` (line ~1984).
3. **CSS**: `<pre>` gets `position: relative`. Button is `position: absolute; top: 6px; right: 6px;`, hidden by default (`opacity: 0`), visible on `pre:hover`. Uses `copy` → `check` icon swap with `--copied` class for persistent visibility during feedback.

---

### 9. Hardcoded Colors Break Custom Themes

- **Status**: `[x] Done`
- **Problem**: Several CSS rules use hardcoded colors without Obsidian CSS variables.
- **Estimated effort**: ~10 lines changed.

#### Implementation Plan

**Must fix** (hardcoded with no `var()` wrapper):

| Line | Current | Replacement |
|------|---------|-------------|
| 555 | `color: #22c55e;` | `color: var(--text-success, #22c55e);` |
| 556 | `color: #ef4444;` | `color: var(--text-error, #ef4444);` |
| 776 | `background: rgba(239,68,68,0.08);` | `background: var(--och-error-bg);` |
| 777 | `border: 1px solid rgba(239,68,68,0.25);` | `border: 1px solid var(--och-error-border);` |
| 963 | `background: rgba(230,167,0,0.1);` | `background: var(--och-warning-bg);` |
| settings.ts:63 | `#22c55e` / `#ef4444` | `var(--text-success, #22c55e)` / `var(--text-error, #ef4444)` |

**Derived colors** — define once on `.opencode-hub-sidebar` root using `color-mix()` (supported in Obsidian's Chromium 114+):
```css
--och-error-bg: color-mix(in srgb, var(--text-error, #ef4444) 8%, transparent);
--och-error-border: color-mix(in srgb, var(--text-error, #ef4444) 25%, transparent);
--och-warning-bg: color-mix(in srgb, var(--text-warning, #e6a700) 10%, transparent);
```

**Already correct** (no change needed): Lines 256, 656, 659, 695, 778, 845, 846, 895, 959, 962 — all use `var()` with fallback.

**Intentionally hardcoded** (no change needed): Lines 349, 359 — white translucent inside accent-colored bubble.

**Box-shadows** (no change needed): Lines 189, 798, 1070, 1145 — `rgba(0,0,0,0.1x)` shadows are universally dark.

---

## P3 — Architecture & Performance

### 10. Streaming Markdown Re-renders Entire Content on Each Delta

- **Status**: `[x] Done` (Phase 1: 300ms debounce)
- **Problem**: `renderStreamingContent()` calls `MarkdownRenderer.render()` on full accumulated text on every SSE delta.
- **Location**: `sidebar-view.ts` — `renderStreamingContent()` (line ~2357)
- **Estimated effort**: ~20 lines changed.

#### Implementation Plan

**Phase 1 (recommended): Debounce-only**

Add render throttle so `MarkdownRenderer.render()` runs at most every 300ms:
- New fields: `_streamingRenderTimer`, `_streamingDirty`
- In `handleSSEEvent` delta handler: set `_streamingDirty = true`, call `scheduleStreamingRender()` instead of direct `renderStreamingContent()`
- `scheduleStreamingRender()`: if no timer active, schedule 300ms timeout to call `renderStreamingContent()` and clear dirty flag
- In `clearStreamingState()`: flush pending timer, do final render before cleanup

Expected: ~10x fewer DOM rebuilds during fast streaming (50 deltas/sec → 3 renders/sec).

**Phase 2 (optional): Raw text during streaming**

Show `_streamingText` as plain `textContent` during active deltas. Switch to `MarkdownRenderer.render()` only after 500ms pause or `session.status: idle`. Tradeoff: users see unstyled text during fast streaming, then it pops into formatted markdown.

**Fallback**: `requestAnimationFrame` gate — limit to ~60fps with zero timer management.

---

### 11. sidebar-view.ts Is a 3600+ Line God Object

- **Status**: `[ ] Not Started`
- **Problem**: Single file contains CSS, DOM, parsing, SSE, polling, popovers, and all business logic.
- **Location**: `sidebar-view.ts` (3656 lines)

#### Implementation Plan

**Proposed module breakdown**:
```
src/sidebar/
  types.ts           — ParsedMessage, ToolPart, PendingAttachment, PopoverItem (~50 lines)
  styles.ts          — STYLES constant + ensureStyles() (~1140 lines)
  message-parser.ts  — parseMessages(), parseToolPart(), helpers (~200 lines)
  chat-renderer.ts   — renderUserMessage(), renderAssistantMessage(), tool groups (~500 lines)
  composer.ts        — editor, pills, history, attachments, dock tray (~490 lines)
  popover-manager.ts — slash/mention popovers, rendering (~200 lines)
  streaming.ts       — streaming render, clear state (~80 lines)
  polling.ts         — start/stop polling, poll(), throttledPoll() (~130 lines)
  sse-handler.ts     — handleSSEEvent(), handleQuestionAsked() (~100 lines)
```

**Extraction order** (least to most coupled):
1. `types.ts` — zero risk, pure type moves
2. `styles.ts` — zero risk, static string + function
3. `message-parser.ts` — low risk, pure functions
4. `chat-renderer.ts` — medium risk, needs App/plugin context as params
5. `composer.ts` — medium risk, many DOM ref dependencies
6. `popover-manager.ts` — medium risk, fuzzy search + API calls
7. `streaming.ts` + `polling.ts` + `sse-handler.ts` — highest risk, deeply coupled to state

**Pattern**: Extract as standalone functions taking explicit context params (not classes). Keeps `SidebarView` as the orchestrator holding state and DOM refs.

**Build system**: esbuild bundles from `src/main.ts` and resolves all imports automatically. No config changes needed. `tsconfig.json` uses `moduleResolution: "bundler"` — standard ESM imports with `.js` extensions work.

**Verification**: `pnpm --filter @opencode-hub/obsidian-plugin typecheck` after each extraction.

---

### 12. CSS Embedded as Template Literal in TypeScript

- **Status**: `[ ] Not Started`
- **Problem**: ~1200 lines of CSS in a JS template literal. No IDE CSS support.
- **Location**: `sidebar-view.ts` lines ~73-1209

#### Implementation Plan

**Recommended: Extract to `.css` file, import as text via esbuild**

1. Create `src/sidebar/styles.css` — paste CSS content (no template literal delimiters)
2. Create `src/css.d.ts` — `declare module "*.css" { const content: string; export default content; }`
3. Create `src/sidebar/styles.ts` — `import STYLES from "./styles.css"; export function ensureStyles() { ... }`
4. Update `sidebar-view.ts` — replace `ensureStyles` / `STYLES` / `STYLE_ID` with import from `./sidebar/styles.js`
5. Update `package.json` build scripts — add `--loader:.css=text` to esbuild commands

**Why not esbuild CSS bundling** (separate output file): Obsidian plugins require a single `main.js` file. While Obsidian supports `styles.css` as a sidecar, the current `ensureStyles()` + `STYLE_ID` deduplication pattern is proven and handles edge cases (multiple sidebar leaves, view reopen). Importing as text preserves this pattern with zero runtime behavior change.

---

## Additional Issues (Noted, Unranked)

- **Placeholder text inconsistency**: "Ask about your notes...", "Message...", "Type your answer...", "Thinking..." used in different states with no unified pattern.
- **Image attachments not shown in sent messages**: After sending, user bubble only shows text, not the attached image preview.
- **No keyboard shortcut hints**: Sidebar lacks Cmd+K, Cmd+/ or other common shortcuts. No shortcut discovery UI.
- **Polling workaround for session title**: After completion, `poll()` schedules 3 extra refreshes at 3s/8s/15s to catch title updates — indicates SSE `session.updated` is unreliable.
- **Error messages accumulate in chat**: `showError()` appends error divs that never auto-dismiss.
