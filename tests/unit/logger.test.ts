// tests/unit/logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger } from '../../src/logger.ts';

describe('logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('respects log level (warn skips info)', () => {
    const log = createLogger('warn');
    log.info('hidden');
    log.warn('shown');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('shown'));
  });

  it('silent suppresses all', () => {
    const log = createLogger('silent');
    log.error('e'); log.warn('w'); log.info('i'); log.debug('d');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('redacts Bearer tokens', () => {
    const log = createLogger('debug');
    log.warn('Authorization: Bearer abc123xyz');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Bearer [REDACTED]'));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('abc123xyz'));
  });

  it('prefixes with [pi-mem]', () => {
    const log = createLogger('info');
    log.info('hi');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[pi-mem]'));
  });
});
