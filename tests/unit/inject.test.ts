// tests/unit/inject.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAndCacheContext, injectIntoSystemPrompt } from '../../src/inject.ts';
import { createSessionState } from '../../src/session.ts';
import { createLogger } from '../../src/logger.ts';

const log = createLogger('silent');
const paths = { workerScript: '/p/w.cjs', bunRunner: '/p/b.js', pluginDir: '/p' };

vi.mock('../../src/worker.ts', () => ({
  runStart: vi.fn(),
  runHook: vi.fn(),
  runHookFireAndForget: vi.fn()
}));

import { runHook } from '../../src/worker.ts';

describe('inject', () => {
  let notify: ReturnType<typeof vi.fn>;
  beforeEach(() => { vi.clearAllMocks(); notify = vi.fn(); });

  it('fetchAndCacheContext stores additionalContext and calls notify on systemMessage', async () => {
    (runHook as any).mockResolvedValue({
      hookSpecificOutput: { additionalContext: '## memory' },
      systemMessage: 'Loaded 5 obs'
    });
    const state = createSessionState({ sessionId: 's', rootPath: '/r' });
    await fetchAndCacheContext({ state, paths, ui: { notify }, logger: log, timeoutMs: 1000 });
    expect(state.ctxMarkdown).toBe('## memory');
    expect(notify).toHaveBeenCalledWith('Loaded 5 obs', 'info');
  });

  it('fetchAndCacheContext skips notify when systemMessage absent', async () => {
    (runHook as any).mockResolvedValue({ hookSpecificOutput: { additionalContext: 'x' } });
    const state = createSessionState({ sessionId: 's', rootPath: '/r' });
    await fetchAndCacheContext({ state, paths, ui: { notify }, logger: log, timeoutMs: 1000 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('fetchAndCacheContext clears ctxMarkdown on hook failure (no crash)', async () => {
    (runHook as any).mockRejectedValue(new Error('exit 1'));
    const state = createSessionState({ sessionId: 's', rootPath: '/r' });
    state.ctxMarkdown = 'stale';
    await fetchAndCacheContext({ state, paths, ui: { notify }, logger: log, timeoutMs: 1000 });
    expect(state.ctxMarkdown).toBe('');
  });

  it('injectIntoSystemPrompt wraps content in <claude-mem-context> tags', () => {
    const state = createSessionState({ sessionId: 's', rootPath: '/r' });
    state.ctxMarkdown = '## obs';
    const r = injectIntoSystemPrompt('BASE', state);
    expect(r).toBe('BASE\n\n<claude-mem-context>\n## obs\n</claude-mem-context>');
  });

  it('injectIntoSystemPrompt returns base unchanged when ctxMarkdown empty', () => {
    const state = createSessionState({ sessionId: 's', rootPath: '/r' });
    expect(injectIntoSystemPrompt('BASE', state)).toBe('BASE');
  });

  it('injectIntoSystemPrompt returns base unchanged when state disabled', () => {
    const state = createSessionState({ sessionId: 's', rootPath: '/r' });
    state.ctxMarkdown = '## obs';
    state.enabled = false;
    expect(injectIntoSystemPrompt('BASE', state)).toBe('BASE');
  });
});
