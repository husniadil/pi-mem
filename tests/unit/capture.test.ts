// tests/unit/capture.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureUserMessage, captureToolResult, captureAgentEnd } from '../../src/capture.ts';
import { createSessionState } from '../../src/session.ts';
import { createLogger } from '../../src/logger.ts';

const log = createLogger('silent');
const paths = { workerScript: '/p/w.cjs', bunRunner: '/p/b.js', pluginDir: '/p' };

vi.mock('../../src/worker.ts', () => ({
  runStart: vi.fn(),
  runHook: vi.fn(),
  runHookFireAndForget: vi.fn()
}));

import { runHookFireAndForget } from '../../src/worker.ts';

const captureCtx = (overrides: { enabled?: boolean; capture?: boolean } = {}) => ({
  state: { ...createSessionState({ sessionId: 's', rootPath: '/r' }), enabled: overrides.enabled ?? true },
  config: { enabled: true, capture: overrides.capture ?? true, spawnTimeoutMs: 1000, logLevel: 'silent' as const },
  paths,
  logger: log
});

describe('capture', () => {
  beforeEach(() => vi.clearAllMocks());

  it('captureUserMessage ignores assistant messages', () => {
    captureUserMessage({ message: { role: 'assistant', content: 'hi' } }, captureCtx());
    expect(runHookFireAndForget).not.toHaveBeenCalled();
  });

  it('captureUserMessage sends session-init hook with prompt for user role', () => {
    captureUserMessage({ message: { role: 'user', content: 'do X' } }, captureCtx());
    expect(runHookFireAndForget).toHaveBeenCalledWith(
      paths, 'pi', 'session-init',
      expect.objectContaining({ sessionId: 's', cwd: '/r', prompt: 'do X' }),
      expect.anything()
    );
  });

  it('captureToolResult sends observation hook with tool fields', () => {
    captureToolResult({ tool: { name: 'Read' }, input: { path: '/x' }, output: 'content' }, captureCtx());
    expect(runHookFireAndForget).toHaveBeenCalledWith(
      paths, 'pi', 'observation',
      expect.objectContaining({ sessionId: 's', cwd: '/r', toolName: 'Read' }),
      expect.anything()
    );
  });

  it('captureAgentEnd sends summarize hook', () => {
    captureAgentEnd({}, captureCtx());
    expect(runHookFireAndForget).toHaveBeenCalledWith(
      paths, 'pi', 'summarize',
      expect.objectContaining({ sessionId: 's', cwd: '/r' }),
      expect.anything()
    );
  });

  it('all capture functions no-op when state.enabled=false', () => {
    const ctx = captureCtx({ enabled: false });
    captureUserMessage({ message: { role: 'user', content: 'x' } }, ctx);
    captureToolResult({ tool: { name: 'Read' } }, ctx);
    captureAgentEnd({}, ctx);
    expect(runHookFireAndForget).not.toHaveBeenCalled();
  });

  it('all capture functions no-op when config.capture=false', () => {
    const ctx = captureCtx({ capture: false });
    captureUserMessage({ message: { role: 'user', content: 'x' } }, ctx);
    captureToolResult({ tool: { name: 'Read' } }, ctx);
    captureAgentEnd({}, ctx);
    expect(runHookFireAndForget).not.toHaveBeenCalled();
  });
});
