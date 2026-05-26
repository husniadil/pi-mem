// tests/unit/worker.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import * as cp from 'node:child_process';
import { runHook, runHookFireAndForget, runStart } from '../../src/worker.ts';
import { createLogger } from '../../src/logger.ts';

// Workaround for vitest 3.x ESM namespace spying
vi.mock('node:child_process', { spy: true });

function makeChild(opts: { code?: number; stdout?: string; stderr?: string; delayMs?: number } = {}) {
  const child = new EventEmitter() as any;
  child.stdin = { end: vi.fn(), write: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.unref = vi.fn();
  child.kill = vi.fn();
  setTimeout(() => {
    if (opts.stdout) child.stdout.emit('data', Buffer.from(opts.stdout));
    child.stdout.emit('end');
    if (opts.stderr) child.stderr.emit('data', Buffer.from(opts.stderr));
    child.stderr.emit('end');
    child.emit('exit', opts.code ?? 0);
    child.emit('close', opts.code ?? 0);
  }, opts.delayMs ?? 5);
  return child;
}

const PATHS = {
  workerScript: '/p/scripts/worker-service.cjs',
  bunRunner: '/p/scripts/bun-runner.js',
  pluginDir: '/p'
};
const log = createLogger('silent');

describe('worker', () => {
  let spawnMock: any;
  beforeEach(() => {
    spawnMock = vi.spyOn(cp, 'spawn');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runHook resolves with parsed JSON on success', async () => {
    spawnMock.mockReturnValue(makeChild({ stdout: '{"hookSpecificOutput":{"additionalContext":"hi"}}' }) as any);
    const r = await runHook(PATHS, 'pi', 'context', { sessionId: 'x', cwd: '/c' }, { timeoutMs: 1000, logger: log });
    expect(r?.hookSpecificOutput?.additionalContext).toBe('hi');
  });

  it('runHook spawn args: node bun-runner worker hook pi <cmd>', async () => {
    spawnMock.mockReturnValue(makeChild({ stdout: '{}' }) as any);
    await runHook(PATHS, 'pi', 'context', {}, { timeoutMs: 1000, logger: log });
    const [bin, args] = spawnMock.mock.calls[0]!;
    expect(bin).toBe('node');
    expect(args).toEqual([PATHS.bunRunner, PATHS.workerScript, 'hook', 'pi', 'context']);
  });

  it('runHook closes stdin with payload JSON', async () => {
    const child = makeChild({ stdout: '{}' });
    spawnMock.mockReturnValue(child as any);
    await runHook(PATHS, 'pi', 'context', { foo: 'bar' }, { timeoutMs: 1000, logger: log });
    expect(child.stdin.end).toHaveBeenCalledWith(JSON.stringify({ foo: 'bar' }));
  });

  it('runHook rejects on non-zero exit', async () => {
    spawnMock.mockReturnValue(makeChild({ code: 1, stderr: 'boom' }) as any);
    await expect(runHook(PATHS, 'pi', 'context', {}, { timeoutMs: 1000, logger: log })).rejects.toThrow(/exit 1/);
  });

  it('runHook times out and force-kills', async () => {
    spawnMock.mockReturnValue(makeChild({ delayMs: 5000 }) as any);
    await expect(runHook(PATHS, 'pi', 'context', {}, { timeoutMs: 50, logger: log })).rejects.toThrow(/timed out/);
  });

  it('runHook tolerates non-JSON stdout (returns empty object)', async () => {
    spawnMock.mockReturnValue(makeChild({ stdout: 'not json' }) as any);
    const r = await runHook(PATHS, 'pi', 'context', {}, { timeoutMs: 1000, logger: log });
    expect(r).toEqual({});
  });

  it('runHookFireAndForget calls unref() and does not throw on failure', () => {
    const child = makeChild({ code: 1 });
    spawnMock.mockReturnValue(child as any);
    expect(() => runHookFireAndForget(PATHS, 'pi', 'observation', {}, { timeoutMs: 1000, logger: log })).not.toThrow();
    expect(child.unref).toHaveBeenCalled();
  });

  it('runHookFireAndForget unrefs the timeout timer so process can exit cleanly', () => {
    const originalSetTimeout = globalThis.setTimeout;
    let capturedTimer: NodeJS.Timeout | null = null;
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, ms: any) => {
      const t = originalSetTimeout(fn, ms);
      capturedTimer = t;
      vi.spyOn(t as any, 'unref');
      return t;
    });
    const child = makeChild({ code: 0 });
    spawnMock.mockReturnValue(child as any);
    runHookFireAndForget(PATHS, 'pi', 'observation', {}, { timeoutMs: 1000, logger: log });
    expect(capturedTimer).not.toBeNull();
    expect((capturedTimer as any).unref).toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  it('runStart spawns node bun-runner worker start', async () => {
    spawnMock.mockReturnValue(makeChild({ code: 0 }) as any);
    await runStart(PATHS, { timeoutMs: 60000, logger: log });
    const [bin, args] = spawnMock.mock.calls[0]!;
    expect(bin).toBe('node');
    expect(args).toEqual([PATHS.bunRunner, PATHS.workerScript, 'start']);
  });

  it('runStart rejects on non-zero exit', async () => {
    spawnMock.mockReturnValue(makeChild({ code: 2, stderr: 'fail' }) as any);
    await expect(runStart(PATHS, { timeoutMs: 1000, logger: log })).rejects.toThrow(/exit 2/);
  });
});
