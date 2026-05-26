// tests/unit/port.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { resolvePort, resolveHost } from '../../src/port.ts';

// Workaround for vitest 3.x ESM namespace spying
vi.mock('node:fs', { spy: true });

describe('port discovery', () => {
  beforeEach(() => { vi.spyOn(fs, 'readFileSync').mockImplementation(() => '{}'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('prefers env CLAUDE_MEM_WORKER_PORT', () => {
    expect(resolvePort({ CLAUDE_MEM_WORKER_PORT: '9999', HOME: '/home/u' })).toBe('9999');
  });

  it('reads flat key from settings.json', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{"CLAUDE_MEM_WORKER_PORT":"8888"}');
    expect(resolvePort({ HOME: '/home/u' })).toBe('8888');
  });

  it('reads nested env block', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{"env":{"CLAUDE_MEM_WORKER_PORT":"7777"}}');
    expect(resolvePort({ HOME: '/home/u' })).toBe('7777');
  });

  it('returns default formula when no env/file', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const r = resolvePort({ HOME: '/home/u' });
    const n = Number.parseInt(r, 10);
    expect(n).toBeGreaterThanOrEqual(37700);
    expect(n).toBeLessThanOrEqual(37799);
  });

  it('falls through on JSON parse error', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('not json');
    const r = resolvePort({ HOME: '/home/u' });
    const n = Number.parseInt(r, 10);
    expect(n).toBeGreaterThanOrEqual(37700);
  });

  it('host: env > settings > default 127.0.0.1', () => {
    expect(resolveHost({ CLAUDE_MEM_WORKER_HOST: '0.0.0.0', HOME: '/home/u' })).toBe('0.0.0.0');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(resolveHost({ HOME: '/home/u' })).toBe('127.0.0.1');
  });
});
