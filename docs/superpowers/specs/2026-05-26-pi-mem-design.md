---
title: pi-mem — Design Spec
status: Draft
date: 2026-05-26
author: Husni Adil Makmur <husni.adil@gmail.com>
---

# pi-mem — Design Spec

A pi extension package that bridges pi sessions to an existing `claude-mem` install so memory persists across pi and Claude Code on the same machine. Auto-inject context at session start, capture pi events as observations, expose `mem_search` to the agent — same UX as Claude Code, no UI changes needed in pi.

## 1. Compatibility & Fragility (LOAD-BEARING)

**Read this first.** pi-mem deliberately interoperates with `claude-mem` even though the claude-mem maintainer has declined to add first-class pi support. Concrete consequences:

- pi-mem uses `claude-mem`'s host adapter system by passing platform name `pi`. Because `pi` is not in the adapter switch, claude-mem routes to `rawAdapter` via `default: return rawAdapter` in `src/cli/adapters/index.ts:22`. This is a switch fallback, not a contracted public API.
- Any of these claude-mem changes break pi-mem with no notice:
  - Replacing `default: return rawAdapter` with `throw new Error('unsupported platform')`
  - Changing the stdin/stdout JSON shape of `worker-service.cjs hook <platform> <command>`
  - Renaming or moving `worker-service.cjs` / `bun-runner.js`
  - Changing the `/api/search` HTTP endpoint or query params
  - Changing the structure of `~/.claude-mem/settings.json`
- **Breakage is not a claude-mem bug.** It is a known risk of this design.
- Mitigation:
  - Pin against `claude-mem` 13.x. Test against the pinned minor on every pi-mem release.
  - Integration tests in CI must spawn a real `worker-service.cjs` and assert the contract.
  - On unexpected stdout shape: fail soft (skip the event, log warn), do not crash pi.
  - Version-detect at preflight; refuse to operate against `claude-mem` < 13.x.

## 2. Goals & Non-Goals

### Goals
- Mirror Claude Code's memory UX in pi: auto-inject context at session start (with TUI banner), capture user prompts and tool results, expose memory search to the agent.
- Self-contained npm package — zero runtime deps, no upstream PR required, no separate server to run.
- Use the **same** claude-mem corpus as Claude Code so observations are shared across hosts when working in the same folder.

### Non-Goals
- Replacing or proxying claude-mem's storage. pi-mem owns no SQLite/Postgres state.
- Adding new memory features (better search, semantic ranking, etc.) — pi-mem is a transport, not a memory engine.
- Supporting claude-mem `server-beta` mode (postgres + team API keys). pi-mem targets local single-user mode only.
- Multi-tenant deployment. pi-mem assumes one user, one machine, one claude-mem install.

## 3. Architecture

### 3.1 Components

```
@husniadil/pi-mem/
├── package.json                    # "pi": { "extensions": ["./src/index.ts"] }
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── LICENSE                         # MIT
├── .gitignore
├── src/
│   ├── index.ts                    # default export: function(pi) — wiring
│   ├── config.ts                   # pi-mem env-var parsing
│   ├── paths.ts                    # worker-service.cjs + bun-runner.js discovery
│   ├── port.ts                     # claude-mem worker port discovery
│   ├── worker.ts                   # subprocess invoker for hook commands
│   ├── search.ts                   # HTTP client for /api/search (mem_search only)
│   ├── session.ts                  # in-memory per-session state
│   ├── inject.ts                   # session_start fetch + before_agent_start re-inject
│   ├── capture.ts                  # message_end / tool_result / agent_end → spawn worker
│   ├── tool.ts                     # pi.registerTool({ name: 'mem_search', ... })
│   ├── preflight.ts                # file-existence + version sanity
│   ├── logger.ts                   # pi.logger wrapper with secret redaction
│   └── types.ts                    # shared types
└── tests/
    ├── unit/                       # vitest unit tests (mock spawn + fetch)
    └── integration/                # gated by file existence; real claude-mem worker
```

Each module has one responsibility. `worker.ts` and `search.ts` are the only modules that talk to claude-mem. `inject.ts`, `capture.ts`, `tool.ts` are pi-event handlers.

### 3.1.1 Platform name constant

pi-mem hardcodes the string `pi` as the platform name passed to `worker-service.cjs hook <platform> <command>`. Not configurable via env var. Rationale: identifying as `pi` lets observations be filtered by source in claude-mem; making it overridable invites users to fake other platforms and split corpora unintentionally. If a future scenario truly needs override, surface as `PI_MEM_PLATFORM_NAME` env var then; until then, constant.

### 3.2 Dependencies

- **Runtime**: zero. Only Node built-ins: `child_process`, `fs`, `path`, `os`, `crypto`.
- **Peer**: `@earendil-works/pi-coding-agent` (for `ExtensionAPI` types), `typebox` (for `mem_search` tool parameters schema — pi's `registerTool` contract requires TypeBox).
- **Dev**: `typescript`, `vitest`, `@types/node`.
- **Engines**: `node >= 22`.

No build step. pi loads `.ts` directly (matches `pi-mcp-adapter` pattern).

## 4. Data Flow

### 4.1 Session lifecycle

```
PI EVENT                  pi-mem ACTION                           SUBPROCESS / HTTP
────────────────────────────────────────────────────────────────────────────────────────
session_start       ─►   preflight()                       (file checks, no I/O)
                    ─►   worker.runStart()                 ─►   worker-service.cjs start
                    ─►   worker.runHook('pi', 'context',   ─►   worker-service.cjs hook pi context
                          {sessionId, cwd})                      stdin:  {sessionId, cwd}
                                                                 stdout: {hookSpecificOutput:{
                                                                           hookEventName,
                                                                           additionalContext},
                                                                          systemMessage?}
                    ─►   state.ctxMarkdown ← additionalContext
                    ─►   if (systemMessage) ctx.ui.notify(systemMessage, "info")

before_agent_start  ─►   if (!state.enabled || !state.ctxMarkdown) return
(EVERY turn)        ─►   return {systemPrompt:
                            event.systemPrompt +
                            "\n\n<claude-mem-context>\n" +
                            state.ctxMarkdown +
                            "\n</claude-mem-context>"}

message_end         ─►   if (event.message.role !== 'user') return
                    ─►   worker.runHookFireAndForget(      ─►   worker-service.cjs hook pi session-init
                          'pi', 'session-init',                  stdin: {sessionId, cwd, prompt}
                          {sessionId, cwd, prompt})

tool_result         ─►   worker.runHookFireAndForget(      ─►   worker-service.cjs hook pi observation
                          'pi', 'observation',                   stdin: {sessionId, cwd, toolName,
                          {sessionId, cwd, toolName,                     toolInput, toolResponse}
                           toolInput, toolResponse})

agent_end           ─►   worker.runHookFireAndForget(      ─►   worker-service.cjs hook pi summarize
                          'pi', 'summarize',                     stdin: {sessionId, cwd}
                          {sessionId, cwd})

session_shutdown    ─►   no-op (worker daemon is shared with Claude Code instances)

LLM calls mem_search({query, limit?}):
                    ─►   search.httpGet(                   ─►   GET http://127.0.0.1:<port>/api/search?query=...&limit=N
                          query, limit)                          no auth
                                                                 response: {content:[{type,text}]}
                                                                 (MCP content-block, pre-formatted markdown)
                    ─►   extractMarkdown(res.content) → text
                    ─►   return text verbatim to LLM (claude-mem owns formatting)
```

### 4.2 Per-session in-memory state

```ts
type SessionState = {
  enabled:      boolean;   // false after preflight failure → all handlers no-op
  sessionId:    string;    // externalized id derived from pi session id
  rootPath:     string;    // realpath(ctx.cwd) — pi's canonical session cwd
  ctxMarkdown:  string;    // cached additionalContext; empty string = no inject
};
```

State per-extension-load. pi loads extensions per session (verify in implementation; if not, key state by pi session id).

### 4.3 The "re-inject every turn" invariant (DO NOT OPTIMIZE)

pi resets `systemPrompt` to `_baseSystemPrompt` on every `before_agent_start` if the handler returns no `systemPrompt` field — see `packages/coding-agent/src/core/agent-session.ts:1095-1099`. Therefore pi-mem must return the same `{ systemPrompt: base + ctxMarkdown }` on **every** `before_agent_start`, not just the first.

**Implementing-self warning:** Do not add an `injected: boolean` guard that skips re-injection on turns 2+. That would silently drop memory after turn 1 with no test failure unless a turn-2 inject is asserted. If you find yourself "optimizing this" — stop. Run the multi-turn integration test first.

Because the content is identical across turns, the LLM provider's prompt cache stays warm. This is a deliberate design choice: predictable cache behavior > dynamic refresh.

### 4.4 Fire-and-forget subprocess hygiene

All capture handlers (`message_end`, `tool_result`, `agent_end`) spawn `worker-service.cjs hook pi <cmd>` with `child.unref()` immediately after spawn. Without `unref()`, pi cannot exit until the subprocess completes, defeating fire-and-forget.

```ts
const child = spawn(node, [bunRunner, workerScript, 'hook', 'pi', cmd], { ... });
child.unref();
child.stdin.end(JSON.stringify(payload));
child.on('error', err => logger.warn(...));
child.on('exit', code => { if (code !== 0) logger.warn(...) });
```

stdin payload is closed immediately; stdout is not read for capture events.

## 5. Error Handling

### 5.1 Preflight (in `session_start`) — FAIL LOUD, then disable

Four checks run in order. Any failure → `logger.error(msg)` + `state.enabled = false` + skip subsequent checks. All later handlers (inject, capture, tool) become no-ops. The pi session continues normally without memory.

| Check | Failure | User-facing message |
|---|---|---|
| `paths.resolveWorker()` | `worker-service.cjs` not found in any candidate | `pi-mem: claude-mem not installed. Run \`npx claude-mem install\` first.` |
| `paths.resolveBunRunner()` | `bun-runner.js` not in same dir | `pi-mem: claude-mem install is incomplete (bun-runner.js missing). Reinstall.` |
| `worker.runStart()` exit ≠ 0 within 60s | Worker failed to start | `pi-mem: claude-mem worker failed to start: <stderr tail>` |
| Version sanity: read `<workerDir>/../package.json` (the plugin directory's `package.json`), require `version` major === 13 | Mismatch | `pi-mem: claude-mem <version> not supported (need 13.x). Memory disabled.` |

### 5.2 Inject — SKIP WITH WARNING

| Condition | Action |
|---|---|
| `state.enabled === false` | Silent no-op (preflight already logged) |
| `worker.runHook('context')` non-zero exit, timeout, or non-JSON stdout | `state.ctxMarkdown = ''`, log warn "context fetch failed: <err>" |
| Response has `systemMessage` field | `ctx.ui.notify(systemMessage, "info")` |
| Response lacks `hookSpecificOutput.additionalContext` | `state.ctxMarkdown = ''`, no inject, no error (treated as "no memory yet") |
| `before_agent_start` and `state.ctxMarkdown === ''` | Return event unchanged (no wrapper, no inject) |

### 5.3 Capture — FIRE-AND-FORGET, DROP ON FAILURE

| Condition | Action |
|---|---|
| `state.enabled === false` OR `config.capture === false` | No-op |
| Subprocess spawn error (`ENOENT` etc.) | `logger.warn("capture spawn failed: <err>")`, drop event |
| Subprocess exits non-zero | `logger.warn("hook <cmd> exited <code>")`, drop event |
| Subprocess exceeds `PI_MEM_SPAWN_TIMEOUT_MS` | Force-kill, `logger.warn("hook <cmd> timed out")`, drop event |

No retry, no queue, no in-memory buffer. Lost events are acceptable — the corpus is enriched primarily from Claude Code sessions on the same folder; pi capture is supplementary.

### 5.4 `mem_search` tool — RETURN ERROR TO LLM

| Condition | Action |
|---|---|
| `state.enabled === false` | Return `"Error: pi-mem disabled (preflight failed)"` to LLM |
| HTTP fetch fails (ECONNREFUSED, timeout) | Return `"Error: claude-mem worker not reachable. Try \`npx claude-mem start\`."` |
| HTTP non-2xx | Return `"Error: search failed (HTTP <status>)"` |
| Empty result | claude-mem itself returns text like `Found 0 result(s) matching "<query>" (0 obs, 0 sessions, 0 prompts)` — pass through verbatim |
| Malformed response (no text block) | Return `"Error: claude-mem returned an empty or malformed search response"` |
| Success | Pass through `res.content[0].text` verbatim — claude-mem pre-formats markdown |

**Output format note:** claude-mem's `/api/search` returns MCP content-block shape `{ content: [{ type: 'text', text: '<markdown>' }] }` with the markdown already formatted (categorized by date, file, and observation/session/prompt counts). pi-mem does NOT build its own markdown — `extractMarkdown(res)` picks the first `type === 'text'` block and the result goes to the LLM unchanged. This keeps formatting consistent with what Claude Code users see and makes pi-mem resilient to claude-mem rendering tweaks.

**Limit semantics:** when `mem_search({limit: N})` is invoked, N is forwarded as `?limit=N` to claude-mem, which caps each category (obs/sessions/prompts) at N — so total results may be up to 3N.

### 5.5 Secret hygiene

The only "secret" surface is whatever lives in `~/.claude-mem/settings.json` — pi-mem only reads `CLAUDE_MEM_WORKER_PORT` from it, never an API key (local mode has no API key). Still:
- `logger.ts` redacts `Bearer\s+\S+` patterns from any value passed (defensive).
- Settings file is read once at startup, port value retained in closure scope.

## 6. Configuration

### 6.1 pi-mem env vars (genuinely pi-specific)

| Env Var | Default | Notes |
|---|---|---|
| `PI_MEM_ENABLED` | `true` | Master kill switch. `false` skips preflight entirely; all handlers no-op. |
| `PI_MEM_CAPTURE` | `true` | Disable capture (`message_end` / `tool_result` / `agent_end`) while keeping inject + search. |
| `PI_MEM_SPAWN_TIMEOUT_MS` | `30000` | Per-subprocess timeout for capture spawns and preflight start. |
| `PI_MEM_LOG_LEVEL` | `warn` | `silent` / `error` / `warn` / `info` / `debug`. pi-mem's own logger verbosity. |

Invalid values → log error + fall back to default. Never crash extension load.

### 6.2 Inherited from claude-mem (transparent, no pi-mem env var introduced)

| Env Var | Source | pi-mem behavior |
|---|---|---|
| `CLAUDE_CONFIG_DIR` | claude-mem & Claude Code convention | Root for path discovery. Default `$HOME/.claude`. |
| `CLAUDE_MEM_WORKER_PORT` | claude-mem | Read for `/api/search`. Default `37700 + (uid % 100)`. |
| `CLAUDE_MEM_WORKER_HOST` | claude-mem | Read for `/api/search`. Default `127.0.0.1`. |
| `CLAUDE_PLUGIN_ROOT` | Claude Code (when applicable) | Higher-priority path candidate. |
| `CLAUDE_MEM_DATA_DIR` | claude-mem | Not read by pi-mem directly; respected transparently by subprocess. |
| `CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT` | claude-mem | Controls whether claude-mem returns `systemMessage`. pi-mem honors what claude-mem returns — no separate display toggle. |

### 6.3 Worker path discovery

In order, first hit wins:

1. `$CLAUDE_PLUGIN_ROOT/scripts/worker-service.cjs` (when running inside a Claude Code plugin context — harmless to check first)
2. Latest mtime in `<CCD>/plugins/cache/thedotmack/claude-mem/*/plugin/scripts/worker-service.cjs` (Claude Code-managed install with version pin)
3. `<CCD>/plugins/marketplaces/thedotmack/plugin/scripts/worker-service.cjs` (canonical post-`npx claude-mem install` location for any install method)

Where `<CCD>` = `$CLAUDE_CONFIG_DIR ?? $HOME/.claude`. Same logic for `bun-runner.js` (always in `<dir>/bun-runner.js` next to `worker-service.cjs`).

Rationale: claude-mem's own runtime resolves via `marketplaceDirectory()` (`src/npx-cli/utils/paths.ts:27`). Both Claude Code plugin install and standalone `npx claude-mem install` populate that location.

### 6.4 Port discovery (for `/api/search`)

In order, first hit wins:

1. `$CLAUDE_MEM_WORKER_PORT`
2. `~/.claude-mem/settings.json` → either flat field `CLAUDE_MEM_WORKER_PORT` or nested `env.CLAUDE_MEM_WORKER_PORT` (claude-mem tolerates both — see `src/shared/paths.ts:27`)
3. Default: `String(37700 + ((process.getuid?.() ?? 77) % 100))` (matches `src/shared/SettingsDefaultsManager.ts:85`)

**Failure handling:** On settings.json missing, unreadable, or JSON parse error, fall through to the next candidate silently. Match claude-mem's own try/catch-and-default pattern (`src/shared/paths.ts:27`). Do not log; do not fail preflight.

## 7. Testing Strategy

### 7.1 Tooling

- vitest (matches pi ecosystem convention — see pi-mcp-adapter)
- TS strict
- Coverage target: 80% line; 100% on `worker.ts`, `inject.ts`, `capture.ts` (high-risk modules)

### 7.2 Unit tests (mock `child_process` and `fetch`)

| Module | Asserts |
|---|---|
| `paths.ts` | Resolution order, missing-file fallback, `$CLAUDE_PLUGIN_ROOT` precedence |
| `port.ts` | env > settings.json (flat & nested) > default; uid-based default |
| `worker.ts` | spawn args correct, `.unref()` called for fire-and-forget, stdin closed, timeout enforced |
| `search.ts` | URL construction, port resolution, ECONNREFUSED → user-friendly error |
| `inject.ts` | First-turn fetch caches, every `before_agent_start` re-injects, empty ctxMarkdown skips, `systemMessage` triggers `ctx.ui.notify` |
| `capture.ts` | Fire-and-forget (no await on stdout), event payloads match spec, `state.enabled === false` no-op, `config.capture === false` no-op |
| `tool.ts` | Schema validation, formatted markdown output, error paths return strings to LLM |
| `config.ts` | Defaults, invalid → log+default, boolean parsing |
| `preflight.ts` | Each failure → `state.enabled = false` + correct error message |
| `logger.ts` | Bearer-pattern redaction |

### 7.3 Multi-turn `before_agent_start` test (CRITICAL)

Specifically asserts that `before_agent_start` receives the wrapped systemPrompt **on every turn**, not just turn 1. This guards against the "inject once and skip" optimization called out in §4.3.

### 7.4 Integration tests (gated by file existence)

`tests/integration/` with `describe.skipIf(!fs.existsSync(...))`. Spawns a real `worker-service.cjs` and asserts:

- `hook pi context` returns a parseable JSON object with `hookSpecificOutput`
- `hook pi observation` accepts the documented payload and exits 0
- `/api/search?query=test` returns JSON (any shape, just not 404 / non-2xx)
- worker survives 10 rapid fire-and-forget spawns

Run manually in local dev. CI runs them only when `claude-mem` is pre-installed in the runner image.

## 8. Package Metadata

```json
{
  "name": "@husniadil/pi-mem",
  "version": "0.1.0",
  "description": "Pi extension that bridges to claude-mem for persistent cross-session memory",
  "type": "module",
  "license": "MIT",
  "author": "Husni Adil Makmur <husni.adil@gmail.com>",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/husniadil/pi-mem.git"
  },
  "keywords": ["pi-package", "pi", "claude-mem", "memory", "ai", "coding-agent", "extension"],
  "pi": { "extensions": ["./src/index.ts"] },
  "files": ["src/", "README.md", "LICENSE", "CHANGELOG.md"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "tsc --noEmit"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "^0.74.0",
    "typebox": "^1.1.24"
  },
  "devDependencies": {
    "@earendil-works/pi-coding-agent": "^0.74.0",
    "@types/node": "^22.0.0",
    "@vitest/coverage-v8": "^3.0.0",
    "typebox": "^1.1.24",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  },
  "engines": { "node": ">=22.0.0" }
}
```

Distribution: `pi install npm:@husniadil/pi-mem`. Source repo at `github.com/husniadil/pi-mem`. No build step — pi reads `.ts` directly.

## 9. Open Questions / Future

Not blockers for MVP. Documented for the next iteration.

- **Pi session-resume semantics.** Does `session_start` fire when pi resumes a saved session? If not, `state.ctxMarkdown` would be empty on resume → no inject. Verify during implementation; if missing-on-resume, hook into the resume event too.
- **Monorepo identity.** `realpath(cwd)` means two pi sessions in different subdirs of the same repo are two claude-mem projects. Acceptable for MVP. If users complain, add a `PI_MEM_PROJECT_ROOT` env override.
- **Submitting an upstream `pi` adapter.** If the maintainer changes their stance, replace `rawAdapter`-via-`default` with an explicit `pi` adapter case. Code-path stays subprocess; only the platform-name validation moves upstream.
- **Capture batching.** If subprocess spawn rate (one per tool_result) ever becomes a measurable cost, switch capture to a long-lived child process with stdin-multiplexing. Not needed at MVP scale.
- **Pi tool surface beyond `mem_search`.** If demand emerges, add `mem_recent`, `mem_smart_search`, etc. that wrap `/api/*` endpoints.

## 10. Revision History

Code snippets in this spec were corrected post-execution on 2026-05-26 to match what actually shipped. The corrections came from running `pi install` against a live claude-mem worker and discovering contract drift between assumed and actual behavior.

| Date | Commit | Section(s) | What changed |
|---|---|---|---|
| 2026-05-26 | `7bd6feb` | §3.2, §8 | `pi.registerTool` is single-arg with `name`/`label`/TypeBox `parameters`/`execute()` (return `{content, details}`). TypeBox restored to peerDeps. |
| 2026-05-26 | `b4f5ac9` | §4.1, §5.4 | `/api/search` returns MCP content-block `{ content: [{type,text}] }`, not `{ results: [...] }`. pi-mem passes through claude-mem's pre-formatted markdown via `extractMarkdown(res.content)`. `limit` forwarded as `?limit=N`. |
| 2026-05-26 | `c9e88bd` | (none in spec; see plan T12) | `extractTextContent` helper for pi 0.74+ content-block message arrays. |
| 2026-05-26 | `6f5aa02` | §4.2 | `state.rootPath` derived from `ctx.cwd` (pi-canonical) with `process.cwd()` fallback. |
| 2026-05-26 | `e05dc97` | §4.4 | `setTimeout` for capture force-kill also `.unref()`'d alongside `child.unref()` so pi can exit cleanly. |
- **TUI widget for inject status.** Instead of one-shot `ctx.ui.notify`, use `ctx.ui.setStatus('pi-mem', '✓ memory loaded (N obs)')` for sustained footer indication.
