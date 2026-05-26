# CLAUDE.md — pi-mem

Project instructions for Claude / agents working on pi-mem. Read alongside `~/CLAUDE.md` (global user preferences). Project-specific guidance below overrides general defaults where they conflict.

## What pi-mem is

Pi extension that bridges pi (agent runtime) to claude-mem (persistent memory). Mirrors Claude Code's memory UX inside pi: auto-injects context, captures events, exposes 3-layer agent tools (`mem_search` → `mem_timeline` → `mem_get_observations`).

**Critical fragility:** claude-mem maintainer declined first-class pi support. We use claude-mem's `rawAdapter` fallback (`default: return rawAdapter` in `claude-mem/src/cli/adapters/index.ts`) — a switch fallback, not a public API. claude-mem isn't a peer/runtime dependency; it's an externally-installed package pi-mem talks to via subprocess + HTTP. Any breaking change in claude-mem can break pi-mem with no notice.

Currently verified compatible with claude-mem 13.x. README + integration drift guards are the only place we encode this — if a future claude-mem version breaks contracts, the drift guards fail first.

**Canonical docs:**

- Design spec: `docs/superpowers/specs/2026-05-26-pi-mem-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-26-pi-mem.md`
- README: `README.md` (user-facing)
- Changelog: `CHANGELOG.md`

Always check spec + plan before designing anything. They have endpoint contracts, error matrices, and revision history.

## Feature development workflow

This is the exact pattern we use for adding a new tool / endpoint wrapper. Follow it.

### 1. Ground the design first — DO NOT guess contracts

Before writing any code or spec:

- **Read claude-mem source** for the endpoint you're wrapping. Locations:
  - Tool definitions: `claude-mem/src/servers/mcp-server.ts`
  - HTTP routes: `claude-mem/src/services/worker/http/routes/*.ts`
  - Business logic: `claude-mem/src/services/worker/SearchManager.ts`, `DataManager`, etc.
  - Response shapes: trace `res.json(...)` calls — confirm whether the endpoint returns MCP content-block (`{content:[{type,text}]}`) or bare JSON
- **Live probe** with `curl` against the running worker if behavior is unclear
- **Cross-reference with Claude Code MCP** — if claude-mem's MCP server treats the endpoint a specific way (e.g., `JSON.stringify(data, null, 2)` for raw passthrough), match that exactly. We want LLM behavior identical across Claude Code and pi.

**Two production bugs (`b4f5ac9`, `7bd6feb`) came from assumed contracts that turned out wrong.** Drift-guard tests now catch this class of bug, but the cheap fix is grounding before designing.

### 2. Extend existing spec/plan — don't fork

For a new tool within the same `mem_*` surface:

- **Append to existing docs**, don't create a new `docs/superpowers/specs/<feature>.md`. The whole pi-mem tool surface lives in one spec.
- Add a new `§5.N` error matrix section mirroring `§5.4 mem_search` shape
- Add a third stanza to `§4.1` data flow
- Update `§3.1` components comment list
- Append `§10` revision history entry (use `(pending)` for the commit ref until the work lands; backfill after commit)
- Plan: append `Task N` blocks after the last existing task, before `## Revision History`

Test code in plan tasks must be **complete** (no placeholders, no "similar to above"). Engineer reading the plan should not need to cross-reference earlier tasks.

Commit spec/plan together as a single docs commit (`docs: scope <feature> into spec/plan`) BEFORE writing implementation code.

### 3. TDD per task — bite-sized commits

Each task in the plan = one commit. Within a task:

1. Add types to `src/types.ts` (if needed)
2. Write failing unit tests (extend existing test file, don't create parallel one)
3. Run tests → verify FAIL with expected error (e.g., "is not a function" if export missing)
4. Implement the function
5. Run tests → verify PASS
6. `npx tsc --noEmit` — must be clean
7. Commit with conventional message

Mock conventions:

- `vi.mock('node:fs', { spy: true })` for fs interactions (vitest 3.x ESM workaround)
- `vi.mock('../../src/search.ts', () => ({ search: vi.fn(), getObservations: vi.fn(), timeline: vi.fn() }))` — list ALL exports in the factory; vi.mock is hoisted so you can't re-mock same path
- Mock factories live at top of test file, before imports of mocked module

### 4. Advisor checkpoint — before declaring done

Call `advisor()` at these moments:

- **After spec/plan extension** but before starting implementation — catches scoping/design issues while still cheap
- **After implementation** but before declaring the feature shipped — catches regressions, blind spots, missed edge cases
- **When stuck** — recurring errors, unclear root cause, considering changing approach

The advisor sees your full transcript. They've already caught:

- Regex bugs that would have flaked integration tests (`/#?(\d+)/` matching header counts instead of IDs)
- Spec/impl mismatches (error string format drift)
- Coverage gaps (empty-array input not tested)
- Blind spots specific to past bugs (`registerTool` API contract changes, content-block-array assumptions)

### 5. Apply advisor fixes — surface, don't silently fix

When advisor flags issues:

- **🔴 Blockers** — fix before declaring done. Re-run tests, re-verify. Don't push through.
- **🟡 Non-blockers in current scope** — apply if cheap (one-liner, single test add). Add a test for the new behavior.
- **🟡 Pre-existing inaccuracies in OTHER sections** — surface to user, ask before fixing. Don't silently expand scope. Example: discovering `§5.4 mem_search` has stale error-string format while updating `§5.6` — flag it, let user decide.

Apply fixes in a single follow-up commit with conventional `fix:` prefix or amend if user explicitly OKs amend.

### 6. Persist context for resumption

After a feature ships, update whatever long-term context store your agent uses (memory system, notes file, etc.) so future sessions pick up without redundant grounding:

- Commit range + test count for the shipped feature
- Updated queue / priorities for remaining work
- Latest commit SHA as the "resume from here" anchor

This is project-agnostic discipline — the location is up to your agent setup, but the discipline isn't optional. Without it, post-/compact sessions re-derive context from scratch and may drift.

## Code conventions

### Tool registration shape (pi 0.74+)

```ts
pi.registerTool({                                    // single-arg
  name: 'mem_<verb>',                                // not configurable
  label: '<Human label>',
  description: '<for LLM tool selection>',
  parameters: <TypeBoxSchema>,                       // typebox, not @sinclair/typebox
  async execute(_toolCallId: string, params: <inline type>) {
    const text = state
      ? await <handler>(params, { state, env: process.env, logger, timeoutMs: config.spawnTimeoutMs })
      : 'Error: pi-mem not initialized (no active session)';
    return { content: [{ type: 'text', text }], details: {} };
  }
});
```

Don't deviate. The single-arg shape is the load-bearing contract — past bug `7bd6feb`.

### Handler shape

```ts
export async function handle<Tool>(args: <Args>, ctx: ToolCtx): Promise<string> {
  if (!ctx.state.enabled) return 'Error: pi-mem disabled (preflight failed)';
  try {
    const res = await <httpClient>(args, { env: ctx.env, logger: ctx.logger, timeoutMs: ctx.timeoutMs });
    return extractMarkdown(res);  // OR JSON.stringify(res, null, 2) for raw passthrough
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
```

The `state.enabled === false` early return is non-negotiable — disabled means preflight failed and pi-mem must no-op gracefully.

### HTTP client shape (in `src/search.ts`)

Pattern for new endpoint:

- Resolve host/port from env via `resolveHost` / `resolvePort`
- Build URL or POST body, **omitting undefined / empty / non-positive optional params**
- Wrap in `try/catch`, convert `ECONNREFUSED` → friendly error
- Non-2xx → throw `<verb> HTTP <status>` (NOT `<verb> failed (HTTP <status>)`)
- Use `AbortSignal.timeout(opts.timeoutMs)`

Don't add `src/observations.ts` / `src/timeline.ts` etc. — keep all HTTP clients in `src/search.ts` until the file genuinely becomes unwieldy. Three similar lines > premature abstraction.

### Output format choice

- **Markdown passthrough** (`extractMarkdown(res)`) — when claude-mem's endpoint returns MCP content-block with pre-formatted markdown (`/api/search`, `/api/timeline`)
- **JSON passthrough** (`JSON.stringify(data, null, 2)`) — when claude-mem returns a bare array/object and Claude Code's MCP stringifies it (`/api/observations/batch`)

Decision rule: match what Claude Code's MCP tool returns. Verify in `claude-mem/src/servers/mcp-server.ts`.

## Testing discipline

### Unit tests

- All in `tests/unit/`, mock all external IO
- Test the shape we control: schemas, error paths, body serialization, URL construction, optional-param omission
- Don't test trivial getters; do test edge cases (empty arrays, undefined optionals, zero values)

### Integration drift guards

- All in `tests/integration/`, gated by `describe.skipIf(!haveClaudeMem)(...)` — skip when claude-mem not installed
- Hit the **real** claude-mem worker. These exist specifically to catch contract drift that unit tests can't see.
- For each new endpoint wrapper, add drift guards covering at least:
  - Response shape (content-block vs bare array — catches `b4f5ac9`-class bugs)
  - End-to-end through the handler (verifies passthrough works)
  - Error/edge case validation owned by claude-mem (verifies the "single boundary" design holds)
  - Any optional-param semantics that pi-mem doesn't control (e.g., XOR validation, IDs-not-found behavior)
- When discovering observation IDs from search markdown, anchor regex to **table cell** format: `/\| #(\d+) \|/` — excludes `Found N` header counts and session/prompt `#S`/`#P` prefixes

### Commands

```bash
npm test                                          # full suite
npm test -- tests/unit/<file>.test.ts             # one unit file
npm test -- tests/integration/                    # integration only
npx tsc --noEmit                                  # type check
```

Both must pass before commit. No `--no-verify`.

## Out-of-scope — DO NOT add unilaterally

These tools are intentionally excluded:

- **`smart_search` / `smart_unfold` / `smart_outline`** — tree-sitter codebase tools. Different domain (local files, not memory). Pi has Read/Grep natives.
- **`observation_*` / `memory_*` (server-beta variants)** — require `CLAUDE_MEM_RUNTIME=server-beta`. Not the default worker runtime pi-mem targets.
- **`build_corpus` / `prime_corpus` / `query_corpus` etc.** — knowledge-corpus management. Different layer. Wait for explicit demand.

If user asks for one of these, surface the "different domain / different runtime" reasoning before implementing. Don't just say yes.

## Deferred design questions

From spec §9 — don't preemptively implement; revisit only on concrete user pain:

- Pi session-resume semantics — does `session_start` fire on `pi resume`?
- Monorepo identity — `realpath(ctx.cwd)` means subdirs are separate projects. Add `PI_MEM_PROJECT_ROOT` env override only if users complain.
- Capture batching — switch to long-lived child with stdin-multiplexing only if subprocess rate becomes measurable cost.
- TUI widget for inject status — `ctx.ui.setStatus('pi-mem', '✓ memory loaded (N obs)')` if `notify` one-shot proves insufficient.

## Quick reference: where things live

| Concern                 | File                                                                      |
| ----------------------- | ------------------------------------------------------------------------- |
| Session state shape     | `src/session.ts`                                                          |
| Per-event handlers      | `src/index.ts` (`pi.on('session_start' \| 'before_agent_start' \| ...)` ) |
| Context inject          | `src/inject.ts` (`fetchAndCacheContext`, `injectIntoSystemPrompt`)        |
| Capture handlers        | `src/capture.ts`                                                          |
| HTTP clients            | `src/search.ts` (search, getObservations, timeline)                       |
| Tool handlers + schemas | `src/tool.ts` (handle*, Mem*Params)                                       |
| Subprocess hook invoker | `src/worker.ts` (`runHookFireAndForget`, `runHook`)                       |
| Worker path discovery   | `src/paths.ts`                                                            |
| Worker port discovery   | `src/port.ts`                                                             |
| Preflight               | `src/preflight.ts`                                                        |
| Config / env parsing    | `src/config.ts`                                                           |
| Logger                  | `src/logger.ts` (with `Bearer\s+\S+` redaction)                           |
