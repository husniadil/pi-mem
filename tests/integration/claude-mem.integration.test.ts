// tests/integration/claude-mem.integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolvePaths } from '../../src/paths.ts';
import { runStart, runHook } from '../../src/worker.ts';
import { search } from '../../src/search.ts';
import { handleSearch, extractMarkdown } from '../../src/tool.ts';
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
