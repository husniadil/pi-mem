# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-26

Initial release. Pi extension that bridges to [claude-mem](https://github.com/thedotmack/claude-mem)
for persistent cross-session memory. Verified compatible with claude-mem 13.x.

### Added

- **Auto-inject context** at `session_start`: fetches recent observations via
  `worker-service.cjs hook pi context` subprocess and injects into `systemPrompt`
  every `before_agent_start` (wrapped in `<claude-mem-context>...</claude-mem-context>`).
  Re-injects on every turn — required because pi resets `systemPrompt` to
  `_baseSystemPrompt` when no `systemPrompt` is returned from the handler.
- **TUI banner** via `ctx.ui.notify(systemMessage, "info")` when claude-mem emits one
  (controlled by `CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT`).
- **Event capture** on `message_end` / `tool_result` / `agent_end`: fire-and-forget
  subprocess spawns logging events as claude-mem observations (`session-init`,
  `observation`, `summarize` hooks). MCP content-block message arrays normalized
  via `extractTextContent` (handles pi 0.74+ structured content).
- **Agent tools** (3-layer claude-mem workflow):
  - `mem_search({query, limit?})` — `GET /api/search`. Markdown table of matching
    observations / sessions / prompts. Limit caps each category.
  - `mem_timeline({anchor?|query?, depth_before?, depth_after?, project?})` —
    `GET /api/timeline`. Context window around an anchor (observation ID,
    session ID `S<id>`, or ISO timestamp), XOR with `query`.
  - `mem_get_observations({ids, orderBy?, limit?, project?})` — `POST
    /api/observations/batch`. Full 23-field records by ID. Raw JSON passthrough
    (matches Claude Code MCP `get_observations` 1:1).
- **Preflight + graceful disable**: file-existence + version checks at
  `session_start`; on failure, `state.enabled = false` and all handlers no-op
  (no crashes, no LLM-visible errors).
- **Integration drift guards** against live claude-mem worker: real-endpoint
  shape assertions for `/api/search`, `/api/observations/batch`, `/api/timeline`,
  plus `hook pi observation`/`session-init` payload acceptance. Designed to catch
  the same class of contract drift that produced the production bugs in commits
  `b4f5ac9` (response shape mismatch) and `7bd6feb` (registerTool API contract).
- **Zero runtime dependencies**. Peer deps: `@earendil-works/pi-coding-agent`,
  `typebox`. Node ≥ 22.

### Configuration

Env vars (genuinely pi-specific):

- `PI_MEM_ENABLED` (default `true`) — master kill switch
- `PI_MEM_CAPTURE` (default `true`) — disable capture, keep inject + search
- `PI_MEM_SPAWN_TIMEOUT_MS` (default `30000`)
- `PI_MEM_LOG_LEVEL` (default `warn`) — `silent` / `error` / `warn` / `info` / `debug`

Inherited transparently from claude-mem (no pi-mem env var introduced):
`CLAUDE_CONFIG_DIR`, `CLAUDE_MEM_WORKER_PORT`, `CLAUDE_MEM_WORKER_HOST`,
`CLAUDE_PLUGIN_ROOT`, `CLAUDE_MEM_DATA_DIR`, `CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT`.

### Known limitations

- claude-mem maintainer declined first-class pi support. pi-mem identifies as
  platform `pi` via claude-mem's `rawAdapter` fallback (`default: return rawAdapter`
  in `src/cli/adapters/index.ts`) — a switch fallback, not a public API. Breaking
  changes in claude-mem can break pi-mem with no notice.
- Inject context is cached once per session at `session_start`. Mid-session new
  observations don't appear in `systemPrompt` until session restart. Use the
  `mem_*` tools for live corpus queries.
- One pi-mem session per pi process — extension loads per session (not keyed
  by session ID internally; relies on pi's load model).
