// tests/unit/preflight.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { runPreflight } from '../../src/preflight.ts';
import { createLogger } from '../../src/logger.ts';

// Workaround for vitest 3.x ESM namespace spying
vi.mock('node:fs', { spy: true });

const log = createLogger('silent');

vi.mock('../../src/worker.ts', () => ({
  runStart: vi.fn().mockResolvedValue(undefined),
  runHook: vi.fn(),
  runHookFireAndForget: vi.fn()
}));

import { runStart } from '../../src/worker.ts';

describe('preflight', () => {
  beforeEach(() => { vi.restoreAllMocks(); (runStart as any).mockResolvedValue(undefined); });

  it('returns disabled when worker paths unresolvable', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const r = await runPreflight({ env: { HOME: '/home/u' }, logger: log, timeoutMs: 60000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('not installed');
    expect(r.paths).toBeNull();
  });

  it('returns disabled when claude-mem package.json missing', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      const s = String(p);
      return s.endsWith('worker-service.cjs') || s.endsWith('bun-runner.js');
    });
    const r = await runPreflight({ env: { HOME: '/home/u' }, logger: log, timeoutMs: 60000 });
    expect(r.ok).toBe(false);
  });

  it('returns disabled when claude-mem major !== 13', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{"version":"12.4.0"}');
    const r = await runPreflight({ env: { HOME: '/home/u' }, logger: log, timeoutMs: 60000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('12.4.0');
  });

  it('returns disabled when worker start fails', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{"version":"13.3.0"}');
    (runStart as any).mockRejectedValue(new Error('exit 1: boom'));
    const r = await runPreflight({ env: { HOME: '/home/u' }, logger: log, timeoutMs: 60000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('failed to start');
  });

  it('returns ok with paths when all checks pass', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{"version":"13.3.0"}');
    const r = await runPreflight({ env: { HOME: '/home/u' }, logger: log, timeoutMs: 60000 });
    expect(r.ok).toBe(true);
    expect(r.paths).not.toBeNull();
  });
});
