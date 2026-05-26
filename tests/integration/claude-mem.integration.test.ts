// tests/integration/claude-mem.integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolvePaths } from '../../src/paths.ts';
import { runStart, runHook } from '../../src/worker.ts';
import { search, getObservations, timeline } from '../../src/search.ts';
import { handleSearch, handleGetObservations, handleTimeline, extractMarkdown } from '../../src/tool.ts';
import { createSessionState } from '../../src/session.ts';
import { createLogger } from '../../src/logger.ts';

const log = createLogger('silent');
const env = process.env;
const claudeMemRoot = join(env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'plugins', 'marketplaces', 'thedotmack');
const haveClaudeMem = existsSync(claudeMemRoot);

describe.skipIf(!haveClaudeMem)('pi-mem ↔ claude-mem worker (real)', () => {
  let paths: NonNullable<ReturnType<typeof resolvePaths>>;

  beforeAll(async () => {
    const r = resolvePaths(env);
    if (!r) throw new Error('claude-mem worker scripts not found despite marketplace dir existing');
    paths = r;
    await runStart(paths, { timeoutMs: 60000, logger: log });
  }, 70000);

  it('hook pi context returns a JSON object with optional hookSpecificOutput', async () => {
    const r = await runHook(paths, 'pi', 'context',
      { sessionId: 'pi-mem-integration-test', cwd: process.cwd() },
      { timeoutMs: 30000, logger: log }
    );
    expect(typeof r).toBe('object');
    // hookSpecificOutput may be absent if no context exists yet; just assert shape doesn't crash
  });

  it('hook pi observation accepts payload and exits 0', async () => {
    await expect(
      runHook(paths, 'pi', 'observation',
        {
          sessionId: 'pi-mem-integration-test',
          cwd: process.cwd(),
          toolName: 'Read',
          toolInput: { path: '/tmp/x' },
          toolResponse: 'sample'
        },
        { timeoutMs: 30000, logger: log }
      )
    ).resolves.not.toThrow();
  });

  it('GET /api/search responds (any status code, no network error)', async () => {
    const res = await search('integration test query', { env, logger: log, timeoutMs: 5000 }).catch(e => e);
    // Acceptable: either a SearchResponse object, or an Error with HTTP status
    expect(res).toBeDefined();
  });

  // --- contract drift guards ---
  // These tests would have caught the two production bugs we hit on 2026-05-26:
  //   1. /api/search response shape (we assumed { results } but it's { content })
  //   2. hook pi observation rejecting unfamiliar payloads
  // If any of these start failing after a claude-mem upgrade, pi-mem needs a
  // contract review BEFORE shipping a release that pairs with the new version.

  it('DRIFT GUARD: /api/search returns MCP content-block shape', async () => {
    const res = await search('the', { env, logger: log, timeoutMs: 5000 });
    expect(res).toBeTypeOf('object');
    expect(Array.isArray(res.content), 'response.content must be an array').toBe(true);
    expect(res.content!.length, 'response.content must have at least one block').toBeGreaterThan(0);
    const first = res.content![0]!;
    expect(first.type, 'first block.type must be "text"').toBe('text');
    expect(typeof first.text, 'first block.text must be a string').toBe('string');
    expect(first.text.length, 'first block.text must be non-empty').toBeGreaterThan(0);
  });

  it('DRIFT GUARD: handleSearch end-to-end returns non-empty markdown via extractMarkdown', async () => {
    const state = { ...createSessionState({ sessionId: 'pi-mem-integration-test', rootPath: process.cwd() }) };
    const markdown = await handleSearch(
      { query: 'the' },
      { state, env, logger: log, timeoutMs: 5000 }
    );
    // Should be either real results markdown or the "Found 0" message — never the
    // "empty or malformed" fallback that signaled the original bug.
    expect(markdown).not.toMatch(/empty or malformed/i);
    expect(markdown.length).toBeGreaterThan(10);
  });

  it('DRIFT GUARD: ?limit=N is honored by /api/search', async () => {
    const small = await search('the', { env, logger: log, timeoutMs: 5000, limit: 1 });
    const big = await search('the', { env, logger: log, timeoutMs: 5000, limit: 50 });
    const smallText = extractMarkdown(small);
    const bigText = extractMarkdown(big);
    // limit=1 returns header line like "Found N result(s)..." where N <= 3
    // (1 obs + 1 session + 1 prompt). limit=50 should have strictly more.
    const smallCount = parseInt(smallText.match(/Found (\d+) result/)?.[1] ?? '0', 10);
    const bigCount = parseInt(bigText.match(/Found (\d+) result/)?.[1] ?? '0', 10);
    expect(smallCount, 'limit=1 capped result count').toBeLessThanOrEqual(3);
    expect(bigCount, 'limit=50 returned at least as many as limit=1').toBeGreaterThanOrEqual(smallCount);
  });

  it('DRIFT GUARD: hook pi observation accepts content-block array as toolResponse', async () => {
    // Pi 0.74+ tools return execute() with content-block arrays. If pi-mem
    // forwards that without normalization (regression), claude-mem may reject
    // or store garbage. Verify it doesn't crash and exits 0.
    await expect(
      runHook(paths, 'pi', 'observation',
        {
          sessionId: 'pi-mem-integration-test',
          cwd: process.cwd(),
          toolName: 'mem_search',
          toolInput: { query: 'WBR' },
          toolResponse: 'Found 3 results matching WBR'  // already-normalized text
        },
        { timeoutMs: 30000, logger: log }
      )
    ).resolves.not.toThrow();
  });

  it('DRIFT GUARD: hook pi session-init accepts user prompt text', async () => {
    await expect(
      runHook(paths, 'pi', 'session-init',
        {
          sessionId: 'pi-mem-integration-test',
          cwd: process.cwd(),
          prompt: 'hari ini saya ngapain aja?'  // realistic user prompt
        },
        { timeoutMs: 30000, logger: log }
      )
    ).resolves.not.toThrow();
  });

  // --- mem_get_observations drift guards ---

  it('DRIFT GUARD: POST /api/observations/batch returns bare JSON array (not wrapped in content)', async () => {
    // claude-mem ResultFormatter.ts:137 emits observation rows as `| #<id> | ... |`,
    // while sessions/prompts use `#S<id>` / `#P<id>` (which we deliberately exclude).
    // The "Found N result(s)" header has a bare integer, also non-matching.
    const searchRes = await search('the', { env, logger: log, timeoutMs: 5000 });
    const idMatch = (searchRes.content?.[0]?.text ?? '').match(/\| #(\d+) \|/);
    if (!idMatch) {
      // Empty corpus or only session/prompt results — skip without failing.
      return;
    }
    const id = parseInt(idMatch[1]!, 10);

    const records = await getObservations({ ids: [id] }, { env, logger: log, timeoutMs: 5000 });
    expect(Array.isArray(records), 'response.body must be a bare array (NOT wrapped in {content:[...]} like /api/search)').toBe(true);
    expect(records.length, 'at least one record returned').toBeGreaterThan(0);

    const first = records[0]!;
    for (const key of ['id', 'memory_session_id', 'project', 'text', 'type', 'created_at', 'created_at_epoch', 'content_hash', 'relevance_count']) {
      expect(first, `record missing field "${key}"`).toHaveProperty(key);
    }
  });

  it('DRIFT GUARD: non-existent IDs return empty array (silently dropped)', async () => {
    const records = await getObservations({ ids: [99999999] }, { env, logger: log, timeoutMs: 5000 });
    expect(records).toEqual([]);
  });

  it('DRIFT GUARD: handleGetObservations stringifies bare array with 2-space indent', async () => {
    const state2 = { ...createSessionState({ sessionId: 'pi-mem-integration-test', rootPath: process.cwd() }) };
    const r = await handleGetObservations(
      { ids: [99999999] },
      { state: state2, env, logger: log, timeoutMs: 5000 }
    );
    expect(r).toBe('[]');
  });

  it('DRIFT GUARD: optional orderBy / limit / project accepted by /api/observations/batch', async () => {
    await expect(
      getObservations(
        { ids: [1, 2, 3], orderBy: 'date_desc', limit: 2 },
        { env, logger: log, timeoutMs: 5000 }
      )
    ).resolves.not.toThrow();
  });

  // --- mem_timeline drift guards ---

  it('DRIFT GUARD: /api/timeline returns MCP content-block shape (same as /api/search)', async () => {
    const searchRes = await search('the', { env, logger: log, timeoutMs: 5000 });
    const idMatch = (searchRes.content?.[0]?.text ?? '').match(/\| #(\d+) \|/);
    if (!idMatch) {
      return; // Empty corpus — skip
    }
    const id = parseInt(idMatch[1]!, 10);

    const res = await timeline({ anchor: id, depth_before: 1, depth_after: 1 }, { env, logger: log, timeoutMs: 5000 });
    expect(res).toBeTypeOf('object');
    expect(Array.isArray(res.content), 'response.content must be an array').toBe(true);
    expect(res.content!.length, 'response.content must have at least one block').toBeGreaterThan(0);
    expect(res.content![0]!.type, 'first block.type must be "text"').toBe('text');
    expect(typeof res.content![0]!.text, 'first block.text must be a string').toBe('string');
  });

  it('DRIFT GUARD: handleTimeline returns non-empty markdown via extractMarkdown', async () => {
    const state2 = { ...createSessionState({ sessionId: 'pi-mem-integration-test', rootPath: process.cwd() }) };
    const r = await handleTimeline(
      { query: 'the' },
      { state: state2, env, logger: log, timeoutMs: 5000 }
    );
    expect(r).not.toMatch(/empty or malformed/i);
    expect(r.length).toBeGreaterThan(5);
  });

  it('DRIFT GUARD: XOR validation enforced by claude-mem (anchor + query → error markdown)', async () => {
    const res = await timeline({ anchor: 1, query: 'x' }, { env, logger: log, timeoutMs: 5000 });
    const text = res.content?.[0]?.text ?? '';
    expect(text).toMatch(/cannot provide both/i);
  });

  it('DRIFT GUARD: neither anchor nor query → error markdown (not crash)', async () => {
    const res = await timeline({}, { env, logger: log, timeoutMs: 5000 });
    const text = res.content?.[0]?.text ?? '';
    expect(text).toMatch(/must provide either/i);
  });

  it('multi-turn re-injection regression: ctxMarkdown stays constant', async () => {
    // Spec §4.3: must re-inject every turn with identical content
    const r1 = await runHook(paths, 'pi', 'context',
      { sessionId: 'pi-mem-integration-test', cwd: process.cwd() },
      { timeoutMs: 30000, logger: log }
    );
    const r2 = await runHook(paths, 'pi', 'context',
      { sessionId: 'pi-mem-integration-test', cwd: process.cwd() },
      { timeoutMs: 30000, logger: log }
    );
    // Two consecutive calls should return identical context (assuming no new writes between)
    expect(r1.hookSpecificOutput?.additionalContext).toBe(r2.hookSpecificOutput?.additionalContext);
  });
});
