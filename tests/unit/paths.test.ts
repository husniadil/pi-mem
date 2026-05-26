// tests/unit/paths.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { resolvePaths } from '../../src/paths.ts';

vi.mock('node:fs', { spy: true });

describe('paths', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existsMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let readdirMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let statMock: any;

  beforeEach(() => {
    existsMock = vi.spyOn(fs, 'existsSync');
    readdirMock = vi.spyOn(fs, 'readdirSync');
    statMock = vi.spyOn(fs, 'statSync');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers $CLAUDE_PLUGIN_ROOT when set and file exists', () => {
    existsMock.mockImplementation((p: any) => String(p).startsWith('/plugin-root/'));
    const r = resolvePaths({ CLAUDE_PLUGIN_ROOT: '/plugin-root', HOME: '/home/u' });
    expect(r?.workerScript).toBe('/plugin-root/scripts/worker-service.cjs');
    expect(r?.bunRunner).toBe('/plugin-root/scripts/bun-runner.js');
  });

  it('falls back to marketplace when plugin-root missing', () => {
    existsMock.mockImplementation((p: any) => {
      const s = String(p);
      if (s.startsWith('/home/u/.claude/plugins/marketplaces/')) return true;
      return false;
    });
    const r = resolvePaths({ HOME: '/home/u' });
    expect(r?.workerScript).toContain('marketplaces/thedotmack/plugin/scripts/worker-service.cjs');
  });

  it('uses cache version (latest mtime) when multiple exist', () => {
    const cacheBase = '/home/u/.claude/plugins/cache/thedotmack/claude-mem';
    existsMock.mockImplementation((p: any) => {
      const s = String(p);
      return s.startsWith(cacheBase) || s.endsWith('worker-service.cjs') || s.endsWith('bun-runner.js');
    });
    readdirMock.mockReturnValue(['1.0.0', '2.0.0', '1.5.0'] as any);
    statMock.mockImplementation((p: any) => {
      const s = String(p);
      const v = s.split('/').pop()!;
      const map: Record<string, number> = { '1.0.0': 100, '2.0.0': 300, '1.5.0': 200 };
      return { mtimeMs: map[v] ?? 0 } as any;
    });
    const r = resolvePaths({ HOME: '/home/u' });
    expect(r?.workerScript).toContain('cache/thedotmack/claude-mem/2.0.0/plugin/scripts/worker-service.cjs');
  });

  it('respects $CLAUDE_CONFIG_DIR override', () => {
    existsMock.mockImplementation((p: any) => String(p).startsWith('/custom/'));
    const r = resolvePaths({ CLAUDE_CONFIG_DIR: '/custom', HOME: '/home/u' });
    expect(r?.workerScript).toContain('/custom/plugins/marketplaces/thedotmack/');
  });

  it('returns null when nothing found', () => {
    existsMock.mockReturnValue(false);
    const r = resolvePaths({ HOME: '/home/u' });
    expect(r).toBeNull();
  });

  it('skips candidate if bun-runner missing in same dir', () => {
    existsMock.mockImplementation((p: any) => {
      const s = String(p);
      // worker exists but bun-runner does not
      return s.endsWith('worker-service.cjs');
    });
    const r = resolvePaths({ HOME: '/home/u' });
    expect(r).toBeNull();
  });
});
