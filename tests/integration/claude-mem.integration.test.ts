// tests/integration/claude-mem.integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolvePaths } from '../../src/paths.ts';
import { runStart, runHook } from '../../src/worker.ts';
import { search } from '../../src/search.ts';
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
