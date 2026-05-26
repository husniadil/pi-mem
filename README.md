# @husniadil/pi-mem

Pi extension that bridges to [claude-mem](https://github.com/thedotmack/claude-mem) for persistent cross-session memory. Mirrors Claude Code's memory UX inside pi: auto-injects context at session start (with TUI banner), captures pi events as observations, and exposes `mem_search` to the agent.

## Important: Maintainer Non-Support

claude-mem's maintainer has explicitly declined to add first-class pi support. This package uses claude-mem's `rawAdapter` fallback (`default: return rawAdapter` in `src/cli/adapters/index.ts`) — a switch fallback, not a public API. **Any breaking change in claude-mem can break pi-mem with no notice.** Pin to `claude-mem` 13.x and don't file pi-mem bugs against claude-mem.

## Prerequisites

- [claude-mem](https://github.com/thedotmack/claude-mem) installed (`npx claude-mem install`)
- Node ≥ 22
- pi ≥ 0.74

## Install

```bash
pi install npm:@husniadil/pi-mem
```

Restart pi. The extension auto-loads.

## How It Works

1. **session_start**: pi-mem verifies claude-mem is installed, starts the worker if needed, fetches recent observations via `worker-service.cjs hook pi context`, and displays the TUI banner via `ctx.ui.notify(...)`.
2. **before_agent_start** (every turn): re-injects the cached context into `systemPrompt`, wrapped in `<claude-mem-context>...</claude-mem-context>`. Identical content across turns → LLM prompt cache hits.
3. **message_end / tool_result / agent_end**: fire-and-forget subprocess spawns to log events as claude-mem observations.
4. **`mem_search` tool**: HTTP GET to claude-mem worker's `/api/search` endpoint.

## Configuration

Pi-mem-specific env vars (genuinely pi-specific):

| Env Var | Default | Notes |
|---|---|---|
| `PI_MEM_ENABLED` | `true` | Master kill switch |
| `PI_MEM_CAPTURE` | `true` | Disable capture, keep inject + search |
| `PI_MEM_SPAWN_TIMEOUT_MS` | `30000` | Per-subprocess timeout |
| `PI_MEM_LOG_LEVEL` | `warn` | `silent` / `error` / `warn` / `info` / `debug` |

Inherited from claude-mem (transparent — no pi-mem env var introduced):

| Env Var | Purpose |
|---|---|
| `CLAUDE_CONFIG_DIR` | Root for worker path discovery (default `$HOME/.claude`) |
| `CLAUDE_MEM_WORKER_PORT` | Worker HTTP port (default `37700 + (uid % 100)`) |
| `CLAUDE_MEM_WORKER_HOST` | Worker host (default `127.0.0.1`) |
| `CLAUDE_PLUGIN_ROOT` | Claude Code-injected plugin path |
| `CLAUDE_MEM_DATA_DIR` | claude-mem data dir |
| `CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT` | Controls whether the TUI banner appears (set to `true` in `~/.claude-mem/settings.json` to enable) |

## Troubleshooting

- **`claude-mem is not installed`** — run `npx claude-mem install`.
- **`claude-mem worker failed to start`** — try `npx claude-mem start` manually. Inspect with `npx claude-mem status`.
- **No TUI banner** — set `CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT=true` in `~/.claude-mem/settings.json` (claude-mem only emits `systemMessage` when this is on).
- **Memory feels stale** — pi-mem caches the auto-injected context once per session at `session_start`, so newly captured observations won't appear in `systemPrompt` until you restart the pi session. The `mem_search` tool is unaffected — it always hits the live `/api/search` endpoint and reflects current corpus state, so use it when you need up-to-date results mid-session.

## License

MIT
