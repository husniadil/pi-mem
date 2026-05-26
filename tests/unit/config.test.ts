// tests/unit/config.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config.ts';

describe('config', () => {
  it('uses defaults when env empty', () => {
    const cfg = loadConfig({});
    expect(cfg).toEqual({
      enabled: true,
      capture: true,
      spawnTimeoutMs: 30000,
      logLevel: 'warn'
    });
  });

  it('parses PI_MEM_ENABLED=false', () => {
    expect(loadConfig({ PI_MEM_ENABLED: 'false' }).enabled).toBe(false);
    expect(loadConfig({ PI_MEM_ENABLED: 'true' }).enabled).toBe(true);
  });

  it('parses PI_MEM_CAPTURE=false', () => {
    expect(loadConfig({ PI_MEM_CAPTURE: 'false' }).capture).toBe(false);
  });

  it('parses PI_MEM_SPAWN_TIMEOUT_MS', () => {
    expect(loadConfig({ PI_MEM_SPAWN_TIMEOUT_MS: '5000' }).spawnTimeoutMs).toBe(5000);
  });

  it('invalid timeout falls back to default', () => {
    expect(loadConfig({ PI_MEM_SPAWN_TIMEOUT_MS: 'abc' }).spawnTimeoutMs).toBe(30000);
    expect(loadConfig({ PI_MEM_SPAWN_TIMEOUT_MS: '-1' }).spawnTimeoutMs).toBe(30000);
  });

  it('parses PI_MEM_LOG_LEVEL when valid', () => {
    expect(loadConfig({ PI_MEM_LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
  });

  it('invalid log level falls back to warn', () => {
    expect(loadConfig({ PI_MEM_LOG_LEVEL: 'verbose' }).logLevel).toBe('warn');
  });
});
